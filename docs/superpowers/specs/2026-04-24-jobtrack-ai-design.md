# JobTrack AI — Design Spec
**Date:** 2026-04-24  
**Status:** Approved  
**Author:** Mayur Fotedar  

---

## 1. Overview

JobTrack AI is a full-stack, AI-powered job search and application tracking platform for a small group of users (personal + friends/colleagues) with a clear path to scale. Candidates register, upload their resume, add skills, and receive a continuously updating dashboard of matched job opportunities ranked by an AI-powered confidence score. Each application can be tracked through its full lifecycle.

**Phased delivery:**
- **MVP (Phase 1):** Auth → Profile → Resume upload + parsing → Job fetching → Match scores → Dashboard
- **Phase 2:** Analytics, notifications, AI cover letter, skill gap analysis, reminders
- **Phase 3:** Full feature parity with spec, performance optimisation, possible multi-tenancy expansion

---

## 2. Users & Scale

- Primary: Personal use + small trusted group (~5–20 users initially)
- Each user has fully isolated data (jobs matched, applications, notes, resumes)
- No billing or subscription tier required at launch
- Architecture supports horizontal scaling to hundreds of users without refactoring

---

## 3. Tech Stack

| Layer | Technology | Hosting |
|-------|-----------|---------|
| Frontend | Next.js 14 (App Router) + React + Tailwind CSS | Vercel |
| API | Node.js / Express | Railway |
| Database | PostgreSQL | Supabase |
| Auth | Supabase Auth (JWT) | Supabase |
| File Storage | Supabase Storage (S3-compatible) | Supabase |
| Realtime | Supabase Realtime (WebSockets) | Supabase |
| Job Data | SerpAPI / JSearch (web scraping) | External |
| AI | Claude API (Anthropic) with prompt caching | External |
| Email | Resend (transactional, 3k/mo free) | External |
| State (client) | React Query (server) + Zustand (UI) | — |
| Charts | Recharts | — |
| Kanban | @hello-pangea/dnd | — |
| Forms | react-hook-form + Zod | — |

**AWS migration path (future):**

| Now | AWS Equivalent |
|-----|---------------|
| Vercel | AWS Amplify or S3 + CloudFront |
| Railway | ECS Fargate (containerised, no code change) |
| Supabase Postgres | Amazon RDS PostgreSQL |
| Supabase Storage | Amazon S3 (same API surface) |
| Supabase Auth | Amazon Cognito (swap auth middleware only) |

Auth is wrapped behind a `verifyToken(req)` middleware abstraction so the underlying provider is swappable without touching route logic.

---

## 4. Visual Design

- **Style:** Dark Galaxy — deep purple + violet + pink accents on near-black (#0a0a0f)
- **Primary gradient:** `linear-gradient(135deg, #8b5cf6, #ec4899)`
- **Surface:** `#0f0c1a` cards on `#0a0a0f` background
- **Borders:** `rgba(139, 92, 246, 0.15)` default, `rgba(139, 92, 246, 0.4)` on hover/active
- **Typography:** System font stack, 800 weight headings, muted `#6b7280` secondary text
- **Match score colors:** Excellent `#4ade80`, Strong `#34d399`, Good `#fbbf24`, Possible `#fb923c`, Low `#f87171`
- **Fully responsive** (mobile + desktop)
- **Frontend-design skill** used for all production UI implementation

---

## 5. Database Schema

All tables use UUID primary keys. Row-Level Security (RLS) enabled on every table — users can only read/write their own rows.

### 5.1 users
Managed by Supabase Auth.
```
id          uuid PK
email       varchar UNIQUE
created_at  timestamptz
```

### 5.2 profiles
```
id                    uuid PK → users.id
full_name             varchar
phone                 varchar
location              varchar
desired_titles        text[]
preferred_locations   text[]
work_preference       enum(remote, hybrid, onsite)
salary_min            int
salary_max            int
years_experience      int
industries            text[]
onboarding_completed  bool DEFAULT false
updated_at            timestamptz
```

### 5.3 resumes
```
id          uuid PK
user_id     uuid FK → users.id
file_name   varchar
file_url    varchar          -- Supabase Storage URL
file_type   enum(pdf, docx)
parsed_data jsonb            -- { skills[], experience[], education[], certifications[], keywords[] }
is_active   bool DEFAULT false
parsed_at   timestamptz
created_at  timestamptz
```

### 5.4 skills
```
id          uuid PK
user_id     uuid FK → users.id
name        varchar
source      enum(resume, manual)
proficiency enum(beginner, intermediate, expert)
created_at  timestamptz
```

### 5.5 jobs
Shared table — deduped by `external_id`. Scraped once, matched per-user.
```
id           uuid PK
external_id  varchar UNIQUE    -- from SerpAPI/JSearch
source       varchar
title        varchar
company      varchar
location     varchar
is_remote    bool
description  text
requirements text
salary_min   int
salary_max   int
salary_currency varchar
apply_url    varchar
posted_at    timestamptz
expires_at   timestamptz
is_active    bool DEFAULT true
raw_data     jsonb
created_at   timestamptz
```

### 5.6 job_matches
Per-user match data. Computed in two phases (see §7).
```
id                 uuid PK
user_id            uuid FK → users.id
job_id             uuid FK → jobs.id
match_score        int               -- 0–100
match_label        enum(excellent, strong, good, possible, low)
skills_matched     text[]
skills_missing     text[]
match_breakdown    jsonb             -- { required_skills: n, title: n, experience: n, ... }
match_explanation  text              -- Claude-generated narrative
gaps_to_improve    text[]
computed_at        timestamptz
created_at         timestamptz
UNIQUE (user_id, job_id)
```

### 5.7 job_applications
Application lifecycle tracker.
```
id                   uuid PK
user_id              uuid FK → users.id
job_id               uuid FK → jobs.id
status               enum(saved, dismissed, applied, interviewing, offer, rejected)
applied_at           timestamptz
interview_date       timestamptz
follow_up_date       timestamptz
offer_amount         int
created_at           timestamptz
updated_at           timestamptz
UNIQUE (user_id, job_id)
```

### 5.8 notes
```
id                   uuid PK
user_id              uuid FK → users.id
job_application_id   uuid FK → job_applications.id
content              text
created_at           timestamptz
updated_at           timestamptz
```

### 5.9 reminders
```
id                   uuid PK
user_id              uuid FK → users.id
job_application_id   uuid FK → job_applications.id
reminder_type        enum(interview, followup, deadline, custom)
remind_at            timestamptz
message              text
is_sent              bool DEFAULT false
created_at           timestamptz
```

### 5.10 notifications
```
id          uuid PK
user_id     uuid FK → users.id
type        enum(new_jobs, interview_reminder, followup, offer, system)
title       varchar
message     text
is_read     bool DEFAULT false
metadata    jsonb
created_at  timestamptz
```

---

## 6. API Design

Base path: `/api/v1`  
All routes except `/auth/*` require `Authorization: Bearer <supabase_jwt>` header.  
Standard response envelope: `{ data, error, meta }`.  
Pagination: `?page=1&limit=20` on all list endpoints.  
Rate limiting: 100 req/min per user; 10 req/min on `/ai/*` endpoints.  
File uploads: max 10 MB, PDF/DOCX only, validated server-side.

### Auth
```
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/forgot-password
POST /auth/reset-password
```

### Profile & Skills
```
GET  /profile
PUT  /profile
POST /profile/onboarding
GET  /skills
POST /skills
PUT  /skills/:id
DEL  /skills/:id
```

### Resume
```
POST /resume/upload          multipart/form-data
GET  /resume                 active resume + parsed_data
POST /resume/:id/reparse     re-trigger Claude parsing
DEL  /resume/:id
```

### Jobs
```
GET  /jobs                   ?keyword &location &remote &salary_min &salary_max
                             &date_posted &match_min &match_max &status &sort &page &limit
GET  /jobs/:id
GET  /jobs/:id/match         per-user match details (cached)
POST /jobs/refresh           manual SerpAPI trigger
```

### Applications (Tracker)
```
GET  /applications           ?status &page &limit
POST /applications           { job_id, status }
PUT  /applications/:id       { status, applied_at, interview_date, offer_amount }
DEL  /applications/:id
GET  /applications/:id/notes
POST /applications/:id/notes { content }
PUT  /notes/:id
DEL  /notes/:id
```

### Reminders & Notifications
```
GET  /reminders
POST /reminders
PUT  /reminders/:id
DEL  /reminders/:id
GET  /notifications
PUT  /notifications/:id/read
PUT  /notifications/read-all
```

### Analytics
```
GET  /analytics/summary             widget counts
GET  /analytics/jobs-by-status
GET  /analytics/match-distribution
GET  /analytics/skills-demand
```

### AI (Claude-powered)
```
POST /ai/cover-letter        { job_id } → generated letter
POST /ai/skill-gap           { job_id } → gap analysis
GET  /ai/resume-suggestions  → improvement tips for active resume
```

---

## 7. Matching Algorithm

### Phase 1 — Fast Scoring (all new jobs, ~ms, free)
Rule-based, runs synchronously when new jobs are scraped.

| Factor | Max Points | Logic |
|--------|-----------|-------|
| Required skills matched | 25 | Proportional to % matched (keyword) |
| Nice-to-have skills matched | 10 | Proportional to % matched (keyword) |
| Job title similarity | 15 | String distance (Levenshtein) |
| Years of experience | 15 | Within range=15, ±2yr=8, ±3yr+=2 |
| Location / remote preference | 15 | Exact=15, hybrid acceptable=8, mismatch=0 |
| Resume ↔ JD keyword overlap | 10 | TF-IDF keyword intersection |
| Education level | 5 | Required degree met |
| Certifications | 3 | Required certs matched |
| Salary range overlap | 2 | Job offer within user's expected range |
| **Total** | **100** | |

### Phase 2 — Claude Refinement (jobs scoring ≥ 40, async, ~2s)
Single structured Claude API call per job per user:
- Input: active resume `parsed_data` (cached prefix) + job description (variable suffix)
- Output JSON: `{ refined_score, skills_matched, skills_missing, title_similarity, keyword_overlap, explanation, gaps }`
- Prompt caching on the resume section (changes rarely) — ~90% cache hit rate reduces cost significantly
- Phase 1 score shown immediately in UI; Phase 2 updates asynchronously via Supabase Realtime

### Score Bands
| Score | Label |
|-------|-------|
| 90–100 | Excellent Match |
| 75–89 | Strong Match |
| 60–74 | Good Match |
| 40–59 | Possible Match |
| < 40 | Low Match |

### Recompute Triggers
- User uploads new resume
- User adds/removes skills
- On demand (manual recompute button)
- Scores are otherwise cached in `job_matches`

---

## 8. Frontend Structure

### Route Groups (Next.js App Router)
```
app/
├── (auth)/          login, register, forgot-password, reset-password
├── (onboarding)/    welcome, profile, resume, skills  (4-step wizard, forced before dashboard)
├── (app)/           layout with sidebar
│   ├── dashboard/
│   ├── jobs/        list + [id] detail
│   ├── tracker/     kanban board
│   ├── analytics/
│   ├── profile/
│   └── notifications/
└── page.tsx         landing page
```

### Key Component Groups
- **jobs/**: JobCard, JobList (virtualised), JobDetail, JobFilters, MatchScoreBadge, MatchBreakdown, SkillTags, JobActionMenu
- **tracker/**: KanbanBoard (drag-and-drop), KanbanColumn, TrackerCard, StatusSelector, NotesPanel, ReminderForm
- **analytics/**: SummaryWidgets, StatusDonutChart, MatchDistributionBar, SkillsDemandChart, ConversionFunnel
- **profile/**: OnboardingWizard, ProfileForm, ResumeUploader, ParsedResumePreview, SkillsManager, AISuggestions
- **shared/**: Sidebar, Navbar, Button, Input, Modal, Badge, Spinner, Skeleton, EmptyState, Toast, NotificationBell

### State Management
- **React Query** — all server state (jobs, profile, applications); cache + optimistic updates
- **Zustand** — UI-only state (filters open/closed, active modal, sidebar collapsed)
- **Supabase Realtime** — live match score updates, new job notifications
- **react-hook-form + Zod** — all forms with schema validation

---

## 9. Background Workers (Railway, same Node.js process)

### Job Scraper Worker
- `node-cron` schedule: every 2 hours
- Calls SerpAPI/JSearch with each user's `desired_titles` + `preferred_locations`
- Deduplicates by `external_id` before inserting to `jobs`
- Triggers Phase 1 match scoring for all active users after each scrape

### Resume Parser Worker
- Triggered on: `POST /resume/upload` and `POST /resume/:id/reparse`
- Downloads file from Supabase Storage → sends to Claude API
- Stores structured `parsed_data` JSON back to `resumes` table
- Triggers full match recompute for that user

### Match Engine Worker
- Triggered by: new jobs scraped, resume updated, skills changed
- Phase 1 runs synchronously (fast)
- Phase 2 jobs queued in-process (`p-queue`, no Redis dependency — Railway free tier compatible) and processed async
- Pushes score updates via Supabase Realtime → frontend updates live

### Notification Worker
- `node-cron` schedule: every 15 minutes
- Checks `reminders` for `remind_at <= now AND is_sent = false`
- Sends in-app notification + email via Resend
- Marks `is_sent = true`

---

## 10. Security

- **Authentication:** Supabase JWT on all API routes via `verifyToken(req)` middleware abstraction
- **Authorisation:** Row-Level Security on all Supabase tables; API also validates `user_id` on every query
- **File uploads:** MIME type validation (PDF/DOCX only), 10 MB size limit, virus-scan-ready (ClamAV hookable)
- **Rate limiting:** `express-rate-limit` — 100 req/min general, 10 req/min AI endpoints
- **Input validation:** Zod on all API request bodies
- **Secrets:** Environment variables only, never committed; `.env.example` provided
- **CORS:** Whitelist Vercel deployment URL + localhost
- **HTTPS:** Enforced by Vercel and Railway

---

## 11. Pages & UI Wireframes

| Page | Key Elements |
|------|-------------|
| Landing | Hero with CTA, feature highlights, pricing-free badge |
| Register/Login | Email + password, OAuth (Google), forgot password link |
| Onboarding (4 steps) | Welcome → Profile form → Resume upload + parse preview → Skills tagging |
| Dashboard | Greeting, 6 stat widgets, top match job cards (3-col grid), Refresh button |
| Jobs (list) | Filter sidebar, virtualised job card list sorted by match score, pagination |
| Job Detail | Full description, match breakdown panel, skill tags, apply CTA, track button |
| Tracker | Kanban board (5 columns), detail slide-in panel with notes + reminders + AI buttons |
| Analytics | Stat widgets, donut chart, match distribution bar, skills demand radar, funnel |
| Profile/Settings | Profile form, resume uploader, skills manager, AI resume suggestions |
| Notifications | List of unread/read alerts, mark all read |

---

## 12. MVP Scope (Phase 1)

The following features constitute the shippable MVP:

1. User registration + login (Supabase Auth)
2. 4-step onboarding wizard
3. Resume upload (PDF/DOCX) + Claude parsing
4. Manual skills entry
5. Job scraping via SerpAPI (cron + manual refresh)
6. Phase 1 + Phase 2 match scoring
7. Dashboard with stat widgets + job cards
8. Job filtering (keyword, location, remote, salary, match score)
9. Basic application tracking (save/dismiss/applied/interviewing/offer/rejected)
10. Notes on applications

**Phase 2 additions:** Analytics charts, email notifications, reminders, AI cover letter, AI skill gap analysis, AI resume suggestions.

---

## 13. Deployment (Free Tier)

```
1. Supabase     → create project, run schema migrations, enable RLS, create storage bucket
2. Railway      → deploy Node.js API from GitHub, set env vars
3. Vercel       → deploy Next.js from GitHub, set NEXT_PUBLIC_* env vars
4. Resend       → create account, get API key, verify sending domain
5. SerpAPI      → create account, get API key (100 free searches/mo on free tier)
6. Anthropic    → get Claude API key, enable prompt caching
```

Environment variables required:
```
# Shared
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# API (Railway)
DATABASE_URL, JWT_SECRET
SERPAPI_KEY (or JSEARCH_KEY via RapidAPI)
ANTHROPIC_API_KEY
RESEND_API_KEY
PORT

# Frontend (Vercel)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_API_URL
```

---

## 14. Out of Scope (this spec)

- Billing / subscription management
- Public job posting (employer side)
- Mobile native app (responsive web covers mobile)
- OAuth providers beyond Google
- Real-time collaborative features
- Role-based access control (architecture is ready, not implemented)
