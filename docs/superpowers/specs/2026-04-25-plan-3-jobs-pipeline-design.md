# Plan 3 — Jobs Pipeline Design

## Goal

Build a backend jobs pipeline that scrapes job listings from JSearch (RapidAPI), scores each job against each user's profile using a two-phase matching engine (rule-based + Claude refinement), and exposes the results through a Jobs REST API.

---

## Architecture

```
Trigger (cron every 2h | POST /jobs/refresh | resume/skills change)
  → scraper.ts        — JSearch queries, dedup INSERT, extract skills
  → matchEngine.ts    — Phase 1 rule scoring (free, ~ms) + Phase 2 Claude refinement (haiku, ~2s)
  → jobs.ts routes    — GET /jobs, GET /jobs/:id, GET /jobs/:id/match, POST /jobs/refresh, PATCH /jobs/:id/status
  → Supabase          — jobs, job_matches, job_applications (all already migrated)
```

**Three triggers:**
- **Automatic** — `node-cron` every 2 hours, runs for all active users
- **Manual** — `POST /jobs/refresh`, 202 response, 1 request/hour/user rate limit
- **Recompute** — resume upload or skills change calls `matchEngine` directly (no scraping)

---

## Scraper (`workers/scraper.ts`)

**Data source:** JSearch via RapidAPI

**Query fan-out:** One query per `desired_title × preferred_location` pair per active user. Remote-only users (`work_preference = 'remote'`) use `remote_jobs_only: true` instead of a location string.

**JSearch params per query:**
```
query: "<title> <location>"
page: 1
num_pages: 1          // 10 results per page, no deeper pagination per run
date_posted: "3days"  // only fresh listings
remote_jobs_only: true|false
```

**Dedup:** `external_id` is the JSearch job ID. `INSERT ... ON CONFLICT (external_id) DO NOTHING` — existing jobs are never updated by the scraper.

**Skill extraction at insert time:** Regex match against `description + requirements` using a curated vocabulary of ~200 tech skill terms (see `lib/skillVocabulary.ts`). Result stored as `jobs.extracted_skills TEXT[]`. This keeps Phase 1 scoring a pure array intersection — no NLP at query time.

**Return value:** Array of newly inserted job IDs, passed directly to `matchEngine`.

---

## Phase 1 — Rule-Based Scoring (`workers/matchEngine.ts`)

Synchronous pure functions. Runs for every job × user pair. Writes a `job_matches` row with `score` 0–100 and a label.

| Factor | Points | Method |
|--------|--------|--------|
| Skills overlap | 35 | `(intersection size / job.extracted_skills.length) * 35` |
| Title similarity | 20 | Best Levenshtein score vs `user.desired_titles` |
| Location / remote | 15 | Exact city match = 15 · compatible (remote ok) = 8 · mismatch = 0 |
| Years experience | 15 | Regex from requirements text; within range = 15 · ±2yr = 8 · ±3yr+ = 2 |
| Resume keywords | 10 | `(matching keywords / user.parsed_data.keywords.length) * 10` |
| Salary overlap | 5 | Proportional range overlap |

**Labels:**
- score ≥ 80 → `"Strong Match"`
- score 60–79 → `"Good Match"`
- score 40–59 → `"Possible Match"`
- score < 40 → `"Low Match"` — stops here, no Phase 2

---

## Phase 2 — Claude Refinement (`workers/matchEngine.ts`)

Only runs for `job_matches` rows with `score ≥ 40`. Queued via `p-queue` with `concurrency: 3`.

**Model:** `claude-haiku-4-5-20251001`

**Prompt structure (prompt caching):**

```
system (cached prefix — resume is expensive, changes rarely):
  You are a job matching assistant. Given a candidate's resume data and a job description,
  output a JSON object with these exact fields:
    - refined_score: number 0-100
    - skills_matched: string[]
    - skills_missing: string[]
    - explanation: string (2-3 sentences on fit quality)
    - gaps_to_improve: string[] (top 3 actionable gaps)

  Candidate resume:
  <parsed_data JSON from user's resume record>

user (variable per job):
  Rate this job for the candidate above:

  Title: <job.title>
  Company: <job.company>
  Description: <job.description>
  Requirements: <job.requirements>
```

**Output handling:** Parse JSON response; if parse fails, leave `ai_refined = false` and keep Phase 1 score. On success, update `job_matches` row: `refined_score`, `skills_matched`, `skills_missing`, `match_explanation`, `gaps_to_improve`, `ai_refined = true`, `refined_at = now()`.

---

## Jobs API (`routes/jobs.ts`)

### `GET /jobs`
Paginated list of jobs with match scores for the authenticated user.

**Query params:** `page`, `limit` (default 20), `min_score`, `status` (application_status filter), `remote`

**Response item shape:**
```json
{
  "id": "uuid",
  "title": "Senior Frontend Engineer",
  "company": "Acme Corp",
  "location": "Austin, TX",
  "remote": true,
  "salary_min": 100000,
  "salary_max": 140000,
  "match_score": 72,
  "match_label": "Good Match",
  "application_status": null,
  "posted_at": "2026-04-24T10:00:00Z"
}
```

### `GET /jobs/:id`
Full job detail with match breakdown.

**Additional fields:** `description`, `requirements`, `extracted_skills`, `skills_matched`, `skills_missing`, `match_explanation`, `gaps_to_improve`, `apply_url`, `ai_refined`

### `GET /jobs/:id/match`
Match data only — used for polling while Phase 2 runs.

```json
{
  "match_score": 72,
  "match_label": "Good Match",
  "refined_score": 78,
  "ai_refined": true,
  "skills_matched": ["React", "TypeScript"],
  "skills_missing": ["GraphQL"],
  "explanation": "Strong React and TypeScript match...",
  "gaps_to_improve": ["Learn GraphQL", "More cloud experience"]
}
```

### `POST /jobs/refresh`
Triggers scrape + match for the authenticated user. Returns `202` immediately.

**Rate limit:** 1 request/hour per user via `profiles.last_refresh_at` column.

### `PATCH /jobs/:id/status`
Update `application_status`.

**Valid values:** `saved | applied | interviewing | rejected | offered`

---

## File Map

**New files:**
```
api/src/workers/scraper.ts          — JSearch queries, dedup insert, skill extraction
api/src/workers/matchEngine.ts      — Phase 1 scoring + Phase 2 Claude calls via p-queue
api/src/workers/scheduler.ts        — node-cron every 2h, orchestrates scraper + matchEngine
api/src/routes/jobs.ts              — all 5 Jobs API routes
api/src/lib/skillVocabulary.ts      — ~200 skill terms array for extraction regex
```

**Modified files:**
```
api/src/index.ts                    — mount jobs router, start scheduler on boot
api/src/routes/profile.ts           — call matchEngine after resume upload / skills change
```

**Database migration:**
```sql
ALTER TABLE profiles ADD COLUMN last_refresh_at TIMESTAMPTZ;
```

**Test files:**
```
api/src/workers/scraper.test.ts     — mock JSearch HTTP, verify dedup + extracted_skills
api/src/workers/matchEngine.test.ts — unit test Phase 1 pure functions, mock Anthropic for Phase 2
api/src/routes/jobs.test.ts         — supertest: list filters, detail shape, rate limit enforcement
```

---

## Testing Strategy

- **Phase 1 scoring:** Pure functions, fully unit-testable. Test each factor independently and the combined score for a known profile × job fixture.
- **Scraper:** Mock the JSearch HTTP response. Assert correct INSERT shape, `ON CONFLICT DO NOTHING` behavior, and `extracted_skills` extraction for a known description.
- **Phase 2:** Mock `@anthropic-ai/sdk`. Test JSON parse success path and graceful fallback on malformed response (`ai_refined = false`).
- **Jobs API:** Supertest integration tests against a real Supabase test instance (consistent with rest of test suite). Cover: pagination, `min_score` filter, `application_status` filter, 202 on refresh, 429 on second refresh within 1 hour.

---

## Known Constraints / Debt

- `preferred_locations` field exists in DB and API but is not collected in the ProfileForm UI (tracked for Plan 4). Scraper uses `desired_titles × preferred_locations`; users without `preferred_locations` who are not remote-only will produce no queries. Scraper should skip gracefully.
- Phase 2 Claude cost is per-user per-run. With `concurrency: 3` and a 2-hour cron, this is bounded. No additional rate limiting planned for now.
- No web UI in this plan — all output is API-only. Dashboard and jobs feed are Plan 4.
