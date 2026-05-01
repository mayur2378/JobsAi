import { Suspense } from 'react'
import { serverFetch } from '@/lib/api'
import { JobFilters } from '@/components/jobs/JobFilters'
import { JobList } from '@/components/jobs/JobList'
import { Pagination } from '@/components/jobs/Pagination'
import type { Job } from '@/components/jobs/JobCard'

interface JobsResponse {
  jobs: Job[]
  total: number
  page: number
  limit: number
}

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>
}

export default async function JobsPage({ searchParams }: PageProps) {
  const page = Math.max(1, Number(searchParams.page) || 1)
  const min_score = searchParams.min_score as string | undefined
  const remote = searchParams.remote as string | undefined
  const status = searchParams.status as string | undefined
  const keyword = searchParams.keyword as string | undefined

  const params = new URLSearchParams({ page: String(page), limit: '20' })
  if (min_score && min_score !== '0') params.set('min_score', min_score)
  if (remote === 'true') params.set('remote', 'true')
  if (status) params.set('status', status)

  let response: JobsResponse = { jobs: [], total: 0, page, limit: 20 }
  try {
    response = await serverFetch<JobsResponse>(`/jobs?${params.toString()}`)
  } catch {
    // Show empty state on error
  }

  // Client-side keyword filter (API doesn't support keyword search)
  const jobs = keyword
    ? response.jobs.filter(
        (j) =>
          j.title.toLowerCase().includes(keyword.toLowerCase()) ||
          j.company.toLowerCase().includes(keyword.toLowerCase())
      )
    : response.jobs

  const totalPages = Math.ceil(response.total / response.limit)

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Page heading */}
      <div className="px-6 pt-6 pb-4 flex-shrink-0">
        <h1 className="font-mono font-bold text-xl" style={{ color: '#e2e8f0' }}>Jobs</h1>
        <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>AI-matched jobs for your profile</p>
      </div>

      {/* Filter bar */}
      <Suspense>
        <JobFilters total={jobs.length} />
      </Suspense>

      {/* Job list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <JobList jobs={jobs} />
      </div>

      {/* Pagination — hidden when keyword active (keyword filters current page only) */}
      {!keyword && (
        <Suspense>
          <Pagination page={page} totalPages={totalPages} total={response.total} limit={response.limit} />
        </Suspense>
      )}
    </div>
  )
}
