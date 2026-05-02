import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { JobCard } from '@/components/jobs/JobCard'
import type { Job } from '@/components/jobs/JobCard'

async function fetchTopMatches(userId: string): Promise<Job[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('job_matches')
    .select(`
      match_score, match_label, refined_score, ai_refined,
      jobs!inner(id, title, company, location, is_remote, salary_min, salary_max, apply_url, posted_at)
    `)
    .eq('user_id', userId)
    .gte('match_score', 40)
    .order('match_score', { ascending: false })
    .limit(5)

  if (error) throw new Error(`TopMatches: ${error.message}`)
  if (!data) return []

  return data.map((m) => ({
    ...(m.jobs as Record<string, unknown>),
    match_score: m.match_score,
    match_label: m.match_label,
    refined_score: m.refined_score,
    ai_refined: m.ai_refined,
    application_status: null,
  })) as unknown as Job[]
}

export async function TopMatches({ userId }: { userId: string }) {
  const jobs = await fetchTopMatches(userId)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest" style={{ color: '#cbd5e1', letterSpacing: '.08em' }}>
          Top Matches
        </span>
        <Link href="/jobs" className="font-mono text-xs" style={{ color: '#a78bfa' }}>
          View all →
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div
          className="rounded-xl p-6 text-center text-sm"
          style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)', color: '#64748b' }}
        >
          No matches yet.{' '}
          <span style={{ color: '#a78bfa' }}>Refresh jobs</span> to start matching.
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} compact />
          ))}
        </div>
      )}
    </div>
  )
}
