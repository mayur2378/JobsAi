import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  fetchPipelineHealth,
  fetchScoreDistribution,
  fetchWeeklyScoreTrend,
} from '@/components/analytics/analyticsQueries'
import { PipelineHealthCards } from '@/components/analytics/PipelineHealthCards'
import { ScoreDistributionChart } from '@/components/analytics/ScoreDistributionChart'
import { ScoreTrendChart } from '@/components/analytics/ScoreTrendChart'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [health, distribution, trend] = await Promise.all([
    fetchPipelineHealth(user.id),
    fetchScoreDistribution(user.id),
    fetchWeeklyScoreTrend(user.id),
  ])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-mono font-bold text-xl" style={{ color: '#e2e8f0' }}>Analytics</h1>
        <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Pipeline health and match quality trends</p>
      </div>

      {/* Pipeline health */}
      <section>
        <h2 className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: '#64748b' }}>
          Pipeline Health
        </h2>
        <PipelineHealthCards health={health} />
      </section>

      {/* Charts */}
      <section>
        <h2 className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: '#64748b' }}>
          Match Quality
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {/* Score distribution */}
          <div
            className="rounded-xl p-4"
            style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
          >
            <div className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: '#64748b' }}>
              Score Distribution
            </div>
            <ScoreDistributionChart buckets={distribution} />
          </div>

          {/* Score trend */}
          <div
            className="rounded-xl p-4"
            style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
          >
            <div className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: '#64748b' }}>
              Avg Score — Last 12 Weeks
            </div>
            <ScoreTrendChart weeks={trend} />
          </div>
        </div>
      </section>
    </div>
  )
}
