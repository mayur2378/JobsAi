# Analytics Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Analytics page showing pipeline health stats (jobs scraped, matches created, Phase 2 rate) and match quality charts (score distribution + average score trend over time).

**Architecture:** A new `/analytics` route in the `(app)` group is an async server component that queries Supabase directly — no new API endpoints needed. Data-fetching logic lives in a separate helper file. Charts use Recharts (SVG-based React components). A new "Analytics" nav item is added to the sidebar.

**Tech Stack:** Next.js 14.2 App Router (server components), Supabase JS SDK, Recharts

**Independent:** This plan has no dependency on Plan 6 or Plan 7.

---

### File Map

| File | Action | Purpose |
|------|--------|---------|
| `web/components/analytics/analyticsQueries.ts` | Create | Server-side Supabase data fetching helpers |
| `web/components/analytics/PipelineHealthCards.tsx` | Create | Four stat cards: jobs, matches, AI rate, avg score |
| `web/components/analytics/ScoreDistributionChart.tsx` | Create | Bar chart: Low/Good/Strong/Excellent buckets |
| `web/components/analytics/ScoreTrendChart.tsx` | Create | Line chart: avg match score per week (last 12 weeks) |
| `web/app/(app)/analytics/page.tsx` | Create | Analytics page: assembles all components |
| `web/components/layout/SidebarNav.tsx` | Modify | Add Analytics nav item |

---

### Task 1: Install Recharts

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: Install recharts**

```bash
cd web && npm install recharts
```

Expected: installs without peer dependency errors. Recharts requires React 18 which is already present.

- [ ] **Step 2: Verify import works**

```bash
cd web && node -e "require('recharts')" 2>/dev/null && echo "OK" || echo "FAIL"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "feat: install recharts for analytics charts"
```

---

### Task 2: Create analytics data-fetching helpers

**Files:**
- Create: `web/components/analytics/analyticsQueries.ts`

These are pure async functions called from the server component. No client code here.

- [ ] **Step 1: Create the file**

Create `web/components/analytics/analyticsQueries.ts`:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors related to `analyticsQueries.ts`.

- [ ] **Step 3: Commit**

```bash
git add web/components/analytics/analyticsQueries.ts
git commit -m "feat: add analytics data-fetching helpers"
```

---

### Task 3: Create PipelineHealthCards component

**Files:**
- Create: `web/components/analytics/PipelineHealthCards.tsx`

- [ ] **Step 1: Create the component**

Create `web/components/analytics/PipelineHealthCards.tsx`:

```tsx
import type { PipelineHealth } from './analyticsQueries'

interface CardProps {
  label: string
  value: string | number
  sub: string
  accent: string
  accentDim: string
}

function HealthCard({ label, value, sub, accent, accentDim }: CardProps) {
  return (
    <div
      className="rounded-xl p-4 relative overflow-hidden"
      style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
    >
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2, borderRadius: '10px 10px 0 0',
          background: `linear-gradient(90deg, ${accent}, transparent)`,
        }}
      />
      <div className="font-mono text-xs uppercase tracking-widest mb-2" style={{ color: '#64748b' }}>
        {label}
      </div>
      <div className="font-mono font-bold leading-none mb-1" style={{ fontSize: 28, color: accent }}>
        {value}
      </div>
      <div
        className="font-mono inline-flex items-center px-2 py-0.5 rounded text-xs"
        style={{ background: accentDim, color: accent, fontSize: 9, letterSpacing: '.04em' }}
      >
        {sub}
      </div>
    </div>
  )
}

export function PipelineHealthCards({ health }: { health: PipelineHealth }) {
  const cards: CardProps[] = [
    {
      label: 'Jobs This Week',
      value: health.jobsThisWeek,
      sub: 'scraped last 7d',
      accent: '#38bdf8',
      accentDim: 'rgba(56,189,248,0.12)',
    },
    {
      label: 'Matches This Week',
      value: health.matchesThisWeek,
      sub: 'computed last 7d',
      accent: '#a78bfa',
      accentDim: 'rgba(167,139,250,0.12)',
    },
    {
      label: 'AI Refined Rate',
      value: `${health.aiRefinedRate}%`,
      sub: 'last 30d',
      accent: '#34d399',
      accentDim: 'rgba(52,211,153,0.12)',
    },
    {
      label: 'Avg Match Score',
      value: health.avgMatchScore,
      sub: 'all time',
      accent: '#fbbf24',
      accentDim: 'rgba(251,191,36,0.12)',
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map((c) => (
        <HealthCard key={c.label} {...c} />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web/components/analytics/PipelineHealthCards.tsx
git commit -m "feat: add PipelineHealthCards component"
```

---

### Task 4: Create ScoreDistributionChart component

**Files:**
- Create: `web/components/analytics/ScoreDistributionChart.tsx`

Recharts `BarChart` with four coloured bars — one per score bucket.

- [ ] **Step 1: Create the component**

Create `web/components/analytics/ScoreDistributionChart.tsx`:

```tsx
'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { ScoreBucket } from './analyticsQueries'

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs font-mono"
      style={{ background: '#1a1425', border: '1px solid rgba(139,92,246,0.3)', color: '#e2e8f0' }}
    >
      <p style={{ color: '#a78bfa' }}>{label}</p>
      <p>{payload[0].value} jobs</p>
    </div>
  )
}

export function ScoreDistributionChart({ buckets }: { buckets: ScoreBucket[] }) {
  if (buckets.every((b) => b.count === 0)) {
    return (
      <div className="flex items-center justify-center h-48" style={{ color: '#64748b' }}>
        <p className="text-sm font-mono">No match data yet</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={buckets} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(139,92,246,0.05)' }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {buckets.map((entry) => (
            <Cell key={entry.label} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web/components/analytics/ScoreDistributionChart.tsx
git commit -m "feat: add ScoreDistributionChart component"
```

---

### Task 5: Create ScoreTrendChart component

**Files:**
- Create: `web/components/analytics/ScoreTrendChart.tsx`

Recharts `LineChart` showing average match score per week over the last 12 weeks.

- [ ] **Step 1: Create the component**

Create `web/components/analytics/ScoreTrendChart.tsx`:

```tsx
'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { WeeklyScore } from './analyticsQueries'

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs font-mono"
      style={{ background: '#1a1425', border: '1px solid rgba(139,92,246,0.3)', color: '#e2e8f0' }}
    >
      <p style={{ color: '#a78bfa' }}>{label}</p>
      <p>avg: {payload[0].value}</p>
    </div>
  )
}

export function ScoreTrendChart({ weeks }: { weeks: WeeklyScore[] }) {
  if (weeks.length === 0) {
    return (
      <div className="flex items-center justify-center h-48" style={{ color: '#64748b' }}>
        <p className="text-sm font-mono">Not enough data yet</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={weeks} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="week"
          tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={60} stroke="rgba(139,92,246,0.3)" strokeDasharray="4 4" />
        <ReferenceLine y={80} stroke="rgba(52,211,153,0.3)" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="avgScore"
          stroke="#a78bfa"
          strokeWidth={2}
          dot={{ fill: '#a78bfa', r: 3 }}
          activeDot={{ r: 5, fill: '#7c3aed' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web/components/analytics/ScoreTrendChart.tsx
git commit -m "feat: add ScoreTrendChart component"
```

---

### Task 6: Create the Analytics page

**Files:**
- Create: `web/app/(app)/analytics/page.tsx`

This is an async server component. It fetches data server-side, then passes it to the (client-side) chart components.

- [ ] **Step 1: Create the page**

Create `web/app/(app)/analytics/page.tsx`:

```tsx
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
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd web && npm run build
```

Expected: build succeeds. The chart components use `'use client'` correctly, so the server/client split is valid.

- [ ] **Step 3: Commit**

```bash
git add web/app/(app)/analytics/page.tsx
git commit -m "feat: add analytics page with pipeline health and match quality charts"
```

---

### Task 7: Add Analytics to the sidebar nav

**Files:**
- Modify: `web/components/layout/SidebarNav.tsx`

- [ ] **Step 1: Read the current SidebarNav**

Read `web/components/layout/SidebarNav.tsx`. Current `NAV_ITEMS`:

```typescript
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/tracker', label: 'Tracker', icon: ListChecks },
  { href: '/profile', label: 'Profile', icon: User },
]
```

- [ ] **Step 2: Add Analytics nav item**

Update `web/components/layout/SidebarNav.tsx`:

Add `BarChart3` to the lucide-react import:

```typescript
import { LayoutDashboard, Briefcase, ListChecks, User, BarChart3 } from 'lucide-react'
```

Add the Analytics item between Tracker and Profile in `NAV_ITEMS`:

```typescript
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/tracker', label: 'Tracker', icon: ListChecks },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/profile', label: 'Profile', icon: User },
]
```

- [ ] **Step 3: Build**

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add web/components/layout/SidebarNav.tsx
git commit -m "feat: add Analytics link to sidebar navigation"
```

---

### Manual verification

1. Start dev server: `cd web && npm run dev`
2. Log in and click **Analytics** in the sidebar
3. Verify the page loads with four health stat cards
4. Verify the Score Distribution chart renders (may show empty-state if no data yet)
5. Verify the Score Trend chart renders (may show empty-state)
6. Add a few job matches via the dashboard → refresh Analytics → counts should update
