import { Draggable } from '@hello-pangea/dnd'
import type { TrackerApplication } from '@/app/(app)/tracker/page'
import { ScoreRing } from '@/components/jobs/ScoreRing'

interface TrackerCardProps {
  application: TrackerApplication
  index: number
  isSelected: boolean
  onClick: () => void
}

function companyInitials(company: string): string {
  return company
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

const AVATAR_COLORS = [
  '#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706',
  '#dc2626', '#9333ea', '#0284c7',
]

function avatarColor(company: string): string {
  let hash = 0
  for (let i = 0; i < company.length; i++) hash = company.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function TrackerCard({ application, index, isSelected, onClick }: TrackerCardProps) {
  const { jobs, match } = application
  const initials = companyInitials(jobs.company)
  const bgColor = avatarColor(jobs.company)
  const score = match?.refined_score ?? match?.match_score ?? 0
  const label = match?.match_label ?? 'low'

  const interviewDate = application.interview_date
    ? new Date(application.interview_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <Draggable draggableId={application.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className="rounded-lg p-2.5 cursor-pointer transition-all duration-150"
          style={{
            background: isSelected ? '#1a1730' : '#13101f',
            border: isSelected
              ? '1px solid rgba(139,92,246,0.45)'
              : '1px solid rgba(139,92,246,0.12)',
            boxShadow: snapshot.isDragging ? '0 8px 24px rgba(0,0,0,0.4)' : 'none',
            opacity: snapshot.isDragging ? 0.9 : 1,
          }}
        >
          <div className="flex items-start gap-2">
            {/* Company avatar */}
            <div
              className="flex-shrink-0 rounded-md flex items-center justify-center font-mono font-bold text-white"
              style={{ width: 28, height: 28, background: bgColor, fontSize: 11 }}
            >
              {initials}
            </div>

            {/* Job info */}
            <div className="flex-1 min-w-0">
              <div
                className="text-xs font-medium leading-tight truncate"
                style={{ color: '#e2e8f0' }}
              >
                {jobs.title}
              </div>
              <div className="text-xs mt-0.5 truncate" style={{ color: '#6b7280' }}>
                {jobs.company}
                {jobs.is_remote && (
                  <span className="ml-1.5" style={{ color: '#34d399' }}>· Remote</span>
                )}
              </div>
            </div>

            {/* Score ring */}
            {match && (
              <ScoreRing score={score} label={label} size="sm" showLabel={false} />
            )}
          </div>

          {/* Interview date badge */}
          {interviewDate && (
            <div
              className="mt-2 text-xs font-mono rounded px-1.5 py-0.5 inline-flex items-center gap-1"
              style={{
                background: 'rgba(251,191,36,0.1)',
                border: '1px solid rgba(251,191,36,0.2)',
                color: '#fbbf24',
              }}
            >
              Interview {interviewDate}
            </div>
          )}
        </div>
      )}
    </Draggable>
  )
}
