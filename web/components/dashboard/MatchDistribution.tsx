import { createClient } from '@/lib/supabase/server'

async function fetchDistribution(userId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('job_matches')
    .select('match_score, refined_score, ai_refined')
    .eq('user_id', userId)

  if (error) throw new Error(`MatchDistribution: ${error.message}`)

  // Use refined_score when AI has processed the match, otherwise match_score
  const scores = (data ?? []).map((m) =>
    m.ai_refined && m.refined_score != null ? m.refined_score : m.match_score
  )

  return {
    excellent: scores.filter((s) => s >= 80).length,
    strong: scores.filter((s) => s >= 60 && s < 80).length,
    good: scores.filter((s) => s >= 40 && s < 60).length,
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
