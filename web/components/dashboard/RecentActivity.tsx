import { createClient } from '@/lib/supabase/server'

interface ActivityItem {
  id: string
  text: string
  time: string
  dotColor: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

async function fetchActivity(userId: string): Promise<ActivityItem[]> {
  const supabase = await createClient()
  const items: ActivityItem[] = []

  // Most recent pipeline run: newest job_match created_at
  const { data: newestMatch } = await supabase
    .from('job_matches')
    .select('created_at, match_score')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (newestMatch) {
    const batchStart = new Date(newestMatch.created_at)
    batchStart.setSeconds(0, 0)
    const batchEnd = new Date(batchStart.getTime() + 60000)

    const { count } = await supabase
      .from('job_matches')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', batchStart.toISOString())
      .lt('created_at', batchEnd.toISOString())

    items.push({
      id: 'pipeline',
      text: `${count ?? 1} jobs matched from pipeline run`,
      time: timeAgo(newestMatch.created_at),
      dotColor: '#34d399',
    })
  }

  // Recent application status changes
  const { data: recentApps } = await supabase
    .from('job_applications')
    .select(`status, updated_at, jobs!inner(title, company)`)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(3)

  for (const app of recentApps ?? []) {
    const a = app as any
    items.push({
      id: a.updated_at,
      text: `${capitalize(a.status)} — ${a.jobs.title} at ${a.jobs.company}`,
      time: timeAgo(a.updated_at),
      dotColor: a.status === 'applied' ? '#34d399' : a.status === 'interviewing' ? '#fbbf24' : '#a78bfa',
    })
  }

  return items.slice(0, 4)
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export async function RecentActivity({ userId }: { userId: string }) {
  const items = await fetchActivity(userId)

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
    >
      <div className="font-mono text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#cbd5e1', letterSpacing: '.08em' }}>
        Recent Activity
      </div>
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: '#64748b' }}>No activity yet.</p>
      ) : (
        <div className="space-y-0">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex gap-2.5 py-2"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
            >
              <div
                className="flex-shrink-0 mt-1.5 rounded-full"
                style={{ width: 6, height: 6, background: item.dotColor }}
              />
              <div>
                <div className="text-xs" style={{ color: '#94a3b8', lineHeight: 1.5 }}>{item.text}</div>
                <div className="font-mono" style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>{item.time}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
