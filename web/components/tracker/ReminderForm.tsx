'use client'

import { useState, useEffect } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { apiFetch } from '@/lib/api'

type ReminderType = 'interview' | 'followup' | 'deadline' | 'custom'

interface Reminder {
  id: string
  reminder_type: ReminderType
  remind_at: string
  message: string | null
  is_sent: boolean
}

const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  interview: 'Interview',
  followup:  'Follow-up',
  deadline:  'Deadline',
  custom:    'Custom',
}

interface ReminderFormProps {
  applicationId: string
}

function toDatetimeLocal(iso: string): string {
  return iso.slice(0, 16)
}

export function ReminderForm({ applicationId }: ReminderFormProps) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<{
    reminder_type: ReminderType
    remind_at: string
    message: string
  }>({ reminder_type: 'interview', remind_at: '', message: '' })

  useEffect(() => {
    setLoading(true)
    apiFetch<Reminder[]>(`/applications/reminders?application_id=${applicationId}`)
      .then(setReminders)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [applicationId])

  async function handleAdd() {
    if (!form.remind_at) return
    setSaving(true)
    try {
      const reminder = await apiFetch<Reminder>('/applications/reminders', {
        method: 'POST',
        body: JSON.stringify({
          job_application_id: applicationId,
          reminder_type: form.reminder_type,
          remind_at: new Date(form.remind_at).toISOString(),
          message: form.message || undefined,
        }),
      })
      setReminders((prev) => [...prev, reminder])
      setForm({ reminder_type: 'interview', remind_at: '', message: '' })
      setShowForm(false)
    } catch {
      // fail silently
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(reminderId: string) {
    setReminders((prev) => prev.filter((r) => r.id !== reminderId))
    try {
      await apiFetch(`/applications/reminders/${reminderId}`, { method: 'DELETE' })
    } catch {
      // fail silently
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <div
          className="font-mono text-xs font-semibold tracking-widest"
          style={{ color: '#6b7280' }}
        >
          REMINDERS
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 text-xs transition-colors"
          style={{ color: '#8b5cf6' }}
        >
          <Plus size={12} />
          add
        </button>
      </div>

      {loading ? (
        <div className="text-xs" style={{ color: '#4b5563' }}>Loading…</div>
      ) : (
        <div className="flex flex-col gap-2 mb-2">
          {reminders.length === 0 && !showForm && (
            <div className="text-xs" style={{ color: '#4b5563' }}>No reminders set.</div>
          )}
          {reminders.map((r) => (
            <div
              key={r.id}
              className="group flex items-start justify-between gap-2 rounded-lg px-3 py-2"
              style={{
                background: r.is_sent ? '#0f0c1a' : '#13101f',
                border: r.is_sent
                  ? '1px solid rgba(139,92,246,0.08)'
                  : '1px solid rgba(251,191,36,0.2)',
              }}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="text-xs font-mono"
                  style={{ color: r.is_sent ? '#4b5563' : '#fbbf24' }}
                >
                  {REMINDER_TYPE_LABELS[r.reminder_type]}
                  {r.is_sent && ' · sent'}
                </div>
                <div className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                  {new Date(r.remind_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </div>
                {r.message && (
                  <div className="text-xs mt-0.5 truncate" style={{ color: '#94a3b8' }}>
                    {r.message}
                  </div>
                )}
              </div>
              {!r.is_sent && (
                <button
                  onClick={() => handleDelete(r.id)}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                  style={{ color: '#4b5563' }}
                  aria-label="Delete reminder"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div
          className="rounded-lg p-3 flex flex-col gap-2.5"
          style={{ background: '#13101f', border: '1px solid rgba(139,92,246,0.2)' }}
        >
          <select
            value={form.reminder_type}
            onChange={(e) => setForm((f) => ({ ...f, reminder_type: e.target.value as ReminderType }))}
            className="text-xs rounded-md px-2 py-1.5 outline-none"
            style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.2)', color: '#e2e8f0', colorScheme: 'dark' }}
          >
            {(Object.keys(REMINDER_TYPE_LABELS) as ReminderType[]).map((t) => (
              <option key={t} value={t}>{REMINDER_TYPE_LABELS[t]}</option>
            ))}
          </select>

          <input
            type="datetime-local"
            value={form.remind_at}
            onChange={(e) => setForm((f) => ({ ...f, remind_at: e.target.value }))}
            className="text-xs rounded-md px-2 py-1.5 outline-none"
            style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.2)', color: '#e2e8f0', colorScheme: 'dark' }}
          />

          <input
            type="text"
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            placeholder="Message (optional)"
            className="text-xs rounded-md px-2 py-1.5 outline-none"
            style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.2)', color: '#e2e8f0' }}
          />

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="text-xs px-3 py-1 rounded-md transition-colors"
              style={{ color: '#6b7280' }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !form.remind_at}
              className="text-xs px-3 py-1 rounded-md font-mono transition-all duration-150"
              style={{
                background: saving || !form.remind_at ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.2)',
                border: '1px solid rgba(139,92,246,0.3)',
                color: saving || !form.remind_at ? '#4b5563' : '#a78bfa',
              }}
            >
              {saving ? 'Saving…' : 'Set Reminder'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
