# Plan 4 — Dashboard + Jobs Feed UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the frontend UI connecting to the Plan 3 Jobs Pipeline — a Dashboard overview page, a paginated Jobs feed with filters, and a Job detail page with live AI match scoring via Supabase Realtime.

**Architecture:** URL-param driven Next.js Server Components for initial data fetch + isolated Client Component islands for filter inputs, mutations, and Realtime. Dashboard stats query Supabase SSR directly; jobs list and job detail call the Express API via a new `serverFetch` helper. Phase 2 live score updates use Supabase Realtime on `job_matches` in a `MatchPanel` Client Component.

**Tech Stack:** Next.js 14 App Router · React 18 · Tailwind CSS v3 · Supabase SSR + Realtime · Lucide React · next/font (Fira Code + Fira Sans)

---

## File Map

**New files:**
```
web/components/layout/SidebarNav.tsx            — Client: active nav with usePathname()
web/components/jobs/ScoreRing.tsx               — shared score circle (sm + lg, colored by label)
web/components/jobs/JobCard.tsx                 — job card (feed + dashboard top matches)
web/components/jobs/JobFilters.tsx              — Client: filter bar → router.push URL params
web/components/jobs/JobList.tsx                 — renders paginated cards + empty state
web/components/jobs/Pagination.tsx              — Client: prev/next page controls
web/components/jobs/MatchPanel.tsx              — Client: AI score + Realtime subscription
web/components/jobs/StatusSelector.tsx          — Client: status dropdown → PATCH /jobs/:id/status
web/components/dashboard/StatWidgets.tsx        — 4 stat cards via Supabase SSR
web/components/dashboard/TopMatches.tsx         — top 5 job cards
web/components/dashboard/MatchDistribution.tsx  — horizontal bars by label count
web/components/dashboard/RecentActivity.tsx     — activity feed from job_matches + job_applications
web/components/dashboard/RefreshButton.tsx      — Client: POST /jobs/refresh + rate-limit UX
web/app/(app)/jobs/page.tsx                     — Server Component: jobs feed
web/app/(app)/jobs/[id]/page.tsx                — Server Component: job detail
supabase/migrations/004_realtime.sql            — enable Realtime on job_matches
```

**Modified files:**
```
web/app/layout.tsx                — add next/font Fira Code + Fira Sans + CSS variables
web/tailwind.config.ts            — extend fontFamily with firaCode + firaSans variables
web/app/globals.css               — add --bg-raised, update body font-family
web/app/(app)/layout.tsx          — replace inline nav with SidebarNav component
web/app/(app)/dashboard/page.tsx  — replace placeholder with real dashboard
web/lib/api.ts                    — add serverFetch helper for Server Components
```

---

## Task 1: Foundation — fonts, CSS, Tailwind, sidebar

**Files:**
- Modify: `web/app/layout.tsx`
- Modify: `web/tailwind.config.ts`
- Modify: `web/app/globals.css`
- Create: `web/components/layout/SidebarNav.tsx`
- Modify: `web/app/(app)/layout.tsx`

- [ ] **Step 1: Install lucide-react**

```bash
cd web && npm install lucide-react
```

Expected: `added 1 package` with no errors.

- [ ] **Step 2: Update `web/app/layout.tsx` to load Fira Code + Fira Sans via next/font**

```tsx
import type { Metadata } from 'next'
import { Fira_Code, Fira_Sans } from 'next/font/google'
import './globals.css'

const firaCode = Fira_Code({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fira-code',
  display: 'swap',
})

const firaSans = Fira_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-fira-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'JobTrack AI',
  description: 'AI-powered job search and application tracker',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`antialiased ${firaCode.variable} ${firaSans.variable}`}>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Update `web/tailwind.config.ts` to expose font CSS variables**

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
      },
      fontFamily: {
        mono: ['var(--font-fira-code)', 'monospace'],
        sans: ['var(--font-fira-sans)', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
```

- [ ] **Step 4: Update `web/app/globals.css` — add `--bg-raised`, update body font**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-base: #0a0a0f;
  --bg-surface: #0f0c1a;
  --bg-raised: #13101f;
  --border-default: rgba(139, 92, 246, 0.15);
  --border-hover: rgba(139, 92, 246, 0.4);
}

body {
  background-color: var(--bg-base);
  color: #e2e8f0;
  font-family: var(--font-fira-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

* {
  box-sizing: border-box;
}
```

- [ ] **Step 5: Create `web/components/layout/SidebarNav.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Briefcase, ListChecks, BarChart2, User } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/tracker', label: 'Tracker', icon: ListChecks },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/profile', label: 'Profile', icon: User },
]

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 px-2 space-y-0.5 text-sm">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150"
            style={{
              color: active ? '#a78bfa' : '#64748b',
              background: active ? 'rgba(139,92,246,0.12)' : 'transparent',
            }}
          >
            <Icon size={14} strokeWidth={1.5} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 6: Update `web/app/(app)/layout.tsx` to use SidebarNav**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SidebarNav } from '@/components/layout/SidebarNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_completed) redirect('/onboarding/profile')

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0a0a0f' }}>
      <aside
        className="w-52 flex-shrink-0 flex flex-col py-4"
        style={{ background: '#0f0c1a', borderRight: '1px solid rgba(139,92,246,0.12)' }}
      >
        <div
          className="px-4 pb-4 font-mono text-sm font-bold"
          style={{
            background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            borderBottom: '1px solid rgba(139,92,246,0.12)',
            marginBottom: '8px',
          }}
        >
          JobTrack AI
        </div>
        <SidebarNav />
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 7: Start dev server and verify fonts + sidebar active state**

```bash
cd web && npm run dev
```

Open http://localhost:3000/dashboard — verify:
- Sidebar shows Lucide icons next to each nav label
- Dashboard link is highlighted in purple (active state)
- Fonts loaded: body text uses Fira Sans, no flash of unstyled text

- [ ] **Step 8: Commit**

```bash
cd web && git add -A && git commit -m "feat: add Lucide icons, Fira fonts, SidebarNav active state"
```

---

## Task 2: ScoreRing shared component

**Files:**
- Create: `web/components/jobs/ScoreRing.tsx`

The `match_label` values from the API are: `'excellent'` (≥80), `'strong'` (≥60), `'good'` (≥40), `'low'` (<40).

- [ ] **Step 1: Create `web/components/jobs/ScoreRing.tsx`**

```tsx
interface ScoreRingProps {
  score: number
  label: string
  size?: 'sm' | 'lg'
  showLabel?: boolean
  isRefining?: boolean
}

const LABEL_CONFIG: Record<string, { display: string; color: string; border: string; bg: string }> = {
  excellent: {
    display: 'Strong',
    color: '#34d399',
    border: 'rgba(52,211,153,0.4)',
    bg: 'rgba(52,211,153,0.08)',
  },
  strong: {
    display: 'Good',
    color: '#a78bfa',
    border: 'rgba(139,92,246,0.4)',
    bg: 'rgba(139,92,246,0.08)',
  },
  good: {
    display: 'Possible',
    color: '#fbbf24',
    border: 'rgba(251,191,36,0.35)',
    bg: 'rgba(251,191,36,0.08)',
  },
  low: {
    display: 'Low',
    color: '#64748b',
    border: 'rgba(100,116,139,0.3)',
    bg: 'rgba(100,116,139,0.06)',
  },
}

export function ScoreRing({ score, label, size = 'sm', showLabel = true, isRefining = false }: ScoreRingProps) {
  const cfg = LABEL_CONFIG[label] ?? LABEL_CONFIG.low
  const isLg = size === 'lg'

  return (
    <div className="flex flex-col items-center" style={{ minWidth: isLg ? 72 : 52 }}>
      <div
        style={{
          width: isLg ? 72 : 44,
          height: isLg ? 72 : 44,
          borderRadius: '50%',
          background: cfg.bg,
          border: `${isLg ? 2 : 1.5}px solid ${cfg.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          marginBottom: 4,
        }}
      >
        <span
          className="font-mono font-bold leading-none"
          style={{ fontSize: isLg ? 24 : 15, color: cfg.color }}
        >
          {score}
        </span>
      </div>
      {showLabel && (
        <span
          className="font-mono text-center"
          style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b' }}
        >
          {cfg.display}
        </span>
      )}
      {isRefining && (
        <span
          className="font-mono flex items-center gap-1 mt-1"
          style={{ fontSize: 8, color: '#fbbf24' }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: '#fbbf24',
              display: 'inline-block',
              animation: 'pulse 1.4s ease-in-out infinite',
            }}
          />
          Refining
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add pulse keyframe to `web/app/globals.css`**

Append to the end of the file:

```css
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.75); }
}
```

- [ ] **Step 3: Commit**

```bash
cd web && git add -A && git commit -m "feat: add ScoreRing shared component"
```

---

## Task 3: serverFetch helper + JobCard component

**Files:**
- Modify: `web/lib/api.ts`
- Create: `web/components/jobs/JobCard.tsx`

- [ ] **Step 1: Add `serverFetch` to `web/lib/api.ts`**

Append after the existing `apiFetch` export:

```ts
// Server-side authenticated fetch — only callable from Server Components.
// Uses the SSR Supabase client to get the session token.
export async function serverFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { createClient } = await import('./supabase/server')
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1${path}`,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      cache: 'no-store',
    }
  )

  const json = await res.json().catch(() => ({} as Record<string, unknown>))
  if (!res.ok) throw new Error((json.error as string | undefined) ?? `HTTP ${res.status}`)
  return json.data as T
}
```

- [ ] **Step 2: Define the shared `Job` type and create `web/components/jobs/JobCard.tsx`**

```tsx
import Link from 'next/link'
import { ScoreRing } from './ScoreRing'

export interface Job {
  id: string
  title: string
  company: string
  location: string | null
  is_remote: boolean
  salary_min: number | null
  salary_max: number | null
  apply_url: string | null
  posted_at: string | null
  match_score: number
  match_label: string
  refined_score: number | null
  ai_refined: boolean
  application_status: string | null
}

interface JobCardProps {
  job: Job
  compact?: boolean
}

const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  saved:        { bg: 'rgba(139,92,246,0.12)',  color: '#a78bfa', border: 'rgba(139,92,246,0.2)' },
  applied:      { bg: 'rgba(52,211,153,0.1)',   color: '#34d399', border: 'rgba(52,211,153,0.2)' },
  interviewing: { bg: 'rgba(251,191,36,0.1)',   color: '#fbbf24', border: 'rgba(251,191,36,0.2)' },
  offer:        { bg: 'rgba(52,211,153,0.15)',  color: '#34d399', border: 'rgba(52,211,153,0.3)' },
  rejected:     { bg: 'rgba(100,116,139,0.1)',  color: '#64748b', border: 'rgba(100,116,139,0.2)' },
  dismissed:    { bg: 'rgba(100,116,139,0.08)', color: '#475569', border: 'rgba(100,116,139,0.15)' },
}

function formatSalary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null
  const fmt = (n: number) => `$${Math.round(n / 1000)}k`
  if (min && max) return `${fmt(min)}–${fmt(max)}`
  if (min) return `${fmt(min)}+`
  return null
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

export function JobCard({ job, compact = false }: JobCardProps) {
  const initials = (job.company ?? '?').slice(0, 2).toUpperCase()
  const salary = formatSalary(job.salary_min, job.salary_max)
  const statusStyle = job.application_status ? STATUS_STYLES[job.application_status] : null
  const displayScore = job.ai_refined && job.refined_score != null ? job.refined_score : job.match_score

  return (
    <Link href={`/jobs/${job.id}`} className="block">
      <div
        className="rounded-xl flex items-start gap-3 cursor-pointer transition-all duration-150"
        style={{
          background: '#0f0c1a',
          border: '1px solid rgba(139,92,246,0.15)',
          padding: compact ? '12px 14px' : '14px 16px',
        }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(139,92,246,0.35)'
          ;(e.currentTarget as HTMLDivElement).style.background = '#13101f'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(139,92,246,0.15)'
          ;(e.currentTarget as HTMLDivElement).style.background = '#0f0c1a'
        }}
      >
        {/* Company avatar */}
        <div
          className="flex-shrink-0 flex items-center justify-center font-mono font-bold"
          style={{
            width: compact ? 34 : 40,
            height: compact ? 34 : 40,
            borderRadius: 9,
            background: 'rgba(139,92,246,0.1)',
            border: '1px solid rgba(139,92,246,0.25)',
            color: '#a78bfa',
            fontSize: compact ? 11 : 12,
          }}
        >
          {initials}
        </div>

        {/* Job info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span
              className="font-semibold truncate"
              style={{ fontSize: compact ? 13 : 14, color: '#e2e8f0' }}
            >
              {job.title}
            </span>
            {statusStyle && (
              <span
                className="flex-shrink-0 font-mono"
                style={{
                  fontSize: 9,
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                  padding: '3px 8px',
                  borderRadius: 5,
                  background: statusStyle.bg,
                  color: statusStyle.color,
                  border: `1px solid ${statusStyle.border}`,
                }}
              >
                {job.application_status}
              </span>
            )}
          </div>
          <div
            className="flex items-center gap-1.5 flex-wrap"
            style={{ fontSize: 11, color: '#64748b' }}
          >
            <span style={{ color: '#94a3b8' }}>{job.company}</span>
            {job.location && <><span>·</span><span>{job.location}</span></>}
            {job.is_remote && (
              <span
                className="font-mono"
                style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(139,92,246,0.1)', color: '#a78bfa', fontSize: 9 }}
              >
                Remote
              </span>
            )}
            {salary && (
              <span
                className="font-mono"
                style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(52,211,153,0.08)', color: '#34d399', fontSize: 9 }}
              >
                {salary}
              </span>
            )}
            {job.posted_at && <><span>·</span><span>{timeAgo(job.posted_at)}</span></>}
          </div>
        </div>

        {/* Score ring */}
        <ScoreRing
          score={displayScore}
          label={job.match_label}
          size="sm"
          isRefining={!job.ai_refined && job.match_score >= 40}
        />
      </div>
    </Link>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd web && git add -A && git commit -m "feat: add serverFetch helper and JobCard component"
```

---

## Task 4: Dashboard stat queries — StatWidgets

**Files:**
- Create: `web/components/dashboard/StatWidgets.tsx`

This is a Server Component. It queries Supabase SSR directly for aggregate counts.

- [ ] **Step 1: Create `web/components/dashboard/StatWidgets.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'

interface Stat {
  label: string
  value: number
  sub?: string
  accent: string
  accentDim: string
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
    { label: 'Strong Matches', value: stats.strong, sub: 'score ≥ 80', accent: '#34d399', accentDim: 'rgba(52,211,153,0.12)' },
    { label: 'Total Matched', value: stats.total, sub: 'score ≥ 40', accent: '#a78bfa', accentDim: 'rgba(139,92,246,0.12)' },
    { label: 'Applied', value: stats.applied, sub: undefined, accent: '#fbbf24', accentDim: 'rgba(251,191,36,0.12)' },
    { label: 'Saved', value: stats.saved, sub: 'review later', accent: '#ec4899', accentDim: 'rgba(236,72,153,0.1)' },
  ]

  return (
    <div className="grid grid-cols-4 gap-3 mb-5">
      {items.map((s) => (
        <div
          key={s.label}
          className="rounded-xl p-4 relative overflow-hidden"
          style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
        >
          {/* Top accent bar */}
          <div
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 2, borderRadius: '10px 10px 0 0',
              background: `linear-gradient(90deg, ${s.accent}, transparent)`,
            }}
          />
          <div className="font-mono text-xs uppercase tracking-widest mb-2" style={{ color: '#64748b', letterSpacing: '.1em' }}>
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
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd web && git add -A && git commit -m "feat: add StatWidgets dashboard component"
```

---

## Task 5: TopMatches, MatchDistribution, RecentActivity

**Files:**
- Create: `web/components/dashboard/TopMatches.tsx`
- Create: `web/components/dashboard/MatchDistribution.tsx`
- Create: `web/components/dashboard/RecentActivity.tsx`

- [ ] **Step 1: Create `web/components/dashboard/TopMatches.tsx`**

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { JobCard } from '@/components/jobs/JobCard'
import type { Job } from '@/components/jobs/JobCard'

async function fetchTopMatches(userId: string): Promise<Job[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('job_matches')
    .select(`
      match_score, match_label, refined_score, ai_refined,
      jobs!inner(id, title, company, location, is_remote, salary_min, salary_max, apply_url, posted_at)
    `)
    .eq('user_id', userId)
    .gte('match_score', 40)
    .order('match_score', { ascending: false })
    .limit(5)

  if (!data) return []

  return data.map((m: any) => ({
    ...m.jobs,
    match_score: m.match_score,
    match_label: m.match_label,
    refined_score: m.refined_score,
    ai_refined: m.ai_refined,
    application_status: null,
  }))
}

export async function TopMatches({ userId }: { userId: string }) {
  const jobs = await fetchTopMatches(userId)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest" style={{ color: '#cbd5e1', letterSpacing: '.08em' }}>
          Top Matches
        </span>
        <Link href="/jobs" className="font-mono text-xs" style={{ color: '#a78bfa' }}>
          View all →
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div
          className="rounded-xl p-6 text-center text-sm"
          style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)', color: '#64748b' }}
        >
          No matches yet.{' '}
          <span style={{ color: '#a78bfa' }}>Refresh jobs</span> to start matching.
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} compact />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `web/components/dashboard/MatchDistribution.tsx`**

```tsx
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
```

- [ ] **Step 3: Create `web/components/dashboard/RecentActivity.tsx`**

```tsx
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
    // Count how many matches share the same minute (approximate batch size)
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
```

- [ ] **Step 4: Commit**

```bash
cd web && git add -A && git commit -m "feat: add TopMatches, MatchDistribution, RecentActivity components"
```

---

## Task 6: RefreshButton + Dashboard page assembly

**Files:**
- Create: `web/components/dashboard/RefreshButton.tsx`
- Modify: `web/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Create `web/components/dashboard/RefreshButton.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api'

export function RefreshButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'rate-limited'>('idle')
  const [message, setMessage] = useState('')

  async function handleRefresh() {
    setState('loading')
    try {
      await apiFetch('/jobs/refresh', { method: 'POST' })
      setState('done')
      setMessage('Refresh triggered')
      setTimeout(() => setState('idle'), 3000)
    } catch (err: any) {
      if (err.message?.includes('once per hour')) {
        setState('rate-limited')
        setMessage('Next refresh available in ~1h')
        setTimeout(() => setState('idle'), 5000)
      } else {
        setState('idle')
      }
    }
  }

  const isDisabled = state === 'loading' || state === 'rate-limited'

  return (
    <button
      onClick={handleRefresh}
      disabled={isDisabled}
      className="flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-xs transition-all duration-150"
      style={{
        background: state === 'done' ? 'rgba(52,211,153,0.1)' : 'rgba(139,92,246,0.1)',
        border: `1px solid ${state === 'done' ? 'rgba(52,211,153,0.3)' : 'rgba(139,92,246,0.3)'}`,
        color: state === 'done' ? '#34d399' : '#a78bfa',
        opacity: isDisabled && state !== 'loading' ? 0.6 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
      }}
    >
      <RefreshCw
        size={12}
        strokeWidth={1.8}
        style={{ animation: state === 'loading' ? 'spin 1s linear infinite' : 'none' }}
      />
      {state === 'idle' && 'Refresh Jobs'}
      {state === 'loading' && 'Refreshing…'}
      {state === 'done' && '✓ Triggered'}
      {state === 'rate-limited' && message}
    </button>
  )
}
```

- [ ] **Step 2: Add spin keyframe to `web/app/globals.css`**

Append after the existing `@keyframes pulse`:

```css
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 3: Update `web/app/(app)/dashboard/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StatWidgets } from '@/components/dashboard/StatWidgets'
import { TopMatches } from '@/components/dashboard/TopMatches'
import { MatchDistribution } from '@/components/dashboard/MatchDistribution'
import { RecentActivity } from '@/components/dashboard/RecentActivity'
import { RefreshButton } from '@/components/dashboard/RefreshButton'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('last_refresh_at, work_preference')
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
```

- [ ] **Step 4: Verify dashboard in browser**

Navigate to http://localhost:3000/dashboard. Verify:
- 4 stat cards render with correct accent colors
- Top Matches section shows job cards (or "No matches yet" empty state)
- Match Distribution bars render
- Recent Activity section renders
- "Refresh Jobs" button is visible in top-right; clicking it shows loading spinner and "✓ Triggered"

- [ ] **Step 5: Commit**

```bash
cd web && git add -A && git commit -m "feat: complete Dashboard page with stats, top matches, and refresh"
```

---

## Task 7: JobFilters (Client Component)

**Files:**
- Create: `web/components/jobs/JobFilters.tsx`

- [ ] **Step 1: Create `web/components/jobs/JobFilters.tsx`**

```tsx
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { Search } from 'lucide-react'

interface JobFiltersProps {
  total: number
}

const SCORE_PRESETS = [
  { label: 'All', value: '0' },
  { label: '40+', value: '40' },
  { label: '60+', value: '60' },
  { label: '80+', value: '80' },
]

const STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Saved', value: 'saved' },
  { label: 'Applied', value: 'applied' },
  { label: 'Interviewing', value: 'interviewing' },
]

export function JobFilters({ total }: JobFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const current = {
    keyword: searchParams.get('keyword') ?? '',
    min_score: searchParams.get('min_score') ?? '40',
    remote: searchParams.get('remote') === 'true',
    status: searchParams.get('status') ?? '',
  }

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete('page') // reset to page 1 on filter change
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  return (
    <div
      className="flex items-center gap-2 flex-wrap px-6 py-3 flex-shrink-0"
      style={{ borderBottom: '1px solid rgba(139,92,246,0.15)', background: '#0a0a0f' }}
    >
      {/* Keyword search */}
      <div
        className="flex items-center gap-2 flex-1 min-w-[180px] max-w-[260px] h-8 px-3 rounded-lg text-xs"
        style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.25)', color: '#94a3b8' }}
      >
        <Search size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} />
        <input
          className="bg-transparent outline-none flex-1 text-xs placeholder:text-slate-600"
          style={{ color: '#e2e8f0' }}
          placeholder="Search jobs…"
          value={current.keyword}
          onChange={(e) => update('keyword', e.target.value)}
        />
      </div>

      {/* Score presets */}
      <div className="flex items-center gap-1">
        {SCORE_PRESETS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => update('min_score', value)}
            className="h-8 px-3 rounded-lg font-mono text-xs transition-all duration-150"
            style={{
              background: current.min_score === value ? 'rgba(139,92,246,0.12)' : '#0f0c1a',
              border: `1px solid ${current.min_score === value ? 'rgba(139,92,246,0.35)' : 'rgba(139,92,246,0.15)'}`,
              color: current.min_score === value ? '#a78bfa' : '#64748b',
              cursor: 'pointer',
            }}
          >
            {label === 'All' ? 'All scores' : `Score ≥ ${label.replace('+', '')}`}
          </button>
        ))}
      </div>

      {/* Remote toggle */}
      <button
        onClick={() => update('remote', current.remote ? '' : 'true')}
        className="flex items-center gap-2 h-8 px-3 rounded-lg text-xs transition-all duration-150"
        style={{
          background: current.remote ? 'rgba(52,211,153,0.1)' : '#0f0c1a',
          border: `1px solid ${current.remote ? 'rgba(52,211,153,0.3)' : 'rgba(139,92,246,0.15)'}`,
          color: current.remote ? '#34d399' : '#64748b',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: 24,
            height: 13,
            borderRadius: 7,
            background: current.remote ? '#34d399' : 'rgba(255,255,255,0.1)',
            position: 'relative',
            transition: 'background 150ms',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 1.5,
              left: current.remote ? 12 : 1.5,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'white',
              transition: 'left 150ms',
            }}
          />
        </div>
        Remote
      </button>

      {/* Status filter */}
      <select
        value={current.status}
        onChange={(e) => update('status', e.target.value)}
        className="h-8 px-3 rounded-lg text-xs outline-none cursor-pointer font-mono"
        style={{
          background: current.status ? 'rgba(139,92,246,0.1)' : '#0f0c1a',
          border: `1px solid ${current.status ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.15)'}`,
          color: current.status ? '#a78bfa' : '#64748b',
        }}
      >
        {STATUS_OPTIONS.map(({ label, value }) => (
          <option key={value} value={value} style={{ background: '#0f0c1a', color: '#e2e8f0' }}>
            {label === 'All' ? 'Status: All' : label}
          </option>
        ))}
      </select>

      {/* Result count */}
      <span className="ml-auto font-mono text-xs" style={{ color: '#64748b', whiteSpace: 'nowrap' }}>
        {total} job{total !== 1 ? 's' : ''}
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd web && git add -A && git commit -m "feat: add JobFilters client component"
```

---

## Task 8: JobList + Pagination + Jobs feed page

**Files:**
- Create: `web/components/jobs/JobList.tsx`
- Create: `web/components/jobs/Pagination.tsx`
- Create: `web/app/(app)/jobs/page.tsx`

- [ ] **Step 1: Create `web/components/jobs/JobList.tsx`**

```tsx
import { JobCard } from './JobCard'
import type { Job } from './JobCard'

interface JobListProps {
  jobs: Job[]
}

export function JobList({ jobs }: JobListProps) {
  if (jobs.length === 0) {
    return (
      <div
        className="rounded-xl p-10 text-center"
        style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
      >
        <div className="font-mono text-sm mb-2" style={{ color: '#64748b' }}>No jobs match your filters</div>
        <div className="text-xs" style={{ color: '#475569' }}>Try lowering the minimum score or removing filters</div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `web/components/jobs/Pagination.tsx`**

```tsx
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  limit: number
}

export function Pagination({ page, totalPages, total, limit }: PaginationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  if (totalPages <= 1) return null

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.push(`${pathname}?${params.toString()}`)
  }

  const start = (page - 1) * limit + 1
  const end = Math.min(page * limit, total)

  const visiblePages = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
    if (totalPages <= 5) return i + 1
    if (page <= 3) return i + 1
    if (page >= totalPages - 2) return totalPages - 4 + i
    return page - 2 + i
  })

  return (
    <div
      className="flex items-center justify-between px-6 py-3 flex-shrink-0"
      style={{ borderTop: '1px solid rgba(139,92,246,0.15)' }}
    >
      <span className="font-mono text-xs" style={{ color: '#64748b' }}>
        {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-150"
          style={{
            background: '#0f0c1a',
            border: '1px solid rgba(139,92,246,0.15)',
            color: page <= 1 ? '#334155' : '#64748b',
            cursor: page <= 1 ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronLeft size={14} />
        </button>

        {visiblePages.map((p) => (
          <button
            key={p}
            onClick={() => goToPage(p)}
            className="w-8 h-8 flex items-center justify-center rounded-lg font-mono text-xs transition-all duration-150"
            style={{
              background: p === page ? 'rgba(139,92,246,0.12)' : '#0f0c1a',
              border: `1px solid ${p === page ? 'rgba(139,92,246,0.35)' : 'rgba(139,92,246,0.15)'}`,
              color: p === page ? '#a78bfa' : '#64748b',
              fontWeight: p === page ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {p}
          </button>
        ))}

        <button
          onClick={() => goToPage(page + 1)}
          disabled={page >= totalPages}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-150"
          style={{
            background: '#0f0c1a',
            border: '1px solid rgba(139,92,246,0.15)',
            color: page >= totalPages ? '#334155' : '#64748b',
            cursor: page >= totalPages ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `web/app/(app)/jobs/page.tsx`**

```tsx
import { Suspense } from 'react'
import { serverFetch } from '@/lib/api'
import { JobFilters } from '@/components/jobs/JobFilters'
import { JobList } from '@/components/jobs/JobList'
import { Pagination } from '@/components/jobs/Pagination'
import type { Job } from '@/components/jobs/JobCard'

interface JobsResponse {
  jobs: Job[]
  total: number
  page: number
  limit: number
}

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>
}

export default async function JobsPage({ searchParams }: PageProps) {
  const page = Number(searchParams.page ?? 1)
  const min_score = searchParams.min_score as string | undefined
  const remote = searchParams.remote as string | undefined
  const status = searchParams.status as string | undefined
  const keyword = searchParams.keyword as string | undefined

  const params = new URLSearchParams({ page: String(page), limit: '20' })
  if (min_score) params.set('min_score', min_score)
  if (remote === 'true') params.set('remote', 'true')
  if (status) params.set('status', status)

  let response: JobsResponse = { jobs: [], total: 0, page, limit: 20 }
  try {
    response = await serverFetch<JobsResponse>(`/jobs?${params.toString()}`)
  } catch {
    // Show empty state on error
  }

  // Client-side keyword filter (API doesn't support keyword search — filter in UI)
  const jobs = keyword
    ? response.jobs.filter(
        (j) =>
          j.title.toLowerCase().includes(keyword.toLowerCase()) ||
          j.company.toLowerCase().includes(keyword.toLowerCase())
      )
    : response.jobs

  const totalPages = Math.ceil(response.total / response.limit)

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Page heading */}
      <div className="px-6 pt-6 pb-4 flex-shrink-0">
        <h1 className="font-mono font-bold text-xl" style={{ color: '#e2e8f0' }}>Jobs</h1>
        <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>AI-matched jobs for your profile</p>
      </div>

      {/* Filter bar */}
      <Suspense>
        <JobFilters total={jobs.length} />
      </Suspense>

      {/* Job list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <JobList jobs={jobs} />
      </div>

      {/* Pagination */}
      <Suspense>
        <Pagination page={page} totalPages={totalPages} total={response.total} limit={response.limit} />
      </Suspense>
    </div>
  )
}
```

- [ ] **Step 4: Verify Jobs page in browser**

Navigate to http://localhost:3000/jobs. Verify:
- Filter bar renders with search input, score presets, remote toggle, status select
- Job cards render (or empty state if no jobs yet)
- Clicking a score preset updates the URL and re-renders the list
- Toggling remote updates URL
- Pagination shows if total > 20

- [ ] **Step 5: Commit**

```bash
cd web && git add -A && git commit -m "feat: add Jobs feed page with filters and pagination"
```

---

## Task 9: StatusSelector (Client Component)

**Files:**
- Create: `web/components/jobs/StatusSelector.tsx`

- [ ] **Step 1: Create `web/components/jobs/StatusSelector.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { apiFetch } from '@/lib/api'

type AppStatus = 'saved' | 'dismissed' | 'applied' | 'interviewing' | 'offer' | 'rejected'

interface StatusSelectorProps {
  jobId: string
  initialStatus: AppStatus | null
}

const STATUS_OPTIONS: { value: AppStatus; label: string }[] = [
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'dismissed', label: 'Dismissed' },
]

const STATUS_STYLES: Record<AppStatus, { bg: string; color: string; border: string }> = {
  saved:        { bg: 'rgba(139,92,246,0.12)',  color: '#a78bfa', border: 'rgba(139,92,246,0.3)' },
  applied:      { bg: 'rgba(52,211,153,0.1)',   color: '#34d399', border: 'rgba(52,211,153,0.3)' },
  interviewing: { bg: 'rgba(251,191,36,0.1)',   color: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
  offer:        { bg: 'rgba(52,211,153,0.15)',  color: '#34d399', border: 'rgba(52,211,153,0.4)' },
  rejected:     { bg: 'rgba(100,116,139,0.1)',  color: '#64748b', border: 'rgba(100,116,139,0.25)' },
  dismissed:    { bg: 'rgba(100,116,139,0.08)', color: '#475569', border: 'rgba(100,116,139,0.2)' },
}

export function StatusSelector({ jobId, initialStatus }: StatusSelectorProps) {
  const [status, setStatus] = useState<AppStatus | null>(initialStatus)
  const [saving, setSaving] = useState(false)

  async function handleChange(newStatus: AppStatus) {
    setSaving(true)
    try {
      await apiFetch(`/jobs/${jobId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      setStatus(newStatus)
    } catch {
      // Non-fatal — keep previous status
    } finally {
      setSaving(false)
    }
  }

  const style = status ? STATUS_STYLES[status] : null

  return (
    <select
      value={status ?? ''}
      onChange={(e) => handleChange(e.target.value as AppStatus)}
      disabled={saving}
      aria-label="Application status"
      className="h-9 px-3 rounded-lg text-xs font-mono outline-none cursor-pointer transition-all duration-150"
      style={{
        background: style?.bg ?? '#0f0c1a',
        border: `1px solid ${style?.border ?? 'rgba(139,92,246,0.25)'}`,
        color: style?.color ?? '#64748b',
        opacity: saving ? 0.6 : 1,
      }}
    >
      <option value="" style={{ background: '#0f0c1a', color: '#64748b' }} disabled>
        Track status…
      </option>
      {STATUS_OPTIONS.map(({ value, label }) => (
        <option key={value} value={value} style={{ background: '#0f0c1a', color: '#e2e8f0' }}>
          {label}
        </option>
      ))}
    </select>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd web && git add -A && git commit -m "feat: add StatusSelector component"
```

---

## Task 10: Enable Supabase Realtime + MatchPanel

**Files:**
- Create: `supabase/migrations/004_realtime.sql`
- Create: `web/components/jobs/MatchPanel.tsx`

- [ ] **Step 1: Create `supabase/migrations/004_realtime.sql`**

```sql
-- Enable Supabase Realtime on job_matches so the browser client
-- can receive live Phase 2 score updates via postgres_changes.
ALTER PUBLICATION supabase_realtime ADD TABLE job_matches;
```

- [ ] **Step 2: Apply the migration to your local Supabase**

```bash
npx supabase db push
```

Or via the Supabase dashboard: run the SQL in the SQL editor.

Expected: no error. Realtime replication enabled on `job_matches`.

- [ ] **Step 3: Create `web/components/jobs/MatchPanel.tsx`**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ScoreRing } from './ScoreRing'

interface MatchData {
  score: number
  label: string
  refinedScore: number | null
  aiRefined: boolean
  skillsMatched: string[]
  skillsMissing: string[]
  explanation: string | null
  gaps: string[]
  breakdown: {
    skills: number
    title: number
    location: number
    experience: number
    keywords: number
    salary: number
  } | null
}

interface MatchPanelProps {
  jobId: string
  initial: MatchData
}

const FACTOR_MAX: Record<string, number> = {
  skills: 35,
  title: 20,
  location: 15,
  experience: 15,
  keywords: 10,
  salary: 5,
}

const FACTOR_LABELS: Record<string, string> = {
  skills: 'Skills',
  title: 'Title',
  location: 'Location',
  experience: 'Experience',
  keywords: 'Keywords',
  salary: 'Salary',
}

const FACTOR_COLORS: Record<string, string> = {
  skills: '#34d399',
  title: '#a78bfa',
  location: '#8b5cf6',
  experience: '#fbbf24',
  keywords: '#a78bfa',
  salary: '#34d399',
}

export function MatchPanel({ jobId, initial }: MatchPanelProps) {
  const [data, setData] = useState<MatchData>(initial)

  useEffect(() => {
    if (data.aiRefined) return // already refined — no subscription needed

    const supabase = createClient()
    const channel = supabase
      .channel(`match-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'job_matches',
          filter: `job_id=eq.${jobId}`,
        },
        (payload) => {
          const updated = payload.new as any
          if (updated.ai_refined) {
            setData((prev) => ({
              ...prev,
              refinedScore: updated.refined_score ?? null,
              aiRefined: true,
              skillsMatched: updated.skills_matched ?? prev.skillsMatched,
              skillsMissing: updated.skills_missing ?? prev.skillsMissing,
              explanation: updated.match_explanation ?? prev.explanation,
              gaps: updated.gaps_to_improve ?? prev.gaps,
            }))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [jobId, data.aiRefined])

  const displayScore = data.aiRefined && data.refinedScore != null ? data.refinedScore : data.score
  const isRefining = !data.aiRefined && data.score >= 40

  return (
    <div className="space-y-3">
      {/* Score hero */}
      <div
        className="rounded-xl p-5 relative overflow-hidden"
        style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
      >
        {/* Top gradient bar */}
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: 'linear-gradient(90deg, #34d399, #8b5cf6, transparent)',
          }}
        />

        <div className="flex flex-col items-center mb-4">
          <ScoreRing score={displayScore} label={data.label} size="lg" isRefining={isRefining} />
          {data.aiRefined && (
            <span
              className="font-mono flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs"
              style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399', fontSize: 9 }}
            >
              ✦ AI Refined
            </span>
          )}
        </div>

        {/* Score breakdown */}
        {data.breakdown && (
          <>
            <div className="font-mono text-xs uppercase tracking-widest mb-2" style={{ color: '#64748b', fontSize: 9, letterSpacing: '.1em' }}>
              Score Breakdown
            </div>
            <div className="space-y-2">
              {Object.entries(FACTOR_MAX).map(([key, max]) => {
                const val = (data.breakdown as any)?.[key] ?? 0
                const pct = (val / max) * 100
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="font-mono text-xs flex-shrink-0" style={{ color: '#64748b', width: 72, fontSize: 10 }}>
                      {FACTOR_LABELS[key]}
                    </span>
                    <div className="flex-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: FACTOR_COLORS[key] }}
                      />
                    </div>
                    <span className="font-mono text-xs flex-shrink-0 text-right" style={{ color: FACTOR_COLORS[key], fontSize: 10, width: 32 }}>
                      {val}/{max}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* AI Explanation */}
      {data.explanation && (
        <div
          className="rounded-xl p-4"
          style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
        >
          <div className="font-mono text-xs uppercase tracking-widest mb-2" style={{ color: '#64748b', fontSize: 9 }}>
            AI Explanation
          </div>
          <p className="text-xs italic leading-relaxed" style={{ color: '#94a3b8', lineHeight: 1.7 }}>
            "{data.explanation}"
          </p>
        </div>
      )}

      {/* Gaps to improve */}
      {data.gaps.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{ background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.2)' }}
        >
          <div className="font-mono text-xs uppercase tracking-widest mb-2" style={{ color: '#fbbf24', fontSize: 9 }}>
            Top Gaps to Close
          </div>
          <div className="space-y-0">
            {data.gaps.slice(0, 3).map((gap, i) => (
              <div
                key={i}
                className="flex gap-2.5 py-2 text-xs"
                style={{ borderBottom: i < data.gaps.length - 1 ? '1px solid rgba(251,191,36,0.1)' : 'none', color: '#cbd5e1', lineHeight: 1.5 }}
              >
                <span className="font-mono flex-shrink-0 mt-0.5" style={{ color: '#fbbf24', fontSize: 9 }}>
                  0{i + 1}
                </span>
                {gap}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
cd web && git add -A && git commit -m "feat: add Realtime migration and MatchPanel component"
```

---

## Task 11: Job detail page

**Files:**
- Create: `web/app/(app)/jobs/[id]/page.tsx`

- [ ] **Step 1: Create `web/app/(app)/jobs/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink, Bookmark } from 'lucide-react'
import { serverFetch } from '@/lib/api'
import { MatchPanel } from '@/components/jobs/MatchPanel'
import { StatusSelector } from '@/components/jobs/StatusSelector'
import type { Job } from '@/components/jobs/JobCard'

interface JobDetail extends Job {
  description: string | null
  requirements: string | null
  extracted_skills: string[]
  skills_matched: string[] | null
  skills_missing: string[] | null
  match_explanation: string | null
  gaps_to_improve: string[] | null
  match_breakdown: {
    skills: number
    title: number
    location: number
    experience: number
    keywords: number
    salary: number
  } | null
}

function formatSalary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null
  const fmt = (n: number) => `$${n.toLocaleString()}`
  if (min && max) return `${fmt(min)} – ${fmt(max)}`
  if (min) return `${fmt(min)}+`
  return null
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  let job: JobDetail
  try {
    job = await serverFetch<JobDetail>(`/jobs/${params.id}`)
  } catch {
    notFound()
  }

  const initials = (job.company ?? '?').slice(0, 2).toUpperCase()
  const salary = formatSalary(job.salary_min, job.salary_max)

  return (
    <div className="max-w-5xl">
      {/* Breadcrumb */}
      <div
        className="flex items-center gap-2 font-mono text-xs mb-6 -mt-2 pb-4"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.15)' }}
      >
        <Link href="/jobs" className="flex items-center gap-1" style={{ color: '#a78bfa' }}>
          ← Jobs
        </Link>
        <span style={{ color: '#334155' }}>/</span>
        <span className="truncate" style={{ color: '#64748b', maxWidth: 300 }}>{job.title}</span>
      </div>

      {/* Job header */}
      <div className="flex gap-5 mb-6">
        <div
          className="flex-shrink-0 flex items-center justify-center font-mono font-bold"
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            background: 'rgba(139,92,246,0.1)',
            border: '1px solid rgba(139,92,246,0.3)',
            color: '#a78bfa',
            fontSize: 16,
          }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-xl mb-2 leading-tight" style={{ color: '#e2e8f0', letterSpacing: '-.01em' }}>
            {job.title}
          </h1>
          <div className="flex items-center gap-2 flex-wrap text-xs mb-4" style={{ color: '#94a3b8' }}>
            <span className="font-semibold" style={{ color: '#cbd5e1' }}>{job.company}</span>
            {job.location && <><span style={{ color: '#334155' }}>·</span><span>{job.location}</span></>}
            {job.is_remote && (
              <span className="font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', fontSize: 9 }}>
                Remote
              </span>
            )}
            {salary && (
              <span className="font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(52,211,153,0.08)', color: '#34d399', fontSize: 9 }}>
                {salary}
              </span>
            )}
            {job.posted_at && (
              <span className="font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: '#64748b', fontSize: 9 }}>
                {timeAgo(job.posted_at)}
              </span>
            )}
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2">
            {job.apply_url && (
              <a
                href={job.apply_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
              >
                Apply Now
                <ExternalLink size={11} />
              </a>
            )}
            <StatusSelector jobId={job.id} initialStatus={job.application_status as any} />
          </div>
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-[1fr_280px] gap-5">

        {/* Left: job content */}
        <div className="space-y-4">
          {job.description && (
            <div
              className="rounded-xl p-5"
              style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
            >
              <div className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: '#64748b', fontSize: 9 }}>
                Description
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#94a3b8', lineHeight: 1.75 }}>
                {job.description}
              </p>
            </div>
          )}

          {job.requirements && (
            <div
              className="rounded-xl p-5"
              style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
            >
              <div className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: '#64748b', fontSize: 9 }}>
                Requirements
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#94a3b8', lineHeight: 1.75 }}>
                {job.requirements}
              </p>
            </div>
          )}

          {/* Skills analysis */}
          {((job.skills_matched?.length ?? 0) > 0 || (job.skills_missing?.length ?? 0) > 0) && (
            <div
              className="rounded-xl p-5"
              style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
            >
              <div className="font-mono text-xs uppercase tracking-widest mb-4" style={{ color: '#64748b', fontSize: 9 }}>
                Skills Analysis
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="font-mono text-xs mb-2" style={{ color: '#34d399', fontSize: 10 }}>
                    Matched ({job.skills_matched?.length ?? 0})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(job.skills_matched ?? []).map((s) => (
                      <span
                        key={s}
                        className="font-mono px-2 py-1 rounded text-xs"
                        style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', fontSize: 11 }}
                      >
                        ✓ {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-xs mb-2" style={{ color: '#fbbf24', fontSize: 10 }}>
                    Missing ({job.skills_missing?.length ?? 0})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(job.skills_missing ?? []).map((s) => (
                      <span
                        key={s}
                        className="font-mono px-2 py-1 rounded text-xs"
                        style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', fontSize: 11 }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: AI match panel */}
        <MatchPanel
          jobId={job.id}
          initial={{
            score: job.match_score,
            label: job.match_label,
            refinedScore: job.refined_score,
            aiRefined: job.ai_refined,
            skillsMatched: job.skills_matched ?? [],
            skillsMissing: job.skills_missing ?? [],
            explanation: job.match_explanation,
            gaps: job.gaps_to_improve ?? [],
            breakdown: job.match_breakdown,
          }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify job detail in browser**

Navigate to http://localhost:3000/jobs, click a job card. Verify:
- Breadcrumb shows "← Jobs / Job Title"
- Header shows company initials avatar, title, company/location/salary badges
- "Apply Now" link opens the job URL
- StatusSelector dropdown changes status and persists on refresh
- Left column shows description, requirements, skills matched/missing
- Right column shows MatchPanel with score ring, breakdown bars
- If `ai_refined = false`, the score ring shows pulsing "Refining" indicator
- If `ai_refined = true`, shows "✦ AI Refined" chip, explanation, and gaps

- [ ] **Step 3: Commit**

```bash
cd web && git add -A && git commit -m "feat: complete job detail page with MatchPanel and StatusSelector"
```

---

## Self-Review Checklist

Before marking this plan complete, verify:
- [ ] Dashboard loads at `/dashboard` with real data (not the "Auth working" placeholder)
- [ ] All 4 stat cards show counts from Supabase
- [ ] `/jobs` page filters update the URL and re-fetch from the API
- [ ] Job cards show correct score ring color: green (excellent), purple (strong), amber (good), grey (low)
- [ ] `/jobs/:id` detail page loads — MatchPanel renders score breakdown bars
- [ ] StatusSelector correctly calls `PATCH /api/v1/jobs/:id/status` and updates without page reload
- [ ] Supabase Realtime migration applied — MatchPanel subscribes when `ai_refined = false`
- [ ] No TypeScript errors: `cd web && npx tsc --noEmit`
- [ ] Sidebar active state highlights the current page
