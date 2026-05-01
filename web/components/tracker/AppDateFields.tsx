'use client'

import { useState } from 'react'
import { apiFetch } from '@/lib/api'
import type { TrackerApplication } from '@/app/(app)/tracker/page'

interface AppDateFieldsProps {
  application: TrackerApplication
  onUpdate: (updated: Partial<TrackerApplication>) => void
}

interface DateField {
  key: keyof Pick<TrackerApplication, 'applied_at' | 'interview_date' | 'follow_up_date'>
  label: string
}

const DATE_FIELDS: DateField[] = [
  { key: 'applied_at', label: 'Applied' },
  { key: 'interview_date', label: 'Interview' },
  { key: 'follow_up_date', label: 'Follow-up' },
]

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  // datetime-local inputs want YYYY-MM-DDTHH:mm
  return iso.slice(0, 16)
}

function toIsoString(local: string): string | null {
  if (!local) return null
  return new Date(local).toISOString()
}

export function AppDateFields({ application, onUpdate }: AppDateFieldsProps) {
  const [saving, setSaving] = useState<string | null>(null)

  async function handleBlur(key: DateField['key'], value: string) {
    const isoValue = toIsoString(value)
    if (isoValue === application[key]) return
    setSaving(key)
    try {
      await apiFetch(`/applications/${application.id}`, {
        method: 'PUT',
        body: JSON.stringify({ [key]: isoValue }),
      })
      onUpdate({ [key]: isoValue })
    } catch {
      // silently ignore — field reverts to original on re-render
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="px-4 py-3">
      <div
        className="font-mono text-xs font-semibold tracking-widest mb-3"
        style={{ color: '#6b7280' }}
      >
        DATES
      </div>
      <div className="flex flex-col gap-2.5">
        {DATE_FIELDS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: '#94a3b8', width: 64 }}>
              {label}
            </span>
            <input
              type="datetime-local"
              defaultValue={toDatetimeLocal(application[key])}
              onBlur={(e) => handleBlur(key, e.target.value)}
              disabled={saving === key}
              className="flex-1 text-xs rounded-md px-2 py-1 outline-none transition-all duration-150"
              style={{
                background: '#13101f',
                border: '1px solid rgba(139,92,246,0.2)',
                color: saving === key ? '#4b5563' : '#e2e8f0',
                colorScheme: 'dark',
              }}
            />
          </div>
        ))}

        {/* Offer amount */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs flex-shrink-0" style={{ color: '#94a3b8', width: 64 }}>
            Offer $
          </span>
          <input
            type="number"
            defaultValue={application.offer_amount ?? ''}
            placeholder="amount"
            onBlur={async (e) => {
              const val = e.target.value ? parseInt(e.target.value, 10) : null
              if (val === application.offer_amount) return
              try {
                await apiFetch(`/applications/${application.id}`, {
                  method: 'PUT',
                  body: JSON.stringify({ offer_amount: val }),
                })
                onUpdate({ offer_amount: val })
              } catch {
                // silently ignore
              }
            }}
            className="flex-1 text-xs rounded-md px-2 py-1 outline-none"
            style={{
              background: '#13101f',
              border: '1px solid rgba(139,92,246,0.2)',
              color: '#e2e8f0',
            }}
          />
        </div>
      </div>
    </div>
  )
}
