import { createClient } from '@/lib/supabase/server'

async function fetchDistribution(userId: string) {
  const supabase = await createClient()

  const [excellentRes, strongRes, goodRes] = await Promise.all([
    supabase
      .from('job_matches')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('match_score', 80),
    supabase
      .from('job_matches')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('match_score', 60)
      .lt('match_score', 80),
    supabase
      .from('job_matches')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('match_score', 40)
      .lt('match_score', 60),
  ])

  if (excellentRes.error) throw new Error(`MatchDistribution: ${excellentRes.error.message}`)
  if (strongRes.error) throw new Error(`MatchDistribution: ${strongRes.error.message}`)
  if (goodRes.error) throw new Error(`MatchDistribution: ${goodRes.error.message}`)

  return {
    excellent: excellentRes.count ?? 0,
    strong: strongRes.count ?? 0,
    good: goodRes.count ?? 0,
  }
}

export async function MatchDistribution({ userId }: { userId: string }) {
  const dist = await fetchDistribution(userId)
  const max = Math.max(dist.excellent, dist.strong, dist.good, 1)

  const rows = [
    { label: 'Strong ≥80', count: dist.excellent, color: '#34d399' },
    { label: 'Good 60–79', count: dist.strong, color: '#a78bfa' },
    { label: 'Possible 40–59', count: dist.good, color: '#fbbf24' },
  ]

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
    >
      <div className="font-mono text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#cbd5e1', letterSpacing: '.08em' }}>
        Match Distribution
      </div>
      <div className="space-y-2.5">
        {rows.map(({ label, count, color }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="font-mono text-xs w-24 flex-shrink-0" style={{ color: color, fontSize: 10 }}>
              {label}
            </span>
            <div className="flex-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${(count / max) * 100}%`, background: color }}
              />
            </div>
            <span className="font-mono text-xs w-5 text-right flex-shrink-0" style={{ color, fontSize: 10 }}>
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
