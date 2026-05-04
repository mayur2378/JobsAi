# Admin Analytics Dashboard — Design Spec

## Goal

Build a private `/admin` page visible only to the app owner that shows business and engagement metrics: user growth, daily page views, job pipeline health, and application funnel — with a 7d / 30d / 90d time range toggle.

## Architecture

Server-rendered Next.js page in a new `(admin)` route group. All data queries run server-side using the Supabase service role key (bypasses RLS), so aggregation results are never exposed to the client. Time range is a URL search param (`?range=7|30|90`, default `30`). No new Express API endpoints needed.

**Tech stack:** Next.js 14 App Router · Supabase (service role) · Recharts · Lucide icons

---

## Section 1: Page View Tracking Infrastructure

### 1a. New Supabase table: `page_views`

```sql
CREATE TABLE page_views (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  path       text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Users can insert their own rows; admin reads all via service role
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users insert own views"
  ON page_views FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE INDEX page_views_created_at_idx ON page_views (created_at DESC);
CREATE INDEX page_views_user_created_at_idx ON page_views (user_id, created_at DESC);
```

### 1b. Client-side page view logger

A `<PageViewLogger />` client component (`'use client'`) mounts in the authenticated app layout (`web/app/(app)/layout.tsx`). On each mount it fires:

```
POST /api/track   body: { path: window.location.pathname }
```

The route handler at `web/app/api/track/route.ts`:
- Reads the Supabase session (anon key, SSR client)
- Inserts `{ user_id, path }` into `page_views`
- Returns `204` — fire-and-forget, no UI feedback needed

This adds zero latency to page loads.

---

## Section 2: Admin Route Protection

### Middleware update (`web/middleware.ts`)

Add a check before the existing auth redirect logic:

```typescript
if (pathname.startsWith('/admin')) {
  const adminId = process.env.ADMIN_USER_ID
  if (!adminId || !user || user.id !== adminId) {
    return NextResponse.rewrite(new URL('/not-found', req.url))
  }
}
```

Returns 404 (not 403) — no indication the route exists for non-admins.

### Environment variable

```
ADMIN_USER_ID=<your-supabase-user-uuid>
```

Add to `web/.env.local` (never committed).

---

## Section 3: Route Structure

New route group `(admin)` — no sidebar, no user nav, no onboarding checks.

```
web/app/
  (admin)/
    layout.tsx          ← minimal layout: just a top bar with "Admin · JobTrack AI"
    admin/
      page.tsx          ← main dashboard, async server component
```

URL: `/admin?range=30`

---

## Section 4: Data Queries

All queries live in `web/components/admin/adminQueries.ts`. Each function accepts `{ range: 7 | 30 | 90 }` and queries via `supabaseAdmin` (service role key).

### Helper

```typescript
function rangeStart(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}
```

### Query functions

| Function | Table(s) | Returns |
|---|---|---|
| `fetchUserStats(range)` | `profiles` | totalUsers, newSignups, activeUsers, onboardingRate |
| `fetchEngagementStats(range)` | `page_views` | totalViews, dailyAvgViews, viewsPerUser, topPages (top 5) |
| `fetchJobStats(range)` | `jobs`, `job_matches` | totalJobs, jobsAdded, totalMatches, avgMatchScore |
| `fetchFunnelStats(range)` | `job_applications` | saved, applied, interviewing, offers, rejected, applyRate |
| `fetchDailyViews(range)` | `page_views` | `{ date, count }[]` for chart |
| `fetchDailySignups(range)` | `profiles` | `{ date, count }[]` for chart |

All 6 queries run in parallel via `Promise.all` in the page component.

**Active users** = distinct `user_id` values in `page_views` within the period.

**Apply rate** = `applied / (saved + applied + interviewing + offers)` — excludes dismissed/rejected from numerator and denominator.

---

## Section 5: UI Components

```
web/components/admin/
  adminQueries.ts         ← all 6 query functions
  StatCard.tsx            ← single metric card (value, label, sub-text, color)
  StatSection.tsx         ← section header + grid of StatCards
  FunnelRow.tsx           ← 5 status boxes + apply rate box
  DailyViewsChart.tsx     ← Recharts BarChart, 'use client'
  DailySignupsChart.tsx   ← Recharts BarChart, 'use client'
  RangeToggle.tsx         ← 7d/30d/90d buttons, updates URL search param, 'use client'
  TopPagesTable.tsx       ← simple table: path | views count
```

### Page layout (top to bottom)

1. Header bar: "Admin · JobTrack AI" + `<RangeToggle />`
2. **Users** section — 4 StatCards (total, active, new signups, onboarding rate)
3. **Engagement** section — 4 StatCards + `<TopPagesTable />`
4. **Jobs & Matching** section — 4 StatCards
5. **Application Funnel** section — `<FunnelRow />`
6. **Charts** row — `<DailyViewsChart />` + `<DailySignupsChart />` side by side

### Color coding (matches existing app palette)

- Users → sky-400 (`#38bdf8`)
- Engagement → violet-400 (`#a78bfa`)
- Jobs & Matching → emerald-400 (`#34d399`)
- Funnel → amber-400 (`#fbbf24`)

---

## Section 6: Files Created / Modified

| Action | Path |
|---|---|
| Create | `supabase/migrations/20260503_page_views.sql` |
| Create | `web/app/api/track/route.ts` |
| Create | `web/components/layout/PageViewLogger.tsx` |
| Modify | `web/app/(app)/layout.tsx` — mount `<PageViewLogger />` |
| Modify | `web/middleware.ts` — add admin route guard |
| Create | `web/app/(admin)/layout.tsx` |
| Create | `web/app/(admin)/admin/page.tsx` |
| Create | `web/components/admin/adminQueries.ts` |
| Create | `web/components/admin/StatCard.tsx` |
| Create | `web/components/admin/StatSection.tsx` |
| Create | `web/components/admin/FunnelRow.tsx` |
| Create | `web/components/admin/DailyViewsChart.tsx` |
| Create | `web/components/admin/DailySignupsChart.tsx` |
| Create | `web/components/admin/RangeToggle.tsx` |
| Create | `web/components/admin/TopPagesTable.tsx` |

---

## Out of Scope

- Real-time updates (page refreshes manually)
- Email reports / scheduled digests
- Multi-admin support
- Error rate / API latency monitoring
- Export to CSV
