import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

interface Stat {
  label: string
  value: number
  sub?: string
  accent: string
  accentDim: string
  href?: string
}

async function fetchStats(userId: string) {
  const supabase = await createClient()

  const [strongRes, totalRes, appliedRes, savedRes] = await Promise.all([
    supabase
      .from('job_matches')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('match_score', 80),
    supabase
      .from('job_matches')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('match_score', 40),
    supabase
      .from('job_applications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'applied'),
    supabase
      .from('job_applications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'saved'),
  ])

  if (strongRes.error) throw new Error(`StatWidgets: ${strongRes.error.message}`)
  if (totalRes.error) throw new Error(`StatWidgets: ${totalRes.error.message}`)
  if (appliedRes.error) throw new Error(`StatWidgets: ${appliedRes.error.message}`)
  if (savedRes.error) throw new Error(`StatWidgets: ${savedRes.error.message}`)

  return {
    strong: strongRes.count ?? 0,
    total: totalRes.count ?? 0,
    applied: appliedRes.count ?? 0,
    saved: savedRes.count ?? 0,
  }
}

export async function StatWidgets({ userId }: { userId: string }) {
  const stats = await fetchStats(userId)

  const items: Stat[] = [
    { label: 'Strong Matches', value: stats.strong, sub: 'score ≥ 80', accent: '#34d399', accentDim: 'rgba(52,211,153,0.12)', href: '/jobs?min_score=80&from=dashboard' },
    { label: 'Total Matched', value: stats.total, sub: 'score ≥ 40', accent: '#a78bfa', accentDim: 'rgba(139,92,246,0.12)', href: '/jobs?min_score=40&from=dashboard' },
    { label: 'Applied', value: stats.applied, sub: undefined, accent: '#fbbf24', accentDim: 'rgba(251,191,36,0.12)', href: '/jobs?status=applied&from=dashboard' },
    { label: 'Saved', value: stats.saved, sub: 'review later', accent: '#ec4899', accentDim: 'rgba(236,72,153,0.1)', href: '/jobs?status=saved&from=dashboard' },
  ]

  return (
    <div className="grid grid-cols-4 gap-3 mb-5">
      {items.map((s) => {
        const inner = (
          <>
            {/* Top accent bar */}
            <div
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 2, borderRadius: '10px 10px 0 0',
                background: `linear-gradient(90deg, ${s.accent}, transparent)`,
              }}
            />
            <div className="font-mono text-xs uppercase tracking-widest mb-2" style={{ color: '#64748b' }}>
              {s.label}
            </div>
            <div className="font-mono font-bold leading-none mb-1" style={{ fontSize: 28, color: s.accent }}>
              {s.value}
            </div>
            {s.sub && (
              <div
                className="font-mono inline-flex items-center px-2 py-0.5 rounded text-xs"
                style={{ background: s.accentDim, color: s.accent, fontSize: 9, letterSpacing: '.04em' }}
              >
                {s.sub}
              </div>
            )}
            {s.href && (
              <div className="font-mono text-xs mt-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: s.accent, fontSize: 9 }}>
                View jobs →
              </div>
            )}
          </>
        )

        const cardStyle = { background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }
        const cardClass = 'rounded-xl p-4 relative overflow-hidden group'

        return s.href ? (
          <Link
            key={s.label}
            href={s.href}
            className={`${cardClass} hover:border-opacity-40 transition-all duration-150 cursor-pointer`}
            style={{ ...cardStyle, textDecoration: 'none' }}
          >
            {inner}
          </Link>
        ) : (
          <div key={s.label} className={cardClass} style={cardStyle}>
            {inner}
          </div>
        )
      })}
    </div>
  )
}
