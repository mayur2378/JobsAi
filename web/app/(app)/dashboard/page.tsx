import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StatWidgets } from '@/components/dashboard/StatWidgets'
import { TopMatches } from '@/components/dashboard/TopMatches'
import { MatchDistribution } from '@/components/dashboard/MatchDistribution'
import { RecentActivity } from '@/components/dashboard/RecentActivity'
import { RefreshButton } from '@/components/dashboard/RefreshButton'
import { DashboardPoller } from '@/components/dashboard/DashboardPoller'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('last_refresh_at')
    .eq('id', user.id)
    .single()

  const lastRefresh = profile?.last_refresh_at
    ? new Date(profile.last_refresh_at)
    : null

  const minutesAgo = lastRefresh
    ? Math.floor((Date.now() - lastRefresh.getTime()) / 60000)
    : null

  const lastRefreshLabel = minutesAgo === null
    ? 'Never refreshed'
    : minutesAgo < 60
      ? `Last refreshed ${minutesAgo}m ago`
      : `Last refreshed ${Math.floor(minutesAgo / 60)}h ago`

  return (
    <div className="max-w-5xl">
      <DashboardPoller userId={user.id} />
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="font-mono font-bold text-xl" style={{ color: '#e2e8f0' }}>
            Dashboard
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
            {lastRefreshLabel}
          </p>
        </div>
        <RefreshButton />
      </div>

      {/* Stat widgets */}
      <StatWidgets userId={user.id} />

      {/* Two-column body */}
      <div className="grid grid-cols-[1fr_280px] gap-4">
        <TopMatches userId={user.id} />
        <div className="space-y-4">
          <MatchDistribution userId={user.id} />
          <RecentActivity userId={user.id} />
        </div>
      </div>
    </div>
  )
}
