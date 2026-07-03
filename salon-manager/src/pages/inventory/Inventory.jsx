import { useState } from 'react'
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useCollection } from '../../hooks/useCollection'
import PageHeader from '../../components/PageHeader'
import toast from 'react-hot-toast'

const CATEGORIES = ['Hair care', 'Skin care', 'Nail care', 'Tools & equipment', 'Consumables', 'Retail products']
const EMPTY = { name: '', category: '', sku: '', quantity: '', reorderLevel: '5', unit: 'units', costPrice: '' }

export default function Inventory() {
  const { docs: items, loading } = useCollection('inventory', 'name')
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [filter, setFilter]       = useState('all')

  const lowStock = items.filter((i) => Number(i.quantity) <= Number(i.reorderLevel ?? 5))

  const filtered = filter === 'low'
    ? lowStock
    : filter === 'all'
    ? items
    : items.filter((i) => i.category === filter)

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await addDoc(collection(db, 'inventory'), {
        ...form,
        quantity: Number(form.quantity),
        reorderLevel: Number(form.reorderLevel),
        costPrice: Number(form.costPrice),
        createdAt: serverTimestamp(),
      })
      toast.success('Item added')
      setForm(EMPTY)
      setShowForm(false)
    } catch {
      toast.error('Failed to save item')
    } finally {
      setSaving(false)
    }
  }

  async function adjustStock(id, delta) {
    const item = items.find((i) => i.id === id)
    const newQty = Math.max(0, (item?.quantity ?? 0) + delta)
    await updateDoc(doc(db, 'inventory', id), { quantity: newQty })
    toast.success('Stock updated')
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Inventory"
        subtitle={`${items.length} items · ${lowStock.length} low stock`}
        action={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Add item
          </button>
        }
      />

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          ⚠ {lowStock.length} item{lowStock.length > 1 ? 's' : ''} below reorder level:{' '}
          {lowStock.map((i) => i.name).join(', ')}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {['all', 'low', ...CATEGORIES].map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === cat ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {cat === 'all' ? 'All' : cat === 'low' ? `⚠ Low stock (${lowStock.length})` : cat}
          </button>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card mb-6 border-brand-200">
          <p className="text-sm font-medium text-gray-800 mb-4">Add inventory item</p>
          <form onSubmit={handleSave} className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
              <input className="input" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select className="input" value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">Select</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">SKU</label>
              <input className="input" value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Quantity *</label>
              <input className="input" type="number" min="0" required value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Reorder level</label>
              <input className="input" type="number" min="0" value={form.reorderLevel}
                onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Unit</label>
              <input className="input" value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cost price (₹)</label>
              <input className="input" type="number" min="0" value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
            </div>
            <div className="col-span-3 flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Add item'}
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
                {['Name', 'Category', 'SKU', 'Quantity', 'Reorder at', 'Cost price', 'Adjust'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">No items found</td></tr>
              )}
              {filtered.map((item) => {
                const isLow = Number(item.quantity) <= Number(item.reorderLevel ?? 5)
                return (
                  <tr key={item.id} className={`hover:bg-gray-50 ${isLow ? 'bg-amber-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                    <td className="px-4 py-3 text-gray-600">{item.category || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{item.sku || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={isLow ? 'badge-red' : 'badge-green'}>
                        {item.quantity} {item.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.reorderLevel ?? 5}</td>
                    <td className="px-4 py-3 text-gray-600">₹{item.costPrice ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => adjustStock(item.id, -1)}
                          className="w-6 h-6 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 text-xs">−</button>
                        <button onClick={() => adjustStock(item.id, 1)}
                          className="w-6 h-6 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 text-xs">+</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
