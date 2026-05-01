'use client'

import { useEffect, useRef } from 'react'
import { X, ExternalLink } from 'lucide-react'
import type { TrackerApplication } from '@/app/(app)/tracker/page'
import { ScoreRing } from '@/components/jobs/ScoreRing'
import { AppDateFields } from './AppDateFields'
import { NotesPanel } from './NotesPanel'
import { ReminderForm } from './ReminderForm'

interface DrawerPanelProps {
  application: TrackerApplication | null
  onClose: () => void
  onUpdate: (updated: Partial<TrackerApplication>) => void
}

const STATUS_LABELS: Record<string, string> = {
  saved: 'Saved', applied: 'Applied', interviewing: 'Interviewing',
  offer: 'Offer', rejected: 'Rejected',
}

const STATUS_COLORS: Record<string, string> = {
  saved: '#a78bfa', applied: '#60a5fa', interviewing: '#fbbf24',
  offer: '#34d399', rejected: '#f87171',
}

export function DrawerPanel({ application, onClose, onUpdate }: DrawerPanelProps) {
  const isOpen = application !== null
  const drawerRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const score = application
    ? (application.match?.refined_score ?? application.match?.match_score ?? 0)
    : 0
  const label = application?.match?.match_label ?? 'low'
  const statusColor = application ? (STATUS_COLORS[application.status] ?? '#a78bfa') : '#a78bfa'

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 h-full z-50 flex flex-col overflow-hidden"
        style={{
          width: 320,
          background: '#0f0c1a',
          borderLeft: '1px solid rgba(139,92,246,0.2)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 200ms ease-out',
        }}
      >
        {application && (
          <>
            {/* Header */}
            <div
              className="flex items-start justify-between p-4"
              style={{ borderBottom: '1px solid rgba(139,92,246,0.12)' }}
            >
              <div className="flex-1 min-w-0 mr-3">
                <div
                  className="font-semibold text-sm leading-tight truncate"
                  style={{ color: '#e2e8f0' }}
                >
                  {application.jobs.title}
                </div>
                <div className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                  {application.jobs.company}
                  {application.jobs.location ? ` · ${application.jobs.location}` : ''}
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {application.match && (
                    <ScoreRing score={score} label={label} size="sm" showLabel={true} />
                  )}
                  <span
                    className="text-xs font-mono rounded px-2 py-0.5"
                    style={{
                      background: `${statusColor}18`,
                      border: `1px solid ${statusColor}40`,
                      color: statusColor,
                    }}
                  >
                    {STATUS_LABELS[application.status] ?? application.status}
                  </span>
                  {application.jobs.apply_url && (
                    <a
                      href={application.jobs.apply_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs"
                      style={{ color: '#8b5cf6' }}
                    >
                      Apply <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 rounded-lg p-1 transition-colors"
                style={{ color: '#4b5563' }}
                aria-label="Close drawer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              <AppDateFields application={application} onUpdate={onUpdate} />
              <div style={{ borderTop: '1px solid rgba(139,92,246,0.1)' }} />
              <ReminderForm applicationId={application.id} />
              <div style={{ borderTop: '1px solid rgba(139,92,246,0.1)' }} />
              <NotesPanel applicationId={application.id} />
            </div>
          </>
        )}
      </div>
    </>
  )
}
