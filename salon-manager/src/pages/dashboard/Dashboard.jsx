import { useEffect, useState } from 'react'
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import { format, startOfDay, endOfDay } from 'date-fns'

export default function Dashboard() {
  const [stats, setStats] = useState({ appointments: 0, revenue: 0, newCustomers: 0, lowStock: 0 })
  const today = new Date()

  useEffect(() => {
    async function loadStats() {
      const start = Timestamp.fromDate(startOfDay(today))
      const end   = Timestamp.fromDate(endOfDay(today))

      const [apptSnap, invoiceSnap, custSnap, stockSnap] = await Promise.all([
        getDocs(query(collection(db, 'appointments'),
          where('date', '>=', start), where('date', '<=', end))),
        getDocs(query(collection(db, 'invoices'),
          where('createdAt', '>=', start), where('createdAt', '<=', end))),
        getDocs(query(collection(db, 'customers'),
          where('createdAt', '>=', start), where('createdAt', '<=', end))),
        getDocs(query(collection(db, 'inventory'), where('quantity', '<=', 5))),
      ])

      const revenue = invoiceSnap.docs.reduce((sum, d) => sum + (d.data().total ?? 0), 0)

      setStats({
        appointments: apptSnap.size,
        revenue,
        newCustomers: custSnap.size,
        lowStock: stockSnap.size,
      })
    }
    loadStats()
  }, [])

  return (
    <div className="p-6">
      <PageHeader
        title="Dashboard"
        subtitle={format(today, 'EEEE, d MMMM yyyy')}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Today's appointments" value={stats.appointments} color="brand" />
        <StatCard label="Today's revenue"       value={`₹${stats.revenue.toLocaleString()}`} color="green" />
        <StatCard label="New customers"         value={stats.newCustomers} color="blue" />
        <StatCard label="Low stock alerts"      value={stats.lowStock} color="amber" sub="items below 5 units" />
      </div>

      <div className="card">
        <p className="text-sm font-medium text-gray-700 mb-4">Quick actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'New appointment', href: '/appointments', emoji: '📅' },
            { label: 'New customer',    href: '/customers',    emoji: '👤' },
            { label: 'New invoice',     href: '/billing',      emoji: '🧾' },
            { label: 'Mark attendance', href: '/attendance',   emoji: '🕐' },
          ].map(({ label, href, emoji }) => (
            <a
              key={href}
              href={href}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-brand-300 hover:bg-brand-50 transition-colors text-center"
            >
              <span className="text-2xl">{emoji}</span>
              <span className="text-xs font-medium text-gray-700">{label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
