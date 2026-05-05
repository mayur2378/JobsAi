# JobTrack AI — Requirements & Design Document

**Version:** 1.0  
**Date:** 2026-05-04  
**Status:** Production MVP

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [User Roles & Access](#2-user-roles--access)
3. [Functional Requirements](#3-functional-requirements)
4. [System Architecture](#4-system-architecture)
5. [Data Model](#5-data-model)
6. [Matching Algorithm](#6-matching-algorithm)
7. [API Design](#7-api-design)
8. [Frontend Design](#8-frontend-design)
9. [Background Workers](#9-background-workers)
10. [Security](#10-security)
11. [Infrastructure & Deployment](#11-infrastructure--deployment)
12. [Known Limitations & Future Work](#12-known-limitations--future-work)

---

## 1. Product Overview

JobTrack AI is a job search intelligence platform that automatically sources job listings, scores them against a user's profile using a two-phase AI matching algorithm, and tracks applications through their full lifecycle.

**Core value proposition:** Users do not manually search for jobs. The system scrapes relevant listings every two hours, ranks them by fit, and surfaces the best matches on a dashboard. A Claude-powered AI then refines scores asynchronously and explains why each job is or isn't a strong match.

**Primary user journey:**

1. User registers and completes a 4-step onboarding (profile → resume → skills → confirm)
2. System scrapes jobs matching their titles and locations
3. Jobs are scored and ranked; best matches appear on the dashboard
4. Claude refines the top matches with detailed skill analysis and explanations
5. User tracks applications through a Kanban board with notes and reminders
6. Push notifications fire for interview reminders and new high-match jobs

---

## 2. User Roles & Access

### 2.1 Regular User
- Self-registers via email/password (Supabase Auth)
- Manages own profile, resume, skills
- Views own job matches only
- Manages own applications, notes, reminders
- Receives push notifications

### 2.2 Admin
- Identified by a single `ADMIN_USER_ID` environment variable (single-admin model)
- Accesses `/admin` analytics dashboard
- Views system-wide aggregated metrics (no access to individual user data)
- Admin route returns HTTP 404 for all non-admins (obscures route existence)

### 2.3 Access Control Model
- All database tables use Supabase Row-Level Security (RLS)
- Users can only read/write their own rows
- Background workers use the `service_role` key which bypasses RLS
- API server verifies Supabase JWT on every request; attaches `userId` to request context
- Next.js middleware enforces auth on all protected routes before rendering

---

## 3. Functional Requirements

### 3.1 Authentication

| ID | Requirement |
|----|-------------|
| AUTH-1 | Users register with email and password |
| AUTH-2 | Users log in with email and password |
| AUTH-3 | Password reset via email link |
| AUTH-4 | Authenticated session persisted via Supabase JWT (httpOnly cookie via SSR client) |
| AUTH-5 | Unauthenticated users accessing protected routes are redirected to `/login` |
| AUTH-6 | Authenticated users accessing `/login` or `/register` are redirected to `/dashboard` |
| AUTH-7 | A profile row is automatically created in `profiles` on `auth.users` insert via database trigger |

### 3.2 Onboarding

| ID | Requirement |
|----|-------------|
| ONB-1 | New users are redirected to `/onboarding/profile` until `onboarding_completed = true` |
| ONB-2 | Step 1 (Profile): Collect full_name (required), location, phone, work_preference, years_experience, salary_min/max, desired_titles[], industries[] |
| ONB-3 | Step 2 (Resume): Upload PDF or DOCX, max 10 MB; file stored in Supabase Storage |
| ONB-4 | Resume is parsed asynchronously by Claude; user can poll for parse completion |
| ONB-5 | Step 3 (Skills): Resume-extracted skills pre-populated; user can add/remove/set proficiency |
| ONB-6 | Step 4 (Confirm): Mark `onboarding_completed = true`; trigger initial job scrape + match compute |
| ONB-7 | Users can return to the profile and resume pages after onboarding to update them |

### 3.3 Job Matching

| ID | Requirement |
|----|-------------|
| JOB-1 | Jobs are sourced from JSearch API using user's desired_titles and preferred_locations |
| JOB-2 | Jobs are globally deduped by `external_id`; same job is not inserted twice |
| JOB-3 | Each job is scored per-user using a rule-based Phase 1 algorithm (see §6) |
| JOB-4 | Jobs scoring ≥ 40 are queued for Phase 2 Claude refinement |
| JOB-5 | Phase 2 produces: refined_score, skills_matched, skills_missing, match_explanation, gaps_to_improve |
| JOB-6 | Phase 2 results pushed to the browser in real time via Supabase Realtime on `job_matches` |
| JOB-7 | When AI-refined, the `match_score` column is promoted to `refined_score` value so all filters and sorts reflect the AI score |
| JOB-8 | Users can manually trigger a refresh (rate-limited to once per hour) |
| JOB-9 | Scheduler auto-refreshes jobs for all users every 2 hours |

### 3.4 Job Browsing & Filtering

| ID | Requirement |
|----|-------------|
| JOBS-1 | Jobs list is paginated (20 per page) and sorted by match_score descending |
| JOBS-2 | Users can filter by minimum match score (slider or preset thresholds) |
| JOBS-3 | Users can filter to remote-only jobs |
| JOBS-4 | Users can filter by application status (saved, applied, interviewing, etc.) |
| JOBS-5 | Users can keyword-search by job title or company name (client-side filter on current page) |
| JOBS-6 | Job detail page shows full description, requirements, skills analysis, match breakdown |
| JOBS-7 | Match panel on job detail subscribes to Realtime and updates when Phase 2 completes |
| JOBS-8 | Users can apply (external link), save, or dismiss directly from job detail |

### 3.5 Application Tracker

| ID | Requirement |
|----|-------------|
| TRK-1 | Applications are displayed as a Kanban board with columns: Saved, Applied, Interviewing, Offer, Rejected |
| TRK-2 | Cards are draggable between columns; drag updates application status in real time |
| TRK-3 | Each card shows: job title, company, match score, key dates |
| TRK-4 | Users can add free-text notes to any application |
| TRK-5 | Users can create reminders with a type (interview, followup, deadline, custom), date/time, and message |
| TRK-6 | When an application moves to "Interviewing", a push notification is sent |
| TRK-7 | Dismissed applications are hidden from the Kanban board |

### 3.6 Notifications & Reminders

| ID | Requirement |
|----|-------------|
| NOTIF-1 | Users can register their browser for PWA push notifications |
| NOTIF-2 | Push tokens are stored per user and platform (web / android) |
| NOTIF-3 | The notification worker runs every 15 minutes and fires due reminders |
| NOTIF-4 | Fired reminders create an in-app notification and send a push notification via FCM |
| NOTIF-5 | New high-match jobs trigger push notifications |
| NOTIF-6 | Push tokens that are rejected by FCM are automatically deleted |

### 3.7 User Analytics

| ID | Requirement |
|----|-------------|
| ANA-1 | Users can view their own application pipeline health (counts by status) |
| ANA-2 | Users can view their match score distribution across all jobs |
| ANA-3 | Users can view a 12-week trend of their average match score |
| ANA-4 | Page views are tracked per user per path for admin analytics |

### 3.8 Admin Dashboard

| ID | Requirement |
|----|-------------|
| ADM-1 | System-wide user stats: total users, active users, new signups, onboarding completion rate |
| ADM-2 | Engagement stats: total page views, daily average, views per active user, top 5 pages |
| ADM-3 | Job pipeline stats: total jobs in pool, jobs added, total matches computed, average match score |
| ADM-4 | Application funnel: counts and apply rate across saved → applied → interviewing → offer |
| ADM-5 | Time-series charts: daily page views and daily signups |
| ADM-6 | Time range selector: 7, 30, or 90 days |
| ADM-7 | Admin page returns 404 for all non-admin users including unauthenticated visitors |

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Vercel (CDN + SSR)                  │
│                                                         │
│   Next.js 16 App Router                                 │
│   ├── (auth)/*      — login, register, forgot-password  │
│   ├── onboarding/*  — 4-step onboarding wizard          │
│   ├── (app)/*       — dashboard, jobs, tracker, etc.    │
│   └── (admin)/admin — system analytics (admin only)     │
└──────────────┬──────────────────────────────────────────┘
               │  HTTPS (JWT in Authorization header)
               │
┌──────────────▼──────────────────────────────────────────┐
│                  Railway (Express API)                  │
│                                                         │
│   /api/v1/                                              │
│   ├── profile     — CRUD user profile                   │
│   ├── resume      — upload, parse, poll                 │
│   ├── skills      — CRUD skills + trigger recompute     │
│   ├── jobs        — list, detail, filter, refresh       │
│   ├── applications — Kanban CRUD + notes + reminders    │
│   ├── notifications — push token registration           │
│   └── health      — liveness check                     │
│                                                         │
│   Background Workers (same process)                     │
│   ├── Scheduler       — scrape + match every 2h        │
│   ├── Match Engine    — Phase 1 + Phase 2 scoring       │
│   ├── Resume Parser   — Claude-powered extraction       │
│   └── Notification Worker — reminders every 15min       │
└──────────────┬──────────────────────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌──────▼──────────────────────────────────┐
│  Supabase   │  │  External Services                       │
│             │  │                                          │
│  PostgreSQL │  │  ├── Anthropic Claude (resume parse +   │
│  Auth       │  │  │       match refinement)               │
│  Storage    │  │  ├── JSearch / RapidAPI (job scraping)   │
│  Realtime   │  │  ├── Firebase FCM (push notifications)   │
│             │  │  └── Resend (planned transactional email)│
└─────────────┘  └──────────────────────────────────────────┘
```

### 4.1 Key Architecture Decisions

**Separate API server (not Next.js API routes)**  
Background workers need a persistent process. Next.js serverless functions on Vercel are stateless and cannot run cron jobs. The Express API on Railway hosts the workers alongside the REST endpoints in a single long-running process.

**In-memory queue (p-queue, no Redis)**  
Phase 2 Claude calls are queued in-process using p-queue. This avoids a Redis dependency and keeps Railway costs minimal for MVP scale. Tradeoff: queue is lost on restart, and cannot scale horizontally.

**Supabase Realtime for Phase 2 delivery**  
Rather than polling, the frontend subscribes to `job_matches` UPDATE events via Supabase Realtime WebSocket. When the API writes the refined score, the browser receives it within ~500ms without any polling overhead.

**Prompt caching for Claude**  
The user's parsed resume is sent as a cacheable prefix in every Phase 2 request. Claude caches the resume context for 5 minutes; subsequent refinements for different jobs hit the cache (~90% rate), cutting token costs by ~70%.

---

## 5. Data Model

### 5.1 Entity Relationship Summary

```
auth.users (Supabase)
    │ 1:1
    ▼
profiles ──────────────────────┐
    │ 1:N                       │
    ├── resumes                  │
    ├── skills                  │
    ├── push_tokens             │
    ├── page_views              │
    ├── notifications           │
    └── job_applications ───────┤
             │ N:1              │
             ├── jobs ◄─────────┘
             │    │ 1:N
             │    └── job_matches (per user per job)
             │
             ├── notes
             └── reminders
```

### 5.2 Table Definitions

#### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | = auth.users.id |
| full_name | varchar | |
| phone | varchar | |
| location | varchar | |
| desired_titles | text[] | Used for job scraping queries |
| preferred_locations | text[] | Used for job scraping queries |
| work_preference | enum | remote \| hybrid \| onsite |
| salary_min | int | Annual USD |
| salary_max | int | Annual USD |
| years_experience | int | |
| industries | text[] | |
| priority_skills | text[] | Weighted higher in Phase 1 scoring |
| onboarding_completed | bool | Gates access to app |
| last_refresh_at | timestamptz | Enforces 1/hour rate limit |
| updated_at | timestamptz | |
| created_at | timestamptz | Backfilled from auth.users |

#### `jobs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| external_id | varchar UNIQUE | Dedup key from source |
| source | varchar | e.g. "jsearch" |
| title | varchar | |
| company | varchar | |
| location | varchar | |
| is_remote | bool | |
| description | text | Full job description |
| requirements | text | Extracted requirements section |
| salary_min/max | int | Annual USD |
| apply_url | varchar | External application link |
| posted_at | timestamptz | |
| is_active | bool | Soft delete / expiry flag |
| extracted_skills | text[] | Parsed from description |
| raw_data | jsonb | Original API response |

#### `job_matches`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK | |
| job_id | uuid FK | |
| match_score | int | 0-100; promoted to refined_score after Phase 2 |
| match_label | enum | excellent \| strong \| good \| possible \| low |
| skills_matched | text[] | |
| skills_missing | text[] | |
| match_breakdown | jsonb | Per-factor rule-based scores |
| match_explanation | text | Claude narrative explanation |
| gaps_to_improve | text[] | Up to 3 actionable gaps |
| refined_score | int | Raw Claude output before promotion |
| ai_refined | bool | True after Phase 2 completes |
| refined_at | timestamptz | |
| computed_at | timestamptz | Phase 1 timestamp |

#### `job_applications`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK | |
| job_id | uuid FK | |
| status | enum | saved \| dismissed \| applied \| interviewing \| offer \| rejected |
| applied_at | timestamptz | |
| interview_date | timestamptz | |
| follow_up_date | timestamptz | |
| offer_amount | int | Annual USD |

---

## 6. Matching Algorithm

### 6.1 Phase 1 — Rule-Based Scoring

Runs synchronously when a job is inserted or a user's profile changes. Produces a score from 0–100.

| Factor | Max Points | Method |
|--------|-----------|--------|
| Job title similarity | 40 | Core word matching after stripping seniority words (Senior, Junior, Lead, etc.) |
| Priority skills | 30 | Intersection of user's `priority_skills` with job's `extracted_skills` + description text |
| General skills | 10 | Intersection of all user skills with job text, normalized to 15 skills |
| Location / remote | 5 | Remote match = 5pts; city overlap = 3pts; state overlap = 1pt |
| Keywords | 5 | Overlap of industry/role keywords |
| Experience | 10 | Years required vs user's years_experience |

**Score bands:**

| Score | Label |
|-------|-------|
| 80–100 | excellent |
| 60–79 | strong |
| 40–59 | good |
| 20–39 | possible |
| 0–19 | low |

### 6.2 Phase 2 — Claude AI Refinement

Runs asynchronously for all jobs scoring ≥ 40 in Phase 1. Uses `claude-haiku-4-5` for cost efficiency.

**Input to Claude (structured prompt):**
- **Cached prefix**: User's full parsed resume (name, skills, experience, education, years_experience)
- **Variable suffix**: Job title, company, description, requirements, extracted_skills

**Output (JSON):**
```json
{
  "refined_score": 78,
  "skills_matched": ["React", "TypeScript", "Node.js"],
  "skills_missing": ["AWS", "GraphQL"],
  "match_explanation": "Strong frontend alignment. Missing cloud deployment experience...",
  "gaps_to_improve": [
    "Gain AWS or GCP certification",
    "Build a GraphQL project",
    "Add system design experience"
  ]
}
```

**Post-processing:**
- `match_score` is promoted to `refined_score` value (so list filters use AI score)
- `match_label` recalculated from refined_score bands
- `ai_refined = true`
- Supabase Realtime fires UPDATE event → frontend updates live

**Queue behaviour:** Phase 2 jobs are processed with p-queue (configurable concurrency, default 3). In-memory only; queue resets on process restart.

---

## 7. API Design

### 7.1 Conventions

- Base URL: `https://[railway-domain]/api/v1`
- Auth: `Authorization: Bearer <supabase-jwt>`
- Response envelope:
  ```json
  { "data": <payload> }          // success
  { "error": "<message>" }       // failure
  ```
- All 4xx/5xx responses include `{ "error": "..." }`

### 7.2 Endpoints

#### Profile
| Method | Path | Description |
|--------|------|-------------|
| GET | `/profile` | Fetch authenticated user's profile |
| PUT | `/profile` | Update profile fields |
| POST | `/profile/onboarding` | Mark onboarding complete, trigger initial scrape |

#### Resume
| Method | Path | Description |
|--------|------|-------------|
| POST | `/resume/upload` | Upload PDF/DOCX (multipart, max 10 MB) |
| GET | `/resume` | Fetch active resume with signed URL |
| GET | `/resume/status/:id` | Poll for parse completion |
| POST | `/resume/:id/reparse` | Re-trigger Claude parsing |
| DELETE | `/resume/:id` | Delete resume + storage file |

#### Skills
| Method | Path | Description |
|--------|------|-------------|
| GET | `/skills` | List all skills |
| POST | `/skills` | Add skill; triggers match recompute |
| PUT | `/skills/:id` | Update skill; triggers match recompute |
| DELETE | `/skills/:id` | Delete skill; triggers match recompute |

#### Jobs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/jobs` | Paginated job list with match scores |
| GET | `/jobs/:id` | Full job detail + match breakdown |
| POST | `/jobs/refresh` | Manual scrape + recompute (1/hour/user) |
| PATCH | `/jobs/:id/status` | Update application status |

**Query params for `GET /jobs`:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| limit | int | 20 | Results per page |
| min_score | int | 0 | Minimum match_score |
| remote | bool | — | Remote-only filter |
| status | string | — | Filter by application status |

#### Applications
| Method | Path | Description |
|--------|------|-------------|
| GET | `/applications` | All applications with job details |
| POST | `/applications` | Create/upsert application |
| PUT | `/applications/:id` | Update status, dates, offer_amount |
| DELETE | `/applications/:id` | Remove application |
| GET | `/applications/:id/notes` | Fetch notes |
| POST | `/applications/:id/notes` | Create note |
| DELETE | `/applications/notes/:noteId` | Delete note |
| GET | `/reminders` | Fetch reminders (`?application_id=`) |
| POST | `/reminders` | Create reminder |
| PUT | `/reminders/:id` | Update reminder |
| DELETE | `/reminders/:id` | Delete reminder |

#### Notifications
| Method | Path | Description |
|--------|------|-------------|
| POST | `/notifications/register` | Register push token |

---

## 8. Frontend Design

### 8.1 Design System

**Theme:** Dark purple/midnight colour palette throughout.

| Token | Value | Usage |
|-------|-------|-------|
| bg-base | `#06030f` | Page background |
| bg-surface | `#0f0c1a` | Card/panel background |
| border-default | `rgba(139,92,246,0.15)` | Default border |
| accent-purple | `#8b5cf6` / `#a78bfa` | Primary accent |
| accent-green | `#34d399` | Success / excellent match |
| accent-amber | `#fbbf24` | Warning / in-progress |
| accent-pink | `#ec4899` | Brand gradient second colour |
| text-primary | `#e2e8f0` | Headings |
| text-secondary | `#94a3b8` | Body text |
| text-muted | `#64748b` | Labels, metadata |

**Typography:** Fira Code (monospace) for labels, headings, scores; Fira Sans for body text.

**Border radius:** 8px cards, 12px panels, 9px avatars, 4px chips.

### 8.2 Layout

**Desktop (≥768px):**
- Fixed 208px left sidebar with logo + navigation links + logout
- Main content area: `flex-1 overflow-y-auto p-6`

**Mobile (<768px):**
- Sidebar hidden (`hidden md:flex`)
- Fixed bottom navigation bar with 5 icon+label tabs
- Main content: `p-4 pb-20` (extra bottom padding for bottom nav)
- Bottom nav respects iOS safe-area-inset-bottom

### 8.3 Score Ring Component

Circular indicator displaying match score (0–100) with colour coded by label:

| Label | Colour | Ring colour |
|-------|--------|-------------|
| excellent | `#34d399` (green) | `rgba(52,211,153,0.4)` |
| strong | `#a78bfa` (purple) | `rgba(167,139,250,0.4)` |
| good | `#fbbf24` (amber) | `rgba(251,191,36,0.35)` |
| possible | `#94a3b8` (slate) | `rgba(148,163,184,0.3)` |
| low | `#64748b` (grey) | `rgba(100,116,139,0.3)` |

Two sizes: `sm` (44×44px, font 15px) on list cards; `lg` (72×72px, font 24px) on detail panel.

While Phase 2 is in progress (`!ai_refined && score >= 40`), a pulsing amber "Refining" indicator replaces the label.

### 8.4 Key Pages

**Dashboard** — stats strip (6 counters) + top 3–5 match cards + match distribution sidebar + recent activity feed

**Jobs list** — filter bar (score, remote, status, keyword) + scrollable job card list + pagination. Cards show: company avatar, title, company, location, salary, posted date, score ring, application status badge.

**Job detail** — breadcrumb + header (company, title, metadata, Apply Now button, status selector) + 2-column body (description/requirements/skills analysis | AI match panel). Stacks to 1 column on mobile.

**Tracker** — 5-column Kanban with drag-and-drop cards. Click card opens slide-out panel with notes + reminders.

**Analytics** — pipeline health cards + score distribution bar chart + 12-week score trend line chart.

**Profile** — edit form + resume manager + skills manager.

**Admin** — 4 stat sections (Users, Engagement, Jobs & Matching, Funnel) + 2 time-series charts. 7/30/90 day range toggle.

### 8.5 Realtime Updates

The `MatchPanel` on the job detail page subscribes to:
```
table: job_matches
event: UPDATE
filter: job_id=eq.<jobId>
```

When `ai_refined = true` arrives:
- Score ring updates to refined score
- Label recalculates from refined score
- "AI Refined" badge appears
- Skills matched/missing, explanation, gaps update
- Stale rule-based breakdown is cleared (replaced by AI narrative)

---

## 9. Background Workers

All workers run in the same Railway process as the API server. They start automatically when `NODE_ENV !== 'test'`.

### 9.1 Scheduler (node-cron)
- **Schedule:** `0 */2 * * *` (every 2 hours)
- **Action:** For every user with a completed profile, calls `scrapeForAllActiveUsers()` then `runPipelineForJobs()`
- **Error handling:** Errors per-user are caught and logged; one user failing does not block others

### 9.2 Scraper Worker
- Queries JSearch via RapidAPI using `desired_titles` + `preferred_locations`
- Extracts skills from description using a curated skill vocabulary
- Upserts jobs on `external_id` conflict
- Returns `{ userId, jobIds[] }` for match engine ingestion

### 9.3 Match Engine
- **Phase 1:** Runs synchronously per job; writes `match_score`, `match_label`, `match_breakdown` to `job_matches`
- **Phase 2:** Jobs with score ≥ 40 enqueued via p-queue (concurrency: 3); calls Claude; writes refined fields; triggers Realtime
- **Recompute:** On profile/skills/resume change, all matches for that user are recomputed from Phase 1

### 9.4 Resume Parser
- Triggered on upload or explicit reparse request
- Reads file from Supabase Storage (PDF via pdf-parse, DOCX via mammoth)
- Sends extracted text to Claude with a structured JSON output prompt
- Syncs `skills` table: removes old resume-sourced skills, inserts new ones
- Triggers match recompute after parse completes

### 9.5 Notification Worker (node-cron)
- **Schedule:** `*/15 * * * *` (every 15 minutes)
- Queries `reminders` where `remind_at <= now AND is_sent = false`
- Creates `notifications` row per reminder
- Sends push via Firebase Admin SDK to all registered tokens for user
- Sets `is_sent = true`; auto-deletes stale FCM tokens on send failure

---

## 10. Security

### 10.1 Authentication & Authorisation
- Supabase Auth issues JWTs; API verifies signature on every request
- RLS policies enforce per-user data isolation at the database layer
- Admin access gated by environment variable `ADMIN_USER_ID`; returns 404 (not 403) to avoid leaking route existence

### 10.2 HTTP Security Headers (Next.js)
| Header | Value |
|--------|-------|
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload |
| Permissions-Policy | camera=(), microphone=(), geolocation=(), payment=() |
| Content-Security-Policy | Allows self, Supabase, Firebase, Railway API, Google Fonts |

### 10.3 API Security
- CORS restricted to Vercel frontend origin only (set via `CORS_ORIGIN` env var)
- Rate limiting: 100 req/min general; 10 req/min AI endpoints
- Input validated with Zod schemas before processing
- File uploads: type checked (PDF/DOCX only), size capped at 10 MB, stored in Supabase (not local disk)
- Service role key never exposed to frontend; only used server-side

### 10.4 Service Worker
- Only intercepts same-origin requests
- Cross-origin requests (Supabase, Railway API, Firebase) pass through directly
- Offline fallback returns HTTP 503 rather than undefined (prevents "Failed to convert to Response" crashes)

---

## 11. Infrastructure & Deployment

### 11.1 Services

| Service | Provider | Purpose |
|---------|----------|---------|
| Web frontend | Vercel | Next.js SSR + static assets + CDN |
| API + workers | Railway | Express server + background workers |
| Database | Supabase | PostgreSQL + Auth + Storage + Realtime |
| Job data | RapidAPI (JSearch) | Job listings source |
| AI inference | Anthropic Claude | Resume parsing + match refinement |
| Push | Firebase FCM | Mobile/web push notifications |

### 11.2 Environment Variables

**Vercel (web):**
| Variable | Description |
|----------|-------------|
| NEXT_PUBLIC_SUPABASE_URL | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase publishable key |
| NEXT_PUBLIC_API_URL | Railway API base URL |
| NEXT_PUBLIC_FIREBASE_VAPID_KEY | FCM web push public key |
| SUPABASE_SERVICE_ROLE_KEY | Service role key (admin queries only) |
| ADMIN_USER_ID | UUID of the single admin user |

**Railway (api):**
| Variable | Description |
|----------|-------------|
| SUPABASE_URL | Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | Service role key |
| ANTHROPIC_API_KEY | Claude API key |
| RAPIDAPI_KEY | JSearch API key |
| FIREBASE_SERVICE_ACCOUNT_JSON | Firebase Admin SDK credentials |
| CORS_ORIGIN | Vercel frontend URL (exact, no trailing slash) |
| PORT | Auto-set by Railway |
| NODE_ENV | production |

### 11.3 Database Migrations

Migrations are numbered sequentially and applied manually via Supabase SQL editor:

| File | Purpose |
|------|---------|
| 001_schema.sql | Core tables, enums, indexes |
| 002_rls.sql | Row-level security policies + auto-profile trigger |
| 003_jobs_pipeline.sql | extracted_skills, refined_score, last_refresh_at |
| 004_realtime.sql | Enable Realtime on job_matches |
| 005_tracker_rls.sql | RLS for applications, notes, reminders, notifications |
| 006_priority_skills.sql | priority_skills[] on profiles |
| 007_push_tokens.sql | push_tokens table |
| 008_page_views.sql | page_views table for analytics |
| 009_profile_created_at.sql | created_at on profiles (backfilled from auth.users) |

### 11.4 PWA Configuration
- `manifest.json` with name, icons, theme_color, display: standalone
- Service worker at `/sw.js` handles:
  - Install: caches icons + manifest
  - Activate: clears old caches
  - Fetch: cache-first for images/fonts; network-first for same-origin navigation; cross-origin bypassed entirely
  - Push: shows notification with title/body from FCM payload
  - NotificationClick: opens `/dashboard`

---

## 12. Known Limitations & Future Work

### 12.1 Current Limitations

| Area | Limitation |
|------|------------|
| Queue | Phase 2 queue is in-memory; lost on Railway restart |
| Job data | Single source (JSearch); coverage varies by location/title |
| Admin | Single hardcoded admin; no admin role management |
| Email | Resend integration planned but not implemented |
| Phase 2 | No breakdown bars after AI refinement (rule-based breakdown cleared) |
| Mobile | Capacitor Android build not yet shipped; web PWA only |
| Scale | p-queue cannot scale horizontally; Redis/BullMQ needed at growth |

### 12.2 Planned Enhancements

- **Email notifications** via Resend (interview reminders, new job alerts)
- **Transactional email** for password reset and onboarding welcome
- **Android native** via Capacitor (APK build from web codebase)
- **AI score breakdown** in Phase 2 response (replace rule-based breakdown bars)
- **Bulk dismiss** for low-score jobs
- **Job expiry** — automatically mark jobs inactive after 30 days
- **LinkedIn/Indeed import** via browser extension or OAuth
- **Multi-admin** support with proper role system
- **Redis queue** (BullMQ) for durable Phase 2 processing at scale
- **Webhook** from job sources for near-real-time job ingestion
