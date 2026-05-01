// web/components/tracker/KanbanColumn.tsx
import { Droppable } from '@hello-pangea/dnd'
import type { TrackerApplication } from '@/app/(app)/tracker/page'
import { TrackerCard } from './TrackerCard'

export type KanbanStatus = 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected'

const COLUMN_CONFIG: Record<KanbanStatus, { label: string; color: string; countBg: string; countColor: string }> = {
  saved:        { label: 'SAVED',        color: 'rgba(139,92,246,0.35)', countBg: 'rgba(139,92,246,0.15)', countColor: '#a78bfa' },
  applied:      { label: 'APPLIED',      color: 'rgba(59,130,246,0.35)', countBg: 'rgba(59,130,246,0.1)', countColor: '#60a5fa' },
  interviewing: { label: 'INTERVIEWING', color: 'rgba(251,191,36,0.35)', countBg: 'rgba(251,191,36,0.1)', countColor: '#fbbf24' },
  offer:        { label: 'OFFER',        color: 'rgba(52,211,153,0.35)', countBg: 'rgba(52,211,153,0.1)', countColor: '#34d399' },
  rejected:     { label: 'REJECTED',     color: 'rgba(248,113,113,0.35)', countBg: 'rgba(248,113,113,0.1)', countColor: '#f87171' },
}

interface KanbanColumnProps {
  status: KanbanStatus
  applications: TrackerApplication[]
  onCardClick: (app: TrackerApplication) => void
  selectedId: string | null
}

export function KanbanColumn({ status, applications, onCardClick, selectedId }: KanbanColumnProps) {
  const cfg = COLUMN_CONFIG[status]

  return (
    <div
      className="flex flex-col flex-shrink-0 rounded-xl"
      style={{
        width: 220,
        background: '#0f0c1a',
        border: `1px solid ${cfg.color}`,
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ borderBottom: `1px solid rgba(139,92,246,0.1)` }}
      >
        <span
          className="font-mono text-xs font-semibold tracking-widest"
          style={{ color: cfg.countColor }}
        >
          {cfg.label}
        </span>
        <span
          className="text-xs font-mono rounded-full px-2 py-0.5"
          style={{ background: cfg.countBg, color: cfg.countColor }}
        >
          {applications.length}
        </span>
      </div>

      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex flex-col gap-2 p-2 flex-1 min-h-16 overflow-y-auto"
            style={{
              background: snapshot.isDraggingOver ? 'rgba(139,92,246,0.04)' : 'transparent',
              transition: 'background 150ms ease',
              maxHeight: 'calc(100vh - 200px)',
            }}
          >
            {applications.map((app, index) => (
              <TrackerCard
                key={app.id}
                application={app}
                index={index}
                isSelected={app.id === selectedId}
                onClick={() => onCardClick(app)}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}
