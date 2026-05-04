import { Suspense } from 'react'
import { RangeToggle } from '@/components/admin/RangeToggle'
import { StatSection } from '@/components/admin/StatSection'
import { FunnelRow } from '@/components/admin/FunnelRow'
import { DailyViewsChart } from '@/components/admin/DailyViewsChart'
import { DailySignupsChart } from '@/components/admin/DailySignupsChart'
import { TopPagesTable } from '@/components/admin/TopPagesTable'
import {
  fetchUserStats,
  fetchEngagementStats,
  fetchJobStats,
  fetchFunnelStats,
  fetchDailyViews,
  fetchDailySignups,
} from '@/components/admin/adminQueries'

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>
}

const VALID_RANGES = [7, 30, 90]

export default async function AdminPage({ searchParams }: PageProps) {
  const raw = Number(searchParams.range)
  const days = VALID_RANGES.includes(raw) ? raw : 30

  const [users, engagement, jobs, funnel, dailyViews, dailySignups] = await Promise.all([
    fetchUserStats(days),
    fetchEngagementStats(days),
    fetchJobStats(days),
    fetchFunnelStats(days),
    fetchDailyViews(days),
    fetchDailySignups(days),
  ])

  const SKY   = { accent: '#38bdf8', accentDim: 'rgba(56,189,248,0.12)' }
  const VIOLET = { accent: '#a78bfa', accentDim: 'rgba(167,139,250,0.12)' }
  const GREEN  = { accent: '#34d399', accentDim: 'rgba(52,211,153,0.12)' }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono font-bold text-xl" style={{ color: '#e2e8f0' }}>Analytics</h1>
          <p className="font-mono text-xs mt-0.5" style={{ color: '#64748b' }}>System-wide metrics</p>
        </div>
        {/* Suspense required: RangeToggle calls useSearchParams() */}
        <Suspense>
          <RangeToggle current={days} />
        </Suspense>
      </div>

      {/* Users */}
      <StatSection
        title="Users"
        cards={[
          { label: 'Total Users',      value: users.totalUsers,                    sub: 'all time',              ...SKY },
          { label: 'Active Users',     value: users.activeUsers,                   sub: `visited in ${days}d`,   ...SKY },
          { label: 'New Signups',      value: users.newSignups,                    sub: `last ${days}d`,         ...SKY },
          { label: 'Onboarding Rate',  value: `${users.onboardingRate}%`,          sub: 'completed setup',       ...SKY },
        ]}
      />

      {/* Engagement */}
      <StatSection
        title="Engagement"
        cols={3}
        cards={[
          { label: 'Page Views',       value: engagement.totalViews,               sub: `last ${days}d`,         ...VIOLET },
          { label: 'Daily Avg Views',  value: engagement.dailyAvgViews,            sub: 'avg per day',           ...VIOLET },
          { label: 'Views / User',     value: engagement.viewsPerUser,             sub: 'per active user',       ...VIOLET },
        ]}
      >
        <TopPagesTable pages={engagement.topPages} />
      </StatSection>

      {/* Jobs & Matching */}
      <StatSection
        title="Jobs & Matching"
        cards={[
          { label: 'Total Jobs',       value: jobs.totalJobs,                      sub: 'in pool',               ...GREEN },
          { label: 'Jobs Added',       value: jobs.jobsAdded,                      sub: `last ${days}d`,         ...GREEN },
          { label: 'Total Matches',    value: jobs.totalMatches,                   sub: 'all users',             ...GREEN },
          { label: 'Avg Match Score',  value: jobs.avgMatchScore,                  sub: 'system-wide',           ...GREEN },
        ]}
      />

      {/* Funnel */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-widest" style={{ color: '#64748b' }}>
          Application Funnel
        </h2>
        <FunnelRow stats={funnel} />
      </section>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <div
          className="rounded-xl p-4"
          style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
        >
          <div className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: '#64748b' }}>
            Daily Page Views
          </div>
          <DailyViewsChart data={dailyViews} />
        </div>
        <div
          className="rounded-xl p-4"
          style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
        >
          <div className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: '#64748b' }}>
            Daily Signups
          </div>
          <DailySignupsChart data={dailySignups} />
        </div>
      </div>
    </div>
  )
}
