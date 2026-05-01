// web/components/tracker/KanbanBoard.tsx
'use client'

import { useState, useCallback } from 'react'
import { DragDropContext, DropResult } from '@hello-pangea/dnd'
import type { TrackerApplication } from '@/app/(app)/tracker/page'
import { apiFetch } from '@/lib/api'
import { KanbanColumn, KanbanStatus } from './KanbanColumn'
import { DrawerPanel } from './DrawerPanel'

const KANBAN_STATUSES: KanbanStatus[] = ['saved', 'applied', 'interviewing', 'offer', 'rejected']

type Columns = Record<KanbanStatus, TrackerApplication[]>

function buildColumns(apps: TrackerApplication[]): Columns {
  const cols: Columns = { saved: [], applied: [], interviewing: [], offer: [], rejected: [] }
  for (const app of apps) {
    if (app.status in cols) cols[app.status as KanbanStatus].push(app)
  }
  return cols
}

interface KanbanBoardProps {
  initialApplications: TrackerApplication[]
}

export function KanbanBoard({ initialApplications }: KanbanBoardProps) {
  const [columns, setColumns] = useState<Columns>(() => buildColumns(initialApplications))
  const [selectedApp, setSelectedApp] = useState<TrackerApplication | null>(null)

  const onDragEnd = useCallback(async (result: DropResult) => {
    const { draggableId, source, destination } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const fromStatus = source.droppableId as KanbanStatus
    const toStatus = destination.droppableId as KanbanStatus

    // Snapshot for rollback
    const snapshot = { ...columns, [fromStatus]: [...columns[fromStatus]], [toStatus]: [...columns[toStatus]] }

    // Optimistic update
    setColumns((prev) => {
      const fromCol = [...prev[fromStatus]]
      const toCol = fromStatus === toStatus ? fromCol : [...prev[toStatus]]
      const [moved] = fromCol.splice(source.index, 1)
      const updatedCard = { ...moved, status: toStatus }
      toCol.splice(destination.index, 0, updatedCard)
      if (fromStatus === toStatus) return { ...prev, [fromStatus]: toCol }
      return { ...prev, [fromStatus]: fromCol, [toStatus]: toCol }
    })

    // If the moved card is the selected one, update it in drawer too
    if (selectedApp?.id === draggableId) {
      setSelectedApp((prev) => prev ? { ...prev, status: toStatus } : null)
    }

    try {
      await apiFetch(`/applications/${draggableId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: toStatus }),
      })
    } catch {
      // Revert to snapshot
      setColumns(snapshot)
    }
  }, [columns, selectedApp])

  const handleCardClick = useCallback((app: TrackerApplication) => {
    setSelectedApp(app)
  }, [])

  const handleDrawerClose = useCallback(() => {
    setSelectedApp(null)
  }, [])

  const handleApplicationUpdate = useCallback((updated: Partial<TrackerApplication>) => {
    if (!selectedApp) return
    const merged = { ...selectedApp, ...updated }
    setSelectedApp(merged)
    setColumns((prev) => {
      const status = merged.status as KanbanStatus
      return {
        ...prev,
        [status]: prev[status].map((a) => a.id === merged.id ? merged : a),
      }
    })
  }, [selectedApp])

  return (
    <div className="flex gap-3 flex-1 overflow-x-auto pb-4">
      <DragDropContext onDragEnd={onDragEnd}>
        {KANBAN_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            applications={columns[status]}
            onCardClick={handleCardClick}
            selectedId={selectedApp?.id ?? null}
          />
        ))}
      </DragDropContext>

      <DrawerPanel
        application={selectedApp}
        onClose={handleDrawerClose}
        onUpdate={handleApplicationUpdate}
      />
    </div>
  )
}
