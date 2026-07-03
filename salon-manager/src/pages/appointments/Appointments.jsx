import { useState } from 'react'
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useCollection } from '../../hooks/useCollection'
import PageHeader from '../../components/PageHeader'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_BADGE = {
  scheduled: 'badge-blue',
  completed: 'badge-green',
  cancelled: 'badge-red',
  'no-show':  'badge-yellow',
}

const SERVICES = ['Haircut', 'Hair colour', 'Blowdry', 'Facial', 'Manicure', 'Pedicure', 'Threading', 'Waxing', 'Massage']
const EMPTY = { customerName: '', customerPhone: '', service: '', stylist: '', date: '', time: '', notes: '' }

export default function Appointments() {
  const { docs: appointments, loading } = useCollection('appointments', 'date')
  const { docs: employees } = useCollection('employees', 'name')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('all')

  const stylists = employees.filter((e) => e.role === 'stylist' || e.role === 'staff')

  const filtered = appointments.filter((a) =>
    filter === 'all' ? true : a.status === filter
  )

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const dateTime = new Date(`${form.date}T${form.time}`)
      await addDoc(collection(db, 'appointments'), {
        ...form,
        date: Timestamp.fromDate(dateTime),
        status: 'scheduled',
        createdAt: serverTimestamp(),
      })
      toast.success('Appointment booked')
      setForm(EMPTY)
      setShowForm(false)
    } catch {
      toast.error('Failed to book appointment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Appointments"
        subtitle={`${appointments.length} total`}
        action={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Book appointment
          </button>
        }
      />

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {['all', 'scheduled', 'completed', 'cancelled', 'no-show'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === s ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card mb-6 border-brand-200">
          <p className="text-sm font-medium text-gray-800 mb-4">Book appointment</p>
          <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Customer name *</label>
              <input className="input" required value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone *</label>
              <input className="input" required value={form.customerPhone}
                onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Service *</label>
              <select className="input" required value={form.service}
                onChange={(e) => setForm({ ...form, service: e.target.value })}>
                <option value="">Select service</option>
                {SERVICES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Stylist</label>
              <select className="input" value={form.stylist}
                onChange={(e) => setForm({ ...form, stylist: e.target.value })}>
                <option value="">Any available</option>
                {stylists.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
              <input className="input" type="date" required value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Time *</label>
              <input className="input" type="time" required value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <input className="input" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Book appointment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Customer', 'Phone', 'Service', 'Stylist', 'Date & time', 'Status'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">No appointments found</td></tr>
              )}
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.customerName}</td>
                  <td className="px-4 py-3 text-gray-600">{a.customerPhone}</td>
                  <td className="px-4 py-3 text-gray-600">{a.service}</td>
                  <td className="px-4 py-3 text-gray-600">{a.stylist || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {a.date?.toDate ? format(a.date.toDate(), 'dd MMM, h:mm a') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={STATUS_BADGE[a.status] ?? 'badge-blue'}>{a.status}</span>
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
