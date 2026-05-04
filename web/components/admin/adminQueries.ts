import { createAdminClient } from '@/lib/supabase/admin'

function rangeStart(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

export interface UserStats {
  totalUsers: number
  newSignups: number
  activeUsers: number
  onboardingRate: number
}

export interface EngagementStats {
  totalViews: number
  dailyAvgViews: number
  viewsPerUser: number
  topPages: { path: string; count: number }[]
}

export interface JobStats {
  totalJobs: number
  jobsAdded: number
  totalMatches: number
  avgMatchScore: number
}

export interface FunnelStats {
  saved: number
  applied: number
  interviewing: number
  offers: number
  rejected: number
  applyRate: number
}

export interface DailyCount {
  date: string
  count: number
}

export async function fetchUserStats(days: number): Promise<UserStats> {
  const supabase = createAdminClient()
  const since = rangeStart(days)

  const [totalRes, newRes, onboardedRes, activeRes] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('onboarding_completed', true),
    supabase.from('page_views').select('user_id').gte('created_at', since),
  ])

  const total = totalRes.count ?? 0
  const activeIds = new Set((activeRes.data ?? []).map((r: { user_id: string }) => r.user_id))

  return {
    totalUsers: total,
    newSignups: newRes.count ?? 0,
    activeUsers: activeIds.size,
    onboardingRate: total > 0 ? Math.round(((onboardedRes.count ?? 0) / total) * 100) : 0,
  }
}

export async function fetchEngagementStats(days: number): Promise<EngagementStats> {
  const supabase = createAdminClient()
  const since = rangeStart(days)

  const { data } = await supabase
    .from('page_views')
    .select('user_id, path')
    .gte('created_at', since)

  const rows = (data ?? []) as { user_id: string; path: string }[]
  const uniqueUsers = new Set(rows.map((r) => r.user_id)).size

  const pathCounts = new Map<string, number>()
  for (const row of rows) {
    pathCounts.set(row.path, (pathCounts.get(row.path) ?? 0) + 1)
  }
  const topPages = Array.from(pathCounts.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const totalViews = rows.length
  return {
    totalViews,
    dailyAvgViews: days > 0 ? Math.round(totalViews / days) : 0,
    viewsPerUser: uniqueUsers > 0 ? Math.round(totalViews / uniqueUsers) : 0,
    topPages,
  }
}

export async function fetchJobStats(days: number): Promise<JobStats> {
  const supabase = createAdminClient()
  const since = rangeStart(days)

  const [totalJobsRes, newJobsRes, totalMatchesRes, avgScoreRes] = await Promise.all([
    supabase.from('jobs').select('*', { count: 'exact', head: true }),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('job_matches').select('*', { count: 'exact', head: true }),
    supabase.from('job_matches').select('match_score'),
  ])

  const scores = (avgScoreRes.data ?? []).map((r: { match_score: number }) => r.match_score)
  const avgMatchScore =
    scores.length > 0
      ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
      : 0

  return {
    totalJobs: totalJobsRes.count ?? 0,
    jobsAdded: newJobsRes.count ?? 0,
    totalMatches: totalMatchesRes.count ?? 0,
    avgMatchScore,
  }
}

export async function fetchFunnelStats(days: number): Promise<FunnelStats> {
  const supabase = createAdminClient()
  const since = rangeStart(days)

  const { data } = await supabase
    .from('job_applications')
    .select('status')
    .gte('created_at', since)

  const rows = (data ?? []) as { status: string }[]
  const count = (s: string) => rows.filter((r) => r.status === s).length

  const saved = count('saved')
  const applied = count('applied')
  const interviewing = count('interviewing')
  const offers = count('offer')
  const rejected = count('rejected')
  const denominator = saved + applied + interviewing + offers
  const applyRate = denominator > 0 ? Math.round((applied / denominator) * 100) : 0

  return { saved, applied, interviewing, offers, rejected, applyRate }
}

export async function fetchDailyViews(days: number): Promise<DailyCount[]> {
  const supabase = createAdminClient()
  const since = rangeStart(days)

  const { data } = await supabase
    .from('page_views')
    .select('created_at')
    .gte('created_at', since)

  const dayMap = new Map<string, number>()
  for (const row of (data ?? []) as { created_at: string }[]) {
    const date = row.created_at.slice(0, 10)
    dayMap.set(date, (dayMap.get(date) ?? 0) + 1)
  }

  const result: DailyCount[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    result.push({ date, count: dayMap.get(date) ?? 0 })
  }
  return result
}

export async function fetchDailySignups(days: number): Promise<DailyCount[]> {
  const supabase = createAdminClient()
  const since = rangeStart(days)

  const { data } = await supabase
    .from('profiles')
    .select('created_at')
    .gte('created_at', since)

  const dayMap = new Map<string, number>()
  for (const row of (data ?? []) as { created_at: string }[]) {
    const date = row.created_at.slice(0, 10)
    dayMap.set(date, (dayMap.get(date) ?? 0) + 1)
  }

  const result: DailyCount[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    result.push({ date, count: dayMap.get(date) ?? 0 })
  }
  return result
}
