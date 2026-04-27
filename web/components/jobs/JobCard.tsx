import Link from 'next/link'
import { ScoreRing } from './ScoreRing'

export interface Job {
  id: string
  title: string
  company: string
  location: string | null
  is_remote: boolean
  salary_min: number | null
  salary_max: number | null
  apply_url: string | null
  posted_at: string | null
  match_score: number
  match_label: string
  refined_score: number | null
  ai_refined: boolean
  application_status: string | null
}

interface JobCardProps {
  job: Job
  compact?: boolean
}

const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  saved:        { bg: 'rgba(139,92,246,0.12)',  color: '#a78bfa', border: 'rgba(139,92,246,0.2)' },
  applied:      { bg: 'rgba(52,211,153,0.1)',   color: '#34d399', border: 'rgba(52,211,153,0.2)' },
  interviewing: { bg: 'rgba(251,191,36,0.1)',   color: '#fbbf24', border: 'rgba(251,191,36,0.2)' },
  offer:        { bg: 'rgba(52,211,153,0.15)',  color: '#34d399', border: 'rgba(52,211,153,0.3)' },
  rejected:     { bg: 'rgba(100,116,139,0.1)',  color: '#64748b', border: 'rgba(100,116,139,0.2)' },
  dismissed:    { bg: 'rgba(100,116,139,0.08)', color: '#475569', border: 'rgba(100,116,139,0.15)' },
}

function formatSalary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null
  const fmt = (n: number) => `$${Math.round(n / 1000)}k`
  if (min && max) return `${fmt(min)}–${fmt(max)}`
  if (min) return `${fmt(min)}+`
  return null
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

export function JobCard({ job, compact = false }: JobCardProps) {
  const initials = (job.company ?? '?').slice(0, 2).toUpperCase()
  const salary = formatSalary(job.salary_min, job.salary_max)
  const statusStyle = job.application_status ? STATUS_STYLES[job.application_status] : null
  const displayScore = job.ai_refined && job.refined_score != null ? job.refined_score : job.match_score

  return (
    <Link href={`/jobs/${job.id}`} className="block">
      <div
        className="rounded-xl flex items-start gap-3 cursor-pointer transition-all duration-150"
        style={{
          background: '#0f0c1a',
          border: '1px solid rgba(139,92,246,0.15)',
          padding: compact ? '12px 14px' : '14px 16px',
        }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(139,92,246,0.35)'
          ;(e.currentTarget as HTMLDivElement).style.background = '#13101f'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(139,92,246,0.15)'
          ;(e.currentTarget as HTMLDivElement).style.background = '#0f0c1a'
        }}
      >
        {/* Company avatar */}
        <div
          className="flex-shrink-0 flex items-center justify-center font-mono font-bold"
          style={{
            width: compact ? 34 : 40,
            height: compact ? 34 : 40,
            borderRadius: 9,
            background: 'rgba(139,92,246,0.1)',
            border: '1px solid rgba(139,92,246,0.25)',
            color: '#a78bfa',
            fontSize: compact ? 11 : 12,
          }}
        >
          {initials}
        </div>

        {/* Job info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span
              className="font-semibold truncate"
              style={{ fontSize: compact ? 13 : 14, color: '#e2e8f0' }}
            >
              {job.title}
            </span>
            {statusStyle && (
              <span
                className="flex-shrink-0 font-mono"
                style={{
                  fontSize: 9,
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                  padding: '3px 8px',
                  borderRadius: 5,
                  background: statusStyle.bg,
                  color: statusStyle.color,
                  border: `1px solid ${statusStyle.border}`,
                }}
              >
                {job.application_status}
              </span>
            )}
          </div>
          <div
            className="flex items-center gap-1.5 flex-wrap"
            style={{ fontSize: 11, color: '#64748b' }}
          >
            <span style={{ color: '#94a3b8' }}>{job.company}</span>
            {job.location && <><span>·</span><span>{job.location}</span></>}
            {job.is_remote && (
              <span
                className="font-mono"
                style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(139,92,246,0.1)', color: '#a78bfa', fontSize: 9 }}
              >
                Remote
              </span>
            )}
            {salary && (
              <span
                className="font-mono"
                style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(52,211,153,0.08)', color: '#34d399', fontSize: 9 }}
              >
                {salary}
              </span>
            )}
            {job.posted_at && <><span>·</span><span>{timeAgo(job.posted_at)}</span></>}
          </div>
        </div>

        {/* Score ring */}
        <ScoreRing
          score={displayScore}
          label={job.match_label}
          size="sm"
          isRefining={!job.ai_refined && job.match_score >= 40}
        />
      </div>
    </Link>
  )
}
