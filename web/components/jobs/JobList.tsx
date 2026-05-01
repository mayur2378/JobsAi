import { JobCard } from './JobCard'
import type { Job } from './JobCard'

interface JobListProps {
  jobs: Job[]
}

export function JobList({ jobs }: JobListProps) {
  if (jobs.length === 0) {
    return (
      <div
        className="rounded-xl p-10 text-center"
        style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
      >
        <div className="font-mono text-sm mb-2" style={{ color: '#64748b' }}>No jobs match your filters</div>
        <div className="text-xs" style={{ color: '#475569' }}>Try lowering the minimum score or removing filters</div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  )
}
