// web/app/(app)/tracker/page.tsx
import { serverFetch } from '@/lib/api'
import { KanbanBoard } from '@/components/tracker/KanbanBoard'

export interface TrackerJob {
  id: string
  title: string
  company: string
  location: string | null
  is_remote: boolean
  salary_min: number | null
  salary_max: number | null
  apply_url: string | null
}

export interface TrackerMatch {
  match_score: number
  match_label: string
  refined_score: number | null
  ai_refined: boolean
}

export interface TrackerApplication {
  id: string
  user_id: string
  job_id: string
  status: 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected'
  applied_at: string | null
  interview_date: string | null
  follow_up_date: string | null
  offer_amount: number | null
  created_at: string
  updated_at: string
  jobs: TrackerJob
  match: TrackerMatch | null
}

export default async function TrackerPage() {
  let applications: TrackerApplication[] = []

  try {
    applications = await serverFetch<TrackerApplication[]>('/applications')
  } catch {
    // render board with empty state on error
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="font-mono text-lg font-bold tracking-wide"
            style={{ color: '#e2e8f0' }}
          >
            TRACKER
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
            {applications.length} active application{applications.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <KanbanBoard initialApplications={applications} />
    </div>
  )
}
