import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { serverFetch } from '@/lib/server-api'
import { MatchPanel } from '@/components/jobs/MatchPanel'
import { StatusSelector } from '@/components/jobs/StatusSelector'
import type { AppStatus } from '@/components/jobs/StatusSelector'
import type { Job } from '@/components/jobs/JobCard'

interface JobDetail extends Job {
  description: string | null
  requirements: string | null
  skills_matched: string[] | null
  skills_missing: string[] | null
  match_explanation: string | null
  gaps_to_improve: string[] | null
  match_breakdown: {
    skills: number
    title: number
    location: number
    experience: number
    keywords: number
    salary: number
  } | null
}

function formatSalary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null
  const fmt = (n: number) => `$${n.toLocaleString()}`
  if (min && max) return `${fmt(min)} – ${fmt(max)}`
  if (min) return `${fmt(min)}+`
  return null
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  let job: JobDetail
  try {
    job = await serverFetch<JobDetail>(`/jobs/${params.id}`)
  } catch {
    notFound()
  }

  const initials = (job.company ?? '?').slice(0, 2).toUpperCase()
  const salary = formatSalary(job.salary_min, job.salary_max)

  return (
    <div className="max-w-5xl">
      {/* Breadcrumb */}
      <div
        className="flex items-center gap-2 font-mono text-xs mb-6 -mt-2 pb-4"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.15)' }}
      >
        <Link href="/jobs" className="flex items-center gap-1" style={{ color: '#a78bfa' }}>
          ← Jobs
        </Link>
        <span style={{ color: '#334155' }}>/</span>
        <span className="truncate" style={{ color: '#64748b', maxWidth: 300 }}>{job.title}</span>
      </div>

      {/* Job header */}
      <div className="flex gap-5 mb-6">
        <div
          className="flex-shrink-0 flex items-center justify-center font-mono font-bold"
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            background: 'rgba(139,92,246,0.1)',
            border: '1px solid rgba(139,92,246,0.3)',
            color: '#a78bfa',
            fontSize: 16,
          }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-xl mb-2 leading-tight" style={{ color: '#e2e8f0', letterSpacing: '-.01em' }}>
            {job.title}
          </h1>
          <div className="flex items-center gap-2 flex-wrap text-xs mb-4" style={{ color: '#94a3b8' }}>
            <span className="font-semibold" style={{ color: '#cbd5e1' }}>{job.company}</span>
            {job.location && <><span style={{ color: '#334155' }}>·</span><span>{job.location}</span></>}
            {job.is_remote && (
              <span className="font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', fontSize: 9 }}>
                Remote
              </span>
            )}
            {salary && (
              <span className="font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(52,211,153,0.08)', color: '#34d399', fontSize: 9 }}>
                {salary}
              </span>
            )}
            {job.posted_at && (
              <span className="font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: '#64748b', fontSize: 9 }}>
                {timeAgo(job.posted_at)}
              </span>
            )}
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2">
            {job.apply_url && (
              <a
                href={job.apply_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
              >
                Apply Now
                <ExternalLink size={11} />
              </a>
            )}
            <StatusSelector jobId={job.id} initialStatus={job.application_status as AppStatus | null} />
          </div>
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-[1fr_280px] gap-5">

        {/* Left: job content */}
        <div className="space-y-4">
          {job.description && (
            <div
              className="rounded-xl p-5"
              style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
            >
              <div className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: '#64748b', fontSize: 9 }}>
                Description
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#94a3b8', lineHeight: 1.75 }}>
                {job.description}
              </p>
            </div>
          )}

          {job.requirements && (
            <div
              className="rounded-xl p-5"
              style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
            >
              <div className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: '#64748b', fontSize: 9 }}>
                Requirements
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#94a3b8', lineHeight: 1.75 }}>
                {job.requirements}
              </p>
            </div>
          )}

          {/* Skills analysis */}
          {((job.skills_matched?.length ?? 0) > 0 || (job.skills_missing?.length ?? 0) > 0) && (
            <div
              className="rounded-xl p-5"
              style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
            >
              <div className="font-mono text-xs uppercase tracking-widest mb-4" style={{ color: '#64748b', fontSize: 9 }}>
                Skills Analysis
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="font-mono text-xs mb-2" style={{ color: '#34d399', fontSize: 10 }}>
                    Matched ({job.skills_matched?.length ?? 0})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(job.skills_matched ?? []).map((s) => (
                      <span
                        key={s}
                        className="font-mono px-2 py-1 rounded text-xs"
                        style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', fontSize: 11 }}
                      >
                        ✓ {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-xs mb-2" style={{ color: '#fbbf24', fontSize: 10 }}>
                    Missing ({job.skills_missing?.length ?? 0})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(job.skills_missing ?? []).map((s) => (
                      <span
                        key={s}
                        className="font-mono px-2 py-1 rounded text-xs"
                        style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', fontSize: 11 }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: AI match panel */}
        <MatchPanel
          jobId={job.id}
          initial={{
            score: job.match_score,
            label: job.match_label,
            refinedScore: job.refined_score,
            aiRefined: job.ai_refined,
            skillsMatched: job.skills_matched ?? [],
            skillsMissing: job.skills_missing ?? [],
            explanation: job.match_explanation,
            gaps: job.gaps_to_improve ?? [],
            breakdown: job.match_breakdown,
          }}
        />
      </div>
    </div>
  )
}
