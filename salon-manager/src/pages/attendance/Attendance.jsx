import { useState } from 'react'
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useCollection } from '../../hooks/useCollection'
import PageHeader from '../../components/PageHeader'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const SHIFT_TYPES = ['Morning', 'Afternoon', 'Full day', 'Half day']

export default function Attendance() {
  const { docs: employees } = useCollection('employees', 'name')
  const { docs: records, loading } = useCollection('attendance', 'date')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving, setSaving] = useState(false)

  const todayRecords = records.filter(
    (r) => r.date?.toDate ? format(r.date.toDate(), 'yyyy-MM-dd') === date : false
  )

  const markedIds = new Set(todayRecords.map((r) => r.employeeId))

  async function markAttendance(emp, status, shift = 'Full day') {
    if (markedIds.has(emp.id)) { toast.error('Already marked for this date'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'attendance'), {
        employeeId: emp.id,
        employeeName: emp.name,
        date: Timestamp.fromDate(new Date(date)),
        status,
        shift,
        createdAt: serverTimestamp(),
      })
      toast.success(`${emp.name} marked as ${status}`)
    } catch {
      toast.error('Failed to mark attendance')
    } finally {
      setSaving(false)
    }
  }

  const present = todayRecords.filter((r) => r.status === 'present').length
  const absent  = todayRecords.filter((r) => r.status === 'absent').length

  return (
    <div className="p-6">
      <PageHeader
        title="Attendance"
        subtitle={`${present} present · ${absent} absent · ${employees.length - todayRecords.length} unmarked`}
      />

      {/* Date picker */}
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-medium text-gray-700">Date</label>
        <input
          type="date"
          className="input w-44"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-2xl font-semibold text-green-600">{present}</p>
          <p className="text-xs text-gray-500 mt-1">Present</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-semibold text-red-600">{absent}</p>
          <p className="text-xs text-gray-500 mt-1">Absent</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-semibold text-gray-600">{employees.length - todayRecords.length}</p>
          <p className="text-xs text-gray-500 mt-1">Unmarked</p>
        </div>
      </div>

      {/* Employee list */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Employee', 'Role', 'Status', 'Shift', 'Actions'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {employees.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">No employees found</td></tr>
            )}
            {employees.map((emp) => {
              const record = todayRecords.find((r) => r.employeeId === emp.id)
              return (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{emp.role}</td>
                  <td className="px-4 py-3">
                    {record ? (
                      <span className={record.status === 'present' ? 'badge-green' : 'badge-red'}>
                        {record.status}
                      </span>
                    ) : (
                      <span className="badge-yellow">unmarked</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{record?.shift ?? '—'}</td>
                  <td className="px-4 py-3">
                    {!record && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => markAttendance(emp, 'present', 'Full day')}
                          disabled={saving}
                          className="px-2 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 transition-colors"
                        >
                          Present
                        </button>
                        <button
                          onClick={() => markAttendance(emp, 'absent')}
                          disabled={saving}
                          className="px-2 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100 transition-colors"
                        >
                          Absent
                        </button>
                        <button
                          onClick={() => markAttendance(emp, 'present', 'Half day')}
                          disabled={saving}
                          className="px-2 py-1 text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 rounded hover:bg-yellow-100 transition-colors"
                        >
                          Half day
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
