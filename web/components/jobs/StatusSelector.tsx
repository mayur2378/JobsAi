'use client'

import { useState } from 'react'
import { apiFetch } from '@/lib/api'

export type AppStatus = 'saved' | 'dismissed' | 'applied' | 'interviewing' | 'offer' | 'rejected'

interface StatusSelectorProps {
  jobId: string
  initialStatus: AppStatus | null
}

const STATUS_OPTIONS: { value: AppStatus; label: string }[] = [
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'dismissed', label: 'Dismissed' },
]

const STATUS_STYLES: Record<AppStatus, { bg: string; color: string; border: string }> = {
  saved:        { bg: 'rgba(139,92,246,0.12)',  color: '#a78bfa', border: 'rgba(139,92,246,0.3)' },
  applied:      { bg: 'rgba(52,211,153,0.1)',   color: '#34d399', border: 'rgba(52,211,153,0.3)' },
  interviewing: { bg: 'rgba(251,191,36,0.1)',   color: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
  offer:        { bg: 'rgba(52,211,153,0.15)',  color: '#34d399', border: 'rgba(52,211,153,0.4)' },
  rejected:     { bg: 'rgba(100,116,139,0.1)',  color: '#64748b', border: 'rgba(100,116,139,0.25)' },
  dismissed:    { bg: 'rgba(100,116,139,0.08)', color: '#475569', border: 'rgba(100,116,139,0.2)' },
}

export function StatusSelector({ jobId, initialStatus }: StatusSelectorProps) {
  const [status, setStatus] = useState<AppStatus | null>(initialStatus)
  const [saving, setSaving] = useState(false)

  async function handleChange(newStatus: AppStatus) {
    if (newStatus === status) return
    setSaving(true)
    try {
      await apiFetch(`/jobs/${jobId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      setStatus(newStatus)
    } catch (err) {
      console.error('StatusSelector: failed to update status', err)
      // status stays unchanged — user sees no change (non-fatal)
    } finally {
      setSaving(false)
    }
  }

  const style = status ? STATUS_STYLES[status] : null

  return (
    <select
      value={status ?? ''}
      onChange={(e) => handleChange(e.target.value as AppStatus)}
      disabled={saving}
      aria-label="Application status"
      className="h-9 px-3 rounded-lg text-xs font-mono outline-none cursor-pointer transition-all duration-150"
      style={{
        background: style?.bg ?? '#0f0c1a',
        border: `1px solid ${style?.border ?? 'rgba(139,92,246,0.25)'}`,
        color: style?.color ?? '#64748b',
        opacity: saving ? 0.6 : 1,
      }}
    >
      <option value="" style={{ background: '#0f0c1a', color: '#64748b' }} disabled>
        Track status…
      </option>
      {STATUS_OPTIONS.map(({ value, label }) => (
        <option key={value} value={value} style={{ background: '#0f0c1a', color: '#e2e8f0' }}>
          {label}
        </option>
      ))}
    </select>
  )
}
