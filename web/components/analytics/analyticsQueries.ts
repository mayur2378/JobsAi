import { createClient } from '@/lib/supabase/server'

export interface PipelineHealth {
  jobsThisWeek: number
  matchesThisWeek: number
  aiRefinedRate: number   // 0–100
  avgMatchScore: number
}

export interface ScoreBucket {
  label: string
  count: number
  color: string
}

export interface WeeklyScore {
  week: string   // ISO week label e.g. "W18"
  avgScore: number
}

export async function fetchPipelineHealth(userId: string): Promise<PipelineHealth> {
  const supabase = await createClient()
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [jobsRes, matchesRes, refinedRes, totalRefinedRes, avgRes] = await Promise.all([
    supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekAgo),

    supabase
      .from('job_matches')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('computed_at', weekAgo),

    supabase
      .from('job_matches')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('ai_refined', true)
      .gte('computed_at', monthAgo),

    supabase
      .from('job_matches')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('computed_at', monthAgo),

    supabase
      .from('job_matches')
      .select('match_score')
      .eq('user_id', userId),
  ])

  const refined = refinedRes.count ?? 0
  const totalRefined = totalRefinedRes.count ?? 1
  const scores = (avgRes.data ?? []).map((r: { match_score: number }) => r.match_score)
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0

  return {
    jobsThisWeek: jobsRes.count ?? 0,
    matchesThisWeek: matchesRes.count ?? 0,
    aiRefinedRate: totalRefined > 0 ? Math.round((refined / totalRefined) * 100) : 0,
    avgMatchScore: avgScore,
  }
}

export async function fetchScoreDistribution(userId: string): Promise<ScoreBucket[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('job_matches')
    .select('match_score')
    .eq('user_id', userId)

  const scores = (data ?? []).map((r: { match_score: number }) => r.match_score)

  const buckets = [
    { label: 'Low', min: 0, max: 39, color: '#ef4444' },
    { label: 'Good', min: 40, max: 59, color: '#fbbf24' },
    { label: 'Strong', min: 60, max: 79, color: '#a78bfa' },
    { label: 'Excellent', min: 80, max: 100, color: '#34d399' },
  ]

  return buckets.map(({ label, min, max, color }) => ({
    label,
    count: scores.filter((s) => s >= min && s <= max).length,
    color,
  }))
}

export async function fetchWeeklyScoreTrend(userId: string): Promise<WeeklyScore[]> {
  const supabase = await createClient()
  const cutoff = new Date(Date.now() - 84 * 24 * 60 * 60 * 1000).toISOString() // 12 weeks

  const { data } = await supabase
    .from('job_matches')
    .select('match_score, computed_at')
    .eq('user_id', userId)
    .gte('computed_at', cutoff)
    .order('computed_at', { ascending: true })

  if (!data || data.length === 0) return []

  // Group by ISO week number
  const weekMap = new Map<string, number[]>()
  for (const row of data as { match_score: number; computed_at: string }[]) {
    const d = new Date(row.computed_at)
    const year = d.getFullYear()
    // Simple ISO week: day of year / 7
    const startOfYear = new Date(year, 0, 1)
    const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7)
    const key = `W${weekNum}`
    if (!weekMap.has(key)) weekMap.set(key, [])
    weekMap.get(key)!.push(row.match_score)
  }

  return Array.from(weekMap.entries()).map(([week, scores]) => ({
    week,
    avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
  }))
}
