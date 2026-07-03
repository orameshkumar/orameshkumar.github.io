import { useState } from 'react'
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useCollection } from '../../hooks/useCollection'
import PageHeader from '../../components/PageHeader'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const SERVICES = [
  { name: 'Haircut',    price: 300 },
  { name: 'Hair colour',price: 1200 },
  { name: 'Blowdry',   price: 400 },
  { name: 'Facial',    price: 800 },
  { name: 'Manicure',  price: 500 },
  { name: 'Pedicure',  price: 600 },
  { name: 'Threading', price: 100 },
  { name: 'Waxing',    price: 700 },
  { name: 'Massage',   price: 1500 },
]

const PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Wallet']

export default function Billing() {
  const { docs: invoices, loading } = useCollection('invoices')
  const { docs: customers } = useCollection('customers', 'name')

  const [showForm, setShowForm]     = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [selectedServices, setSelectedServices] = useState([])
  const [discount, setDiscount]     = useState(0)
  const [paymentMode, setPaymentMode] = useState('Cash')
  const [saving, setSaving]         = useState(false)

  const subtotal = selectedServices.reduce((s, i) => s + i.price, 0)
  const total    = Math.max(0, subtotal - Number(discount))

  function toggleService(svc) {
    setSelectedServices((prev) =>
      prev.find((s) => s.name === svc.name)
        ? prev.filter((s) => s.name !== svc.name)
        : [...prev, svc]
    )
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!selectedServices.length) { toast.error('Select at least one service'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'invoices'), {
        customerName,
        customerId: customerId || null,
        services: selectedServices,
        subtotal,
        discount: Number(discount),
        total,
        paymentMode,
        status: 'paid',
        createdAt: serverTimestamp(),
      })
      // Update customer visit count and loyalty points if linked
      if (customerId) {
        await updateDoc(doc(db, 'customers', customerId), {
          totalVisits: increment(1),
          loyaltyPoints: increment(Math.floor(total / 100)),
        })
      }
      toast.success('Invoice created')
      setCustomerName('')
      setCustomerId('')
      setSelectedServices([])
      setDiscount(0)
      setPaymentMode('Cash')
      setShowForm(false)
    } catch {
      toast.error('Failed to create invoice')
    } finally {
      setSaving(false)
    }
  }

  const todayRevenue = invoices
    .filter((i) => {
      const d = i.createdAt?.toDate?.()
      return d && format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
    })
    .reduce((s, i) => s + (i.total ?? 0), 0)

  return (
    <div className="p-6">
      <PageHeader
        title="Billing"
        subtitle={`Today's revenue: ₹${todayRevenue.toLocaleString()}`}
        action={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + New invoice
          </button>
        }
      />

      {/* Invoice form */}
      {showForm && (
        <div className="card mb-6 border-brand-200">
          <p className="text-sm font-medium text-gray-800 mb-4">New invoice</p>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Customer name *</label>
                <input className="input" required value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Link to customer (optional)</label>
                <select className="input" value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value)
                    const c = customers.find((x) => x.id === e.target.value)
                    if (c) setCustomerName(c.name)
                  }}>
                  <option value="">Walk-in / unlinked</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Services *</label>
              <div className="grid grid-cols-3 gap-2">
                {SERVICES.map((svc) => {
                  const selected = selectedServices.some((s) => s.name === svc.name)
                  return (
                    <button
                      key={svc.name}
                      type="button"
                      onClick={() => toggleService(svc)}
                      className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                        selected
                          ? 'bg-brand-50 border-brand-400 text-brand-700 font-medium'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="block">{svc.name}</span>
                      <span className="text-gray-500">₹{svc.price}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Discount (₹)</label>
                <input className="input" type="number" min="0" value={discount}
                  onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Payment mode</label>
                <select className="input" value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}>
                  {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="card bg-brand-50 border-brand-200 text-right">
                <p className="text-xs text-gray-500">Subtotal: ₹{subtotal}</p>
                <p className="text-xs text-gray-500">Discount: ₹{discount}</p>
                <p className="text-base font-semibold text-brand-700">Total: ₹{total}</p>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Creating…' : 'Create invoice'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Invoices table */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Customer', 'Services', 'Subtotal', 'Discount', 'Total', 'Payment', 'Date'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">No invoices yet</td></tr>
              )}
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{inv.customerName}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{inv.services?.map((s) => s.name).join(', ')}</td>
                  <td className="px-4 py-3 text-gray-600">₹{inv.subtotal}</td>
                  <td className="px-4 py-3 text-gray-600">₹{inv.discount}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">₹{inv.total}</td>
                  <td className="px-4 py-3"><span className="badge-blue">{inv.paymentMode}</span></td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {inv.createdAt?.toDate ? format(inv.createdAt.toDate(), 'dd MMM, h:mm a') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
