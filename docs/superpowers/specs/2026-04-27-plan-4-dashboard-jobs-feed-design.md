# Plan 4 — Dashboard + Jobs Feed UI Design

## Goal

Build the frontend UI that connects to the Jobs Pipeline (Plan 3). Three pages: a Dashboard overview (stat widgets + top matches), a Jobs feed (`/jobs` — paginated list with filters), and a Job detail view (`/jobs/[id]` — full job info with AI match breakdown). No new backend work — all data comes from the APIs built in Plans 1–3.

---

## Architecture

**Approach:** URL-param driven Server Components with isolated Client Component islands for interactivity and Realtime.

- `/dashboard` and `/jobs` are Next.js Server Components that read `searchParams` and fetch data at render time — fast initial paint, no loading skeleton for the list.
- Filter inputs on `/jobs` are a Client Component (`JobFilters`) that calls `router.push()` to update URL params on change, triggering a server re-render.
- `/jobs/[id]` is a Server Component for the static content; `MatchPanel` is a Client Component that subscribes to Supabase Realtime for live Phase 2 score updates.
- Dashboard stats are fetched via the Supabase SSR client directly in the Server Component (no Express round-trip needed for aggregate queries).
- All other data fetches (jobs list, job detail, mutations) use the existing `apiFetch` helper from `web/lib/api.ts`.

**Tech stack:** Next.js 14 App Router · React 18 · Tailwind CSS · Supabase SSR + Realtime · Fira Code + Fira Sans (Google Fonts) · Lucide React (SVG icons)

---

## Design System

| Token | Value |
|-------|-------|
| Background base | `#0a0a0f` |
| Background surface | `#0f0c1a` |
| Background raised | `#13101f` |
| Border default | `rgba(139,92,246,0.15)` |
| Border strong | `rgba(139,92,246,0.35)` |
| Purple accent | `#8b5cf6` / `#a78bfa` |
| Score: Strong (≥80) | `#34d399` (green) |
| Score: Good (60–79) | `#a78bfa` (purple) |
| Score: Possible (40–59) | `#fbbf24` (amber) |
| Heading font | Fira Code (monospace, uppercase labels, scores, numbers) |
| Body font | Fira Sans |
| Icon set | Lucide React — consistent 14–16px stroke icons, no emojis |
| Transition duration | 150–200ms ease |
| Border radius | 8px chips · 10px cards · 12px panels |

---

## Pages & Routes

### Dashboard (`/dashboard`)

Server Component. Replaces the current placeholder.

**Layout:**
- Page header: "Dashboard" heading + subtitle (last refresh time, next auto-refresh countdown) + "Refresh Jobs" button (Client Component)
- **4 stat widgets** in a grid row:
  - Strong Matches (score ≥ 80) — green accent bar
  - Total Matched (score ≥ 40) — purple accent bar
  - Applied — amber accent bar
  - Saved — pink accent bar
- **Two-column body:**
  - Left: "Top Matches" — top 5 job cards by score, "View all →" links to `/jobs`
  - Right: "Match Distribution" (horizontal bars by label count) + "Recent Activity" (event feed)

**Data fetching:** Supabase SSR client directly in the Server Component (no Express round-trip):
- Stats: four separate count queries on `job_matches` joined to `jobs` filtered by `user_id` — one per label bucket (score ≥ 80, 60–79, 40–59) plus counts from `job_applications` for Applied and Saved statuses.
- Top Matches: `job_matches` joined to `jobs`, ordered by `score DESC`, limit 5, for the authenticated user.
- Recent Activity: derived — most recent `job_matches.created_at` batch (grouped by minute to detect pipeline runs) + most recent `job_applications` status changes. No dedicated events table exists; activity is inferred from these two tables.

**Refresh button:** Client Component — calls `POST /api/v1/jobs/refresh`. Shows loading state, then success or 429 ("Next refresh in Xm") using `last_refresh_at` from the 429 response.

---

### Jobs Feed (`/jobs`)

Server Component reads `searchParams`: `page` (default 1), `min_score` (default 40), `remote` (boolean), `salary_min`, `status`.

**Layout:**
- **Sticky filter bar** (always visible at top):
  - Keyword search input
  - Score chip (Score ≥ N, toggleable presets: 40 / 60 / 80)
  - Remote toggle (green when on)
  - Salary chip ($100k+, $120k+, etc.)
  - Status chip (All / Saved / Applied / Interviewing)
  - Result count ("47 jobs")
- **Job card list** — paginated, 20 per page
- **Pagination bar** — page X of Y, prev/next buttons

**Filter behavior:** `JobFilters` is a `'use client'` component. On any filter change, calls `router.push('/jobs?' + newParams)` — the Server Component re-renders with the new filtered data. No client-side state for the list itself.

**Job card anatomy:**
- Company avatar (2-letter initials, color-coded per company)
- Title, company name, location, remote badge, salary badge, posted date
- Matched skill tags (green ✓) and missing skill tags (amber) — from `skills_matched` / `skills_missing`
- Score ring (circle, colored by label) with label below
- "✦ AI" badge when `ai_refined = true`; pulsing "Refining…" dot when `ai_refined = false` and score ≥ 40
- Application status chip (Saved / Applied / Interviewing / etc.) when set

Clicking a card navigates to `/jobs/[id]`.

---

### Job Detail (`/jobs/[id]`)

Server Component. Calls `GET /api/v1/jobs/:id` (returns full detail + match breakdown).

**Layout:**
- Breadcrumb: `← Jobs / Job Title`
- **Job header:** large company avatar, title, meta row (company, location, remote, salary, posted), action row:
  - "Apply Now ↗" — external link to `apply_url`
  - "Save" button — calls `PATCH /api/v1/jobs/:id/status` with `saved`
  - Status selector (Client Component) — dropdown: `saved` / `dismissed` / `applied` / `interviewing` / `offer` / `rejected` (matches API enum exactly)
- **Two-column body:**
  - **Left:** Description section, Requirements section, Skills Analysis section (matched pills + missing pills)
  - **Right:** AI Match Panel (Client Component — `MatchPanel`)

**MatchPanel (Client Component):**
- Score ring hero (large, colored by label)
- "Strong Match" label + "AI Refined" chip (or "Refining…" pulse if not yet refined)
- Score breakdown — horizontal bars for each Phase 1 factor (Skills 35, Title 20, Location 15, Experience 15, Keywords 10, Salary 5) showing actual points
- AI Explanation — italic paragraph from `match_explanation`
- "Top Gaps to Close" — numbered list from `gaps_to_improve[]`

**Realtime:** `MatchPanel` subscribes to the `job_matches` row for this job via Supabase Realtime browser client. When `ai_refined` flips to `true`, update `refined_score`, `match_explanation`, `skills_matched`, `skills_missing`, `gaps_to_improve` in local state. Unsubscribes on unmount.

---

## Component File Map

**New files:**

```
web/app/(app)/jobs/page.tsx                    — Server Component: jobs feed
web/app/(app)/jobs/[id]/page.tsx               — Server Component: job detail

web/components/jobs/JobFilters.tsx             — Client: filter bar (keyword, score, remote, salary, status)
web/components/jobs/JobCard.tsx                — job card (shared: feed + dashboard top matches)
web/components/jobs/JobList.tsx                — renders list of JobCards with empty state
web/components/jobs/Pagination.tsx             — Client: page controls
web/components/jobs/MatchPanel.tsx             — Client: AI score panel + Supabase Realtime subscription
web/components/jobs/StatusSelector.tsx         — Client: status dropdown → PATCH /jobs/:id/status
web/components/jobs/ScoreRing.tsx              — score circle with color by label (shared: card + panel)

web/components/dashboard/StatWidgets.tsx       — 4 stat cards
web/components/dashboard/TopMatches.tsx        — top 5 JobCards + "View all" link
web/components/dashboard/MatchDistribution.tsx — horizontal bars by label count
web/components/dashboard/RecentActivity.tsx    — activity event list
web/components/dashboard/RefreshButton.tsx     — Client: POST /jobs/refresh + rate-limit feedback
```

**Modified files:**

```
web/app/(app)/dashboard/page.tsx    — replace placeholder, compose dashboard components
web/app/(app)/layout.tsx            — upgrade sidebar: active link highlight, Lucide icons
web/app/layout.tsx                  — add Google Fonts import (Fira Code + Fira Sans)
```

---

## Realtime Phase 2 Flow

1. Job detail page loads — Server Component fetches initial match data (`ai_refined`, `refined_score`, etc.)
2. If `ai_refined = false` and score ≥ 40, `MatchPanel` shows pulsing "Refining…" state and opens a Supabase Realtime subscription on `job_matches` where `id = matchId`
3. When the pipeline updates the row (`ai_refined = true`), Realtime fires — `MatchPanel` updates its local state with the refined data
4. Subscription closes on unmount (navigating away)
5. If `ai_refined = true` on initial load, no Realtime subscription is opened

---

## Rate Limit UX

`RefreshButton` (dashboard) behavior:
- On click: POST `/api/v1/jobs/refresh` → 202 → show "Refreshing…" spinner
- On 429: parse error message, show "Next refresh available in Xm" (grey, disabled)
- On success: show brief "✓ Refresh triggered" state, reset after 3s

---

## API Endpoints Used

| Endpoint | Used by |
|----------|---------|
| `GET /api/v1/jobs` | Jobs feed page (Server Component via fetch) |
| `GET /api/v1/jobs/:id` | Job detail page (Server Component via fetch) |
| `POST /api/v1/jobs/refresh` | RefreshButton (Client Component) |
| `PATCH /api/v1/jobs/:id/status` | StatusSelector (Client Component) |
| Supabase Realtime `job_matches` | MatchPanel (Client Component) |
| Supabase SSR (direct) | Dashboard stats aggregate |

---

## Known Constraints

- **No `/tracker` or `/analytics` pages** — those are Plan 5 and future. Sidebar links are present but lead to placeholder pages (or 404).
- **`preferred_locations` not collected in UI** — some non-remote users may see 0 jobs (existing Plan 3 constraint). Dashboard shows an informational nudge if `total_matched = 0` and `work_preference ≠ 'remote'`.
- **No web UI for application notes** — Plan 5 scope.
- **Server Component fetch auth** — Server Components that call the Express API need to pass the Supabase session token. Use `createClient()` (SSR) to get the session, then pass it as a Bearer token in the server-side fetch.
