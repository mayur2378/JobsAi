# Admin Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private `/admin` page showing user growth, page views, job pipeline health, and application funnel metrics with a 7d/30d/90d time range toggle.

**Architecture:** Server-rendered Next.js page in a new `(admin)` route group; all data queries run server-side using the Supabase service role key (bypasses RLS). Page views are tracked client-side via a `PageViewLogger` component that POSTs to a Next.js route handler on each navigation. Admin route access is gated in middleware by comparing the logged-in user ID to `ADMIN_USER_ID` env var.

**Tech Stack:** Next.js 14.2 App Router · Supabase (service role) · Recharts (already installed) · Lucide icons · Tailwind CSS

---

### Task 1: page_views DB migration

**Files:**
- Create: `supabase/migrations/008_page_views.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/008_page_views.sql
CREATE TABLE IF NOT EXISTS page_views (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

-- Users can log their own views; admin reads all via service role key
CREATE POLICY "users insert own page views"
  ON page_views FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX page_views_created_at_idx     ON page_views (created_at DESC);
CREATE INDEX page_views_user_created_at_idx ON page_views (user_id, created_at DESC);
```

- [ ] **Step 2: Apply the migration**

In Supabase Dashboard → SQL Editor, paste and run the file contents.

Expected: table `page_views` appears in Table Editor with columns `id`, `user_id`, `path`, `created_at`. RLS enabled. Two indexes visible.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/008_page_views.sql
git commit -m "feat: add page_views table for admin analytics"
```

---

### Task 2: Supabase admin client + env variable

**Files:**
- Create: `web/lib/supabase/admin.ts`
- Modify: `web/.env.local` (add two new vars — never committed)

- [ ] **Step 1: Create the admin Supabase client**

```typescript
// web/lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

`SUPABASE_SERVICE_ROLE_KEY` has no `NEXT_PUBLIC_` prefix — it is server-only and never exposed to the browser.

- [ ] **Step 2: Add env variables to web/.env.local**

Open `web/.env.local` and append:

```
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
ADMIN_USER_ID=<your-supabase-user-uuid>
```

Find the service role key: Supabase Dashboard → Project Settings → API → `service_role` key.
Find your user UUID: Supabase Dashboard → Authentication → Users → copy your UUID.

- [ ] **Step 3: Verify .env.local is gitignored**

```bash
git check-ignore -q web/.env.local && echo "ignored" || echo "NOT IGNORED - fix now"
```

Expected: `ignored`

- [ ] **Step 4: Commit the new client file**

```bash
git add web/lib/supabase/admin.ts
git commit -m "feat: add Supabase service-role client for admin queries"
```

---

### Task 3: POST /api/track route handler

**Files:**
- Create: `web/app/api/track/route.ts`

- [ ] **Step 1: Create the route handler**

```typescript
// web/app/api/track/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const path = body.path
  if (!path || typeof path !== 'string') {
    return new NextResponse(null, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse(null, { status: 401 })

  await supabase.from('page_views').insert({ user_id: user.id, path })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 2: Verify the route exists**

Start the dev server (`cd web && npm run dev`) and run:

```bash
curl -X POST http://localhost:3000/api/track \
  -H "Content-Type: application/json" \
  -d '{"path":"/test"}'
```

Expected: `401` (no session) — the route is reachable.

- [ ] **Step 3: Commit**

```bash
git add web/app/api/track/route.ts
git commit -m "feat: add POST /api/track route for page view logging"
```

---

### Task 4: PageViewLogger component + mount in layout

**Files:**
- Create: `web/components/layout/PageViewLogger.tsx`
- Modify: `web/app/(app)/layout.tsx` (add `<PageViewLogger />`)

- [ ] **Step 1: Create PageViewLogger**

```typescript
// web/components/layout/PageViewLogger.tsx
'use client'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

export function PageViewLogger() {
  const pathname = usePathname()
  useEffect(() => {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname }),
    }).catch(() => {})
  }, [pathname])
  return null
}
```

`useEffect` re-runs every time `pathname` changes, so each client-side navigation logs a new view. `return null` renders nothing.

- [ ] **Step 2: Mount it in the app layout**

Open `web/app/(app)/layout.tsx`. Current imports section:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SidebarNav } from '@/components/layout/SidebarNav'
import { PushSetup } from '@/components/push/PushSetup'
```

Add one import line:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SidebarNav } from '@/components/layout/SidebarNav'
import { PushSetup } from '@/components/push/PushSetup'
import { PageViewLogger } from '@/components/layout/PageViewLogger'
```

Then add `<PageViewLogger />` immediately before `<PushSetup />`:

```typescript
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
      <PageViewLogger />
      <PushSetup />
    </div>
```

- [ ] **Step 3: Verify logging works**

With dev server running, log in, navigate between pages, then check Supabase Dashboard → Table Editor → `page_views`. You should see rows appearing for each page you visited.

- [ ] **Step 4: Commit**

```bash
git add web/components/layout/PageViewLogger.tsx web/app/(app)/layout.tsx
git commit -m "feat: log page views for authenticated users"
```

---

### Task 5: Admin middleware guard

**Files:**
- Modify: `web/middleware.ts`

- [ ] **Step 1: Add the admin guard block**

Open `web/middleware.ts`. The current file ends at line 51 (before `return response`). Add the admin guard immediately after the `getUser()` call (after line 35 `} = await supabase.auth.getUser()`):

```typescript
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Admin route guard — non-admin users get 404 (not 403)
  if (pathname.startsWith('/admin') && user) {
    const adminId = process.env.ADMIN_USER_ID
    if (!adminId || user.id !== adminId) {
      return new NextResponse('Not Found', { status: 404 })
    }
  }

  const isPublic = PUBLIC_PATHS.some(
```

Full updated `web/middleware.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
]

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request })
  const { pathname } = request.nextUrl

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Admin route guard — non-admin users get 404 (not 403)
  if (pathname.startsWith('/admin') && user) {
    const adminId = process.env.ADMIN_USER_ID
    if (!adminId || user.id !== adminId) {
      return new NextResponse('Not Found', { status: 404 })
    }
  }

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith('/onboarding')
  )

  // Not authenticated → redirect to login
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Authenticated → redirect away from auth pages to dashboard
  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Verify the guard**

With dev server running, navigate to `http://localhost:3000/admin`.

Expected: if you're the admin (ADMIN_USER_ID matches), you see a blank page (layout not built yet). If you're a different user, you get a 404 response. If you're logged out, you get redirected to `/login`.

- [ ] **Step 3: Commit**

```bash
git add web/middleware.ts
git commit -m "feat: guard /admin routes by ADMIN_USER_ID env variable"
```

---

### Task 6: Admin data queries

**Files:**
- Create: `web/components/admin/adminQueries.ts`

- [ ] **Step 1: Create adminQueries.ts with all 6 query functions**

```typescript
// web/components/admin/adminQueries.ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors from `adminQueries.ts`.

- [ ] **Step 3: Commit**

```bash
git add web/components/admin/adminQueries.ts
git commit -m "feat: add admin analytics query functions"
```

---

### Task 7: StatCard, StatSection, FunnelRow, TopPagesTable

**Files:**
- Create: `web/components/admin/StatCard.tsx`
- Create: `web/components/admin/StatSection.tsx`
- Create: `web/components/admin/FunnelRow.tsx`
- Create: `web/components/admin/TopPagesTable.tsx`

- [ ] **Step 1: Create StatCard**

```typescript
// web/components/admin/StatCard.tsx
interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  accent: string
  accentDim: string
}

export function StatCard({ label, value, sub, accent, accentDim }: StatCardProps) {
  return (
    <div
      className="rounded-xl p-4 relative overflow-hidden"
      style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
    >
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          borderRadius: '10px 10px 0 0',
          background: `linear-gradient(90deg, ${accent}, transparent)`,
        }}
      />
      <div className="font-mono text-xs uppercase tracking-widest mb-2" style={{ color: '#64748b' }}>
        {label}
      </div>
      <div className="font-mono font-bold leading-none mb-1" style={{ fontSize: 28, color: accent }}>
        {value}
      </div>
      {sub && (
        <div
          className="font-mono inline-flex items-center px-2 py-0.5 rounded"
          style={{ background: accentDim, color: accent, fontSize: 9, letterSpacing: '.04em' }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create StatSection**

```typescript
// web/components/admin/StatSection.tsx
import { StatCard } from './StatCard'

interface StatCardDef {
  label: string
  value: string | number
  sub?: string
  accent: string
  accentDim: string
}

interface StatSectionProps {
  title: string
  cards: StatCardDef[]
  cols?: 3 | 4 | 5
  children?: React.ReactNode
}

const COLS_CLASS: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
}

export function StatSection({ title, cards, cols = 4, children }: StatSectionProps) {
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-xs uppercase tracking-widest" style={{ color: '#64748b' }}>
        {title}
      </h2>
      <div className={`grid ${COLS_CLASS[cols] ?? 'grid-cols-4'} gap-3`}>
        {cards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>
      {children}
    </section>
  )
}
```

- [ ] **Step 3: Create FunnelRow**

```typescript
// web/components/admin/FunnelRow.tsx
import type { FunnelStats } from './adminQueries'

const STEPS = [
  { key: 'saved' as const,        label: 'Saved' },
  { key: 'applied' as const,      label: 'Applied' },
  { key: 'interviewing' as const, label: 'Interviewing' },
  { key: 'offers' as const,       label: 'Offers' },
  { key: 'rejected' as const,     label: 'Rejected' },
]

export function FunnelRow({ stats }: { stats: FunnelStats }) {
  return (
    <div className="grid grid-cols-6 gap-3">
      {STEPS.map(({ key, label }) => (
        <div
          key={key}
          className="rounded-xl p-4 text-center"
          style={{ background: '#0f0c1a', border: '1px solid rgba(251,191,36,0.15)' }}
        >
          <div className="font-mono font-bold" style={{ fontSize: 22, color: '#fbbf24' }}>
            {stats[key]}
          </div>
          <div className="font-mono text-xs mt-1" style={{ color: '#64748b' }}>{label}</div>
        </div>
      ))}
      <div
        className="rounded-xl p-4 text-center"
        style={{ background: '#0f0c1a', border: '1px solid rgba(52,211,153,0.2)' }}
      >
        <div className="font-mono font-bold" style={{ fontSize: 22, color: '#34d399' }}>
          {stats.applyRate}%
        </div>
        <div className="font-mono text-xs mt-1" style={{ color: '#64748b' }}>Apply Rate</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create TopPagesTable**

```typescript
// web/components/admin/TopPagesTable.tsx
interface TopPage {
  path: string
  count: number
}

export function TopPagesTable({ pages }: { pages: TopPage[] }) {
  if (pages.length === 0) {
    return <p className="font-mono text-xs mt-2" style={{ color: '#64748b' }}>No page view data yet</p>
  }
  const max = pages[0]?.count ?? 1
  return (
    <div className="space-y-2 mt-3">
      {pages.map(({ path, count }) => (
        <div key={path} className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div
              className="h-1.5 rounded-full"
              style={{
                background: 'rgba(167,139,250,0.25)',
                width: `${Math.round((count / max) * 100)}%`,
                minWidth: 4,
              }}
            />
          </div>
          <span className="font-mono text-xs shrink-0" style={{ color: '#94a3b8', width: 100, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {path}
          </span>
          <span className="font-mono text-xs shrink-0" style={{ color: '#a78bfa', width: 32, textAlign: 'right' }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors from the four new component files.

- [ ] **Step 6: Commit**

```bash
git add web/components/admin/StatCard.tsx web/components/admin/StatSection.tsx web/components/admin/FunnelRow.tsx web/components/admin/TopPagesTable.tsx
git commit -m "feat: add admin StatCard, StatSection, FunnelRow, TopPagesTable components"
```

---

### Task 8: Chart components and RangeToggle

**Files:**
- Create: `web/components/admin/DailyViewsChart.tsx`
- Create: `web/components/admin/DailySignupsChart.tsx`
- Create: `web/components/admin/RangeToggle.tsx`

- [ ] **Step 1: Create DailyViewsChart**

```typescript
// web/components/admin/DailyViewsChart.tsx
'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { DailyCount } from './adminQueries'

function shortDate(d: string): string {
  const [, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}`
}

export function DailyViewsChart({ data }: { data: DailyCount[] }) {
  if (data.every((d) => d.count === 0)) {
    return (
      <div className="flex items-center justify-center h-40" style={{ color: '#64748b' }}>
        <p className="text-sm font-mono">No view data yet</p>
      </div>
    )
  }
  const chartData = data.map((d) => ({ date: shortDate(d.date), count: d.count }))
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: '#1a1425',
            border: '1px solid rgba(139,92,246,0.3)',
            borderRadius: 8,
            color: '#e2e8f0',
            fontFamily: 'monospace',
            fontSize: 12,
          }}
          cursor={{ fill: 'rgba(167,139,250,0.05)' }}
        />
        <Bar dataKey="count" fill="#a78bfa" radius={[3, 3, 0, 0]} name="views" />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: Create DailySignupsChart**

```typescript
// web/components/admin/DailySignupsChart.tsx
'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { DailyCount } from './adminQueries'

function shortDate(d: string): string {
  const [, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}`
}

export function DailySignupsChart({ data }: { data: DailyCount[] }) {
  if (data.every((d) => d.count === 0)) {
    return (
      <div className="flex items-center justify-center h-40" style={{ color: '#64748b' }}>
        <p className="text-sm font-mono">No signup data yet</p>
      </div>
    )
  }
  const chartData = data.map((d) => ({ date: shortDate(d.date), count: d.count }))
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: '#1a1425',
            border: '1px solid rgba(139,92,246,0.3)',
            borderRadius: 8,
            color: '#e2e8f0',
            fontFamily: 'monospace',
            fontSize: 12,
          }}
          cursor={{ fill: 'rgba(56,189,248,0.05)' }}
        />
        <Bar dataKey="count" fill="#38bdf8" radius={[3, 3, 0, 0]} name="signups" />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 3: Create RangeToggle**

```typescript
// web/components/admin/RangeToggle.tsx
'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

const RANGES = [7, 30, 90] as const

export function RangeToggle({ current }: { current: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setRange(days: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('range', String(days))
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex gap-1.5">
      {RANGES.map((d) => (
        <button
          key={d}
          onClick={() => setRange(d)}
          className="font-mono text-xs px-3 py-1.5 rounded-lg transition-all"
          style={
            current === d
              ? {
                  background: 'rgba(139,92,246,0.2)',
                  border: '1px solid rgba(139,92,246,0.5)',
                  color: '#c4b5fd',
                }
              : {
                  background: 'rgba(139,92,246,0.05)',
                  border: '1px solid rgba(139,92,246,0.15)',
                  color: '#64748b',
                  cursor: 'pointer',
                }
          }
        >
          {d}d
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors from the three new chart/toggle files.

- [ ] **Step 5: Commit**

```bash
git add web/components/admin/DailyViewsChart.tsx web/components/admin/DailySignupsChart.tsx web/components/admin/RangeToggle.tsx
git commit -m "feat: add admin chart components and range toggle"
```

---

### Task 9: Admin layout and page

**Files:**
- Create: `web/app/(admin)/layout.tsx`
- Create: `web/app/(admin)/admin/page.tsx`

- [ ] **Step 1: Create the admin layout**

```typescript
// web/app/(admin)/layout.tsx
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', color: '#e2e8f0' }}>
      <div
        style={{
          borderBottom: '1px solid rgba(139,92,246,0.15)',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          className="font-mono text-xs font-bold"
          style={{ color: '#a78bfa', letterSpacing: '0.08em', textTransform: 'uppercase' }}
        >
          Admin
        </span>
        <span style={{ color: '#334155' }}>·</span>
        <span className="font-mono text-xs" style={{ color: '#64748b' }}>
          JobTrack AI
        </span>
      </div>
      <main style={{ padding: 24 }}>{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Create the admin page**

```typescript
// web/app/(admin)/admin/page.tsx
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
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Verify the page renders**

With dev server running, navigate to `http://localhost:3000/admin`.

Expected:
- Page renders with "Admin · JobTrack AI" header
- 7d / 30d / 90d toggle visible (30d active by default)
- All four metric sections rendered with real values from DB
- Charts render (or show empty-state message if no page_views data yet)
- Clicking range toggle updates URL and re-fetches with new range

- [ ] **Step 5: Commit**

```bash
git add web/app/(admin)/layout.tsx web/app/(admin)/admin/page.tsx
git commit -m "feat: add admin analytics dashboard at /admin"
```
