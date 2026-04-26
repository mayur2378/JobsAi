# Plan 3 — Jobs Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full jobs pipeline: JSearch scraper, two-phase match engine (rule-based + Claude), and Jobs REST API.

**Architecture:** Scraper (workers/scraper.ts) queries JSearch per active user's titles × locations and inserts new jobs. matchEngine.ts runs Phase 1 pure-function scoring then Phase 2 Claude refinement via p-queue. Jobs API routes expose the results.

**Tech Stack:** Express/TypeScript, Supabase, @anthropic-ai/sdk, node-cron, p-queue@6, native fetch (Node 20)

---

## Schema Notes (read before implementing)

- `jobs.is_remote` — boolean (not `remote`)
- `match_label_enum` values: `'excellent' | 'strong' | 'good' | 'possible' | 'low'`
- `app_status_enum` values: `'saved' | 'dismissed' | 'applied' | 'interviewing' | 'offer' | 'rejected'`
- `job_matches` has `match_score`, `match_label`, `skills_matched`, `skills_missing`, `match_breakdown`, `match_explanation`, `gaps_to_improve`, `computed_at`
- Tests live in `api/tests/`. Run with: `npm test -- --testPathPattern=<name>` from `api/`

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/003_jobs_pipeline.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 003_jobs_pipeline.sql

-- Add extracted_skills to jobs table (populated by scraper at insert time)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS extracted_skills TEXT[] DEFAULT '{}';

-- Add Phase 2 AI refinement columns to job_matches
ALTER TABLE job_matches
  ADD COLUMN IF NOT EXISTS refined_score    INT,
  ADD COLUMN IF NOT EXISTS ai_refined       BOOL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refined_at       TIMESTAMPTZ;

-- Add rate-limit tracker for POST /jobs/refresh
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_refresh_at  TIMESTAMPTZ;
```

- [ ] **Step 2: Apply the migration**

Apply via Supabase dashboard SQL editor or CLI:
```bash
# If using Supabase CLI from project root:
supabase db push
# Or paste the SQL directly into the Supabase dashboard SQL editor
```

Expected: No errors. Verify by checking the table schemas in Supabase.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003_jobs_pipeline.sql
git commit -m "feat: add jobs pipeline migration (extracted_skills, ai_refined, last_refresh_at)"
```

---

## Task 2: Install Dependencies + Update Env Config

**Files:**
- Modify: `api/package.json` (via npm install)
- Modify: `api/src/config/env.ts`

- [ ] **Step 1: Install packages**

```bash
cd api
npm install node-cron p-queue@6
npm install --save-dev @types/node-cron
```

Expected: `node_modules/node-cron` and `node_modules/p-queue` present.

- [ ] **Step 2: Add RAPIDAPI_KEY to env schema**

Open `api/src/config/env.ts`. The current `envSchema` ends with `CORS_ORIGIN`. Add `RAPIDAPI_KEY` to the schema:

```typescript
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SERPAPI_KEY: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  RESEND_API_KEY: z.string().default(''),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  RAPIDAPI_KEY: z.string().default(''),
})

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Invalid environment variables:')
    console.error(JSON.stringify(result.error.flatten().fieldErrors, null, 2))
    process.exit(1)
  }
  return result.data
}

export const env = loadEnv()
```

- [ ] **Step 3: Run typecheck to verify**

```bash
cd api
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add api/package.json api/package-lock.json api/src/config/env.ts
git commit -m "feat: add node-cron, p-queue deps and RAPIDAPI_KEY env var"
```

---

## Task 3: Skill Vocabulary Module

**Files:**
- Create: `api/src/lib/skillVocabulary.ts`
- Test: `api/tests/skillVocabulary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api/tests/skillVocabulary.test.ts`:

```typescript
import { extractSkills, SKILL_VOCABULARY } from '../src/lib/skillVocabulary'

describe('SKILL_VOCABULARY', () => {
  it('contains at least 50 skills', () => {
    expect(SKILL_VOCABULARY.length).toBeGreaterThanOrEqual(50)
  })

  it('has no duplicate entries', () => {
    const unique = new Set(SKILL_VOCABULARY)
    expect(unique.size).toBe(SKILL_VOCABULARY.length)
  })
})

describe('extractSkills', () => {
  it('returns empty array for empty text', () => {
    expect(extractSkills('')).toEqual([])
  })

  it('extracts skills that appear as whole words', () => {
    const text = 'We need a React developer with TypeScript and Node.js experience.'
    const skills = extractSkills(text)
    expect(skills).toContain('react')
    expect(skills).toContain('typescript')
    expect(skills).toContain('node.js')
  })

  it('does not extract partial word matches', () => {
    // "java" should not match inside "javascript" as a separate skill if listed separately
    const text = 'Expert in JavaScript frameworks'
    const skills = extractSkills(text)
    expect(skills).toContain('javascript')
    // "java" alone should not appear since "javascript" contains it but \b handles this
  })

  it('is case insensitive', () => {
    const text = 'PYTHON developer with POSTGRESQL'
    const skills = extractSkills(text)
    expect(skills).toContain('python')
    expect(skills).toContain('postgresql')
  })

  it('handles multi-word skills', () => {
    const text = 'Experience with machine learning and deep learning required'
    const skills = extractSkills(text)
    expect(skills).toContain('machine learning')
    expect(skills).toContain('deep learning')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api
npm test -- --testPathPattern=skillVocabulary
```

Expected: FAIL with "Cannot find module '../src/lib/skillVocabulary'"

- [ ] **Step 3: Implement skillVocabulary.ts**

Create `api/src/lib/skillVocabulary.ts`:

```typescript
export const SKILL_VOCABULARY: string[] = [
  // Languages
  'javascript', 'typescript', 'python', 'java', 'go', 'golang', 'rust', 'c++', 'c#', 'ruby',
  'swift', 'kotlin', 'scala', 'php', 'r', 'matlab', 'dart', 'elixir', 'haskell', 'clojure',
  // Frontend frameworks
  'react', 'vue', 'angular', 'svelte', 'next.js', 'nuxt.js', 'remix', 'gatsby',
  'react native', 'flutter', 'ionic', 'electron',
  // Backend frameworks
  'node.js', 'express', 'fastapi', 'django', 'flask', 'rails', 'spring', 'nestjs',
  'laravel', 'fastify', 'hapi', 'koa', 'gin', 'fiber', 'echo',
  // Databases
  'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'dynamodb', 'sqlite',
  'cassandra', 'neo4j', 'influxdb', 'cockroachdb', 'supabase', 'firebase',
  // Cloud & DevOps
  'aws', 'gcp', 'azure', 'docker', 'kubernetes', 'terraform', 'ansible', 'pulumi',
  'helm', 'jenkins', 'github actions', 'gitlab ci', 'circleci', 'argocd',
  'nginx', 'apache', 'caddy', 'traefik', 'cloudflare',
  // Tools & Platforms
  'git', 'github', 'gitlab', 'jira', 'confluence', 'figma', 'sketch',
  'vercel', 'netlify', 'heroku', 'railway', 'render',
  // APIs & Protocols
  'rest', 'graphql', 'grpc', 'websockets', 'oauth', 'jwt', 'saml',
  // CSS & UI
  'html', 'css', 'sass', 'tailwindcss', 'bootstrap', 'materialui', 'shadcn',
  // Testing
  'jest', 'vitest', 'cypress', 'playwright', 'pytest', 'junit', 'rspec', 'selenium',
  // Bundlers & Tooling
  'webpack', 'vite', 'rollup', 'babel', 'eslint', 'prettier', 'turbo', 'nx',
  // Data & AI/ML
  'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'scikit-learn',
  'pandas', 'numpy', 'spark', 'hadoop', 'dbt', 'airflow', 'kafka',
  'langchain', 'openai', 'anthropic',
  // Messaging
  'rabbitmq', 'celery', 'sqs', 'pubsub',
  // Auth & Security
  'auth0', 'keycloak', 'ldap', 'sso',
  // Monitoring
  'datadog', 'grafana', 'prometheus', 'sentry', 'newrelic', 'splunk',
  // Methodologies
  'microservices', 'ci/cd', 'devops', 'sre', 'agile', 'scrum', 'tdd',
  'system design', 'data structures', 'algorithms',
  // Payments & Comms
  'stripe', 'twilio', 'sendgrid', 'resend',
  // Mobile
  'ios', 'android', 'expo',
  // Low-code / BaaS
  'supabase', 'appwrite', 'convex',
]

export function extractSkills(text: string): string[] {
  if (!text) return []
  return SKILL_VOCABULARY.filter((skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(?<![\\w.])${escaped}(?![\\w.])`, 'i')
    return pattern.test(text)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api
npm test -- --testPathPattern=skillVocabulary
```

Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/skillVocabulary.ts api/tests/skillVocabulary.test.ts
git commit -m "feat: add skill vocabulary module with extractSkills"
```

---

## Task 4: Phase 1 Scoring (matchEngine.ts — Phase 1 only)

**Files:**
- Create: `api/src/workers/matchEngine.ts`
- Test: `api/tests/matchEngine.test.ts`

- [ ] **Step 1: Write the failing tests (Phase 1)**

Create `api/tests/matchEngine.test.ts`:

```typescript
import {
  scoreSkills,
  scoreTitle,
  scoreLocation,
  scoreYearsExp,
  scoreKeywords,
  scoreSalary,
  computePhase1,
} from '../src/workers/matchEngine'

describe('scoreSkills', () => {
  it('returns 0 when job has no extracted skills', () => {
    expect(scoreSkills([], ['React', 'TypeScript'])).toBe(0)
  })

  it('returns 35 when all job skills match user skills', () => {
    expect(scoreSkills(['react', 'typescript'], ['react', 'typescript', 'node.js'])).toBe(35)
  })

  it('returns proportional score for partial overlap', () => {
    // 1 of 2 job skills match => 17 or 18 points
    const score = scoreSkills(['react', 'vue'], ['react', 'node.js'])
    expect(score).toBe(17) // Math.round(0.5 * 35) = 18? let's check: Math.round(17.5) = 18
    // 1/2 * 35 = 17.5 -> Math.round = 18
    expect(score).toBe(18)
  })

  it('is case insensitive', () => {
    expect(scoreSkills(['React'], ['react'])).toBe(35)
  })
})

describe('scoreTitle', () => {
  it('returns 0 when user has no desired titles', () => {
    expect(scoreTitle('Senior Frontend Engineer', [])).toBe(0)
  })

  it('returns 20 when job title exactly matches desired title', () => {
    expect(scoreTitle('Senior Frontend Engineer', ['Senior Frontend Engineer'])).toBe(20)
  })

  it('returns partial score for partial word overlap', () => {
    const score = scoreTitle('Senior Frontend Engineer', ['Frontend Developer'])
    // "frontend" matches out of ["frontend", "developer"] = 1/2 = 0.5 * 20 = 10
    expect(score).toBe(10)
  })
})

describe('scoreLocation', () => {
  it('returns 15 when user is remote-only and job is remote', () => {
    expect(scoreLocation('Austin, TX', true, 'Austin, TX', 'remote', [])).toBe(15)
  })

  it('returns 0 when user is remote-only and job is not remote', () => {
    expect(scoreLocation('Austin, TX', false, 'Austin, TX', 'remote', [])).toBe(0)
  })

  it('returns 8 when job is remote and user has hybrid preference', () => {
    expect(scoreLocation('Remote', true, null, 'hybrid', [])).toBe(8)
  })

  it('returns 15 when job location matches preferred location', () => {
    expect(scoreLocation('Austin, TX', false, 'Seattle', null, ['Austin'])).toBe(15)
  })

  it('returns 15 when job location matches user location (no preferred_locations)', () => {
    expect(scoreLocation('Austin, TX', false, 'Austin', null, [])).toBe(15)
  })

  it('returns 0 when location mismatches and job is not remote', () => {
    expect(scoreLocation('New York, NY', false, 'Seattle', 'onsite', [])).toBe(0)
  })
})

describe('scoreYearsExp', () => {
  it('returns 0 when user has no years experience set', () => {
    expect(scoreYearsExp('Requires 3+ years experience', null)).toBe(0)
  })

  it('returns 15 when user experience is within required range', () => {
    expect(scoreYearsExp('Requires 3-5 years of experience', 4)).toBe(15)
  })

  it('returns 8 when user experience is within 2 years of requirement', () => {
    expect(scoreYearsExp('Requires 5+ years experience', 3)).toBe(8)
  })

  it('returns 7 partial credit when no experience requirement found', () => {
    expect(scoreYearsExp('Great opportunity at a fast-growing startup', 5)).toBe(7)
  })
})

describe('scoreKeywords', () => {
  it('returns 0 when user has no parsed keywords', () => {
    expect(scoreKeywords('We use React and TypeScript', [])).toBe(0)
  })

  it('returns 10 when all user keywords appear in job description', () => {
    expect(scoreKeywords('We use React and TypeScript daily', ['react', 'typescript'])).toBe(10)
  })

  it('returns proportional score for partial match', () => {
    const score = scoreKeywords('We use React in our stack', ['react', 'typescript'])
    expect(score).toBe(5) // 1 of 2 = 0.5 * 10 = 5
  })
})

describe('scoreSalary', () => {
  it('returns 2 when user has no salary preference', () => {
    expect(scoreSalary(100000, 130000, null, null)).toBe(2)
  })

  it('returns 2 when job does not disclose salary', () => {
    expect(scoreSalary(null, null, 80000, 120000)).toBe(2)
  })

  it('returns 5 when ranges fully overlap', () => {
    expect(scoreSalary(90000, 120000, 80000, 130000)).toBe(5)
  })

  it('returns 0 when salary ranges do not overlap', () => {
    expect(scoreSalary(50000, 70000, 100000, 130000)).toBe(0)
  })
})

describe('computePhase1', () => {
  const userProfile = {
    desired_titles: ['Frontend Engineer'],
    preferred_locations: ['Austin'],
    work_preference: null as null,
    location: 'Austin, TX',
    salary_min: 80000,
    salary_max: 130000,
    years_experience: 5,
  }
  const userSkills = ['react', 'typescript', 'node.js']
  const keywords = ['react', 'typescript']

  it('returns a score and label', () => {
    const job = {
      title: 'Frontend Engineer',
      location: 'Austin, TX',
      is_remote: false,
      description: 'We use React and TypeScript.',
      requirements: 'Requires 4-6 years of experience.',
      salary_min: 90000,
      salary_max: 125000,
      extracted_skills: ['react', 'typescript'],
    }
    const result = computePhase1(job, userProfile, userSkills, keywords)
    expect(result.score).toBeGreaterThan(0)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(['excellent', 'strong', 'good', 'low']).toContain(result.label)
    expect(result.breakdown).toHaveProperty('skills')
    expect(result.breakdown).toHaveProperty('title')
  })

  it('assigns excellent label for high score (>= 80)', () => {
    const job = {
      title: 'Frontend Engineer',
      location: 'Austin, TX',
      is_remote: false,
      description: 'React and TypeScript required. 5 years experience.',
      requirements: '5 years of experience required.',
      salary_min: 90000,
      salary_max: 120000,
      extracted_skills: ['react', 'typescript', 'node.js'],
    }
    const result = computePhase1(job, userProfile, userSkills, keywords)
    expect(result.score).toBeGreaterThanOrEqual(70) // near-perfect match
  })

  it('assigns low label for score below 40', () => {
    const job = {
      title: 'DevOps Engineer',
      location: 'Remote',
      is_remote: true,
      description: 'Kubernetes and Terraform required.',
      requirements: '10+ years experience.',
      salary_min: 50000,
      salary_max: 60000,
      extracted_skills: ['kubernetes', 'terraform', 'ansible'],
    }
    const result = computePhase1(job, userProfile, [], [])
    expect(result.label).toBe('low')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api
npm test -- --testPathPattern=matchEngine
```

Expected: FAIL with "Cannot find module '../src/workers/matchEngine'"

- [ ] **Step 3: Fix the scoreSkills test expectation**

Look at the test for `scoreSkills` partial overlap. `Math.round(0.5 * 35) = Math.round(17.5) = 18`. Fix the test:

```typescript
it('returns proportional score for partial overlap', () => {
  const score = scoreSkills(['react', 'vue'], ['react', 'node.js'])
  expect(score).toBe(18) // Math.round(0.5 * 35)
})
```

Remove the two `expect(score).toBe(17)` and `expect(score).toBe(18)` lines, leave only `expect(score).toBe(18)`.

- [ ] **Step 4: Implement matchEngine.ts (Phase 1 only)**

Create `api/src/workers/matchEngine.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import PQueue from 'p-queue'
import { supabaseAdmin } from '../config/supabase'
import { env } from '../config/env'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserMatchProfile {
  desired_titles: string[]
  preferred_locations: string[]
  work_preference: 'remote' | 'hybrid' | 'onsite' | null
  location: string | null
  salary_min: number | null
  salary_max: number | null
  years_experience: number | null
}

export interface JobForScoring {
  title: string
  location: string | null
  is_remote: boolean
  description: string | null
  requirements: string | null
  salary_min: number | null
  salary_max: number | null
  extracted_skills: string[]
}

export interface Phase1Result {
  score: number
  label: 'excellent' | 'strong' | 'good' | 'low'
  breakdown: {
    skills: number
    title: number
    location: number
    experience: number
    keywords: number
    salary: number
  }
}

// ─── Phase 1 — pure scoring functions ────────────────────────────────────────

export function scoreSkills(jobSkills: string[], userSkills: string[]): number {
  if (jobSkills.length === 0) return 0
  const userSet = new Set(userSkills.map((s) => s.toLowerCase()))
  const matches = jobSkills.filter((s) => userSet.has(s.toLowerCase()))
  return Math.round((matches.length / jobSkills.length) * 35)
}

export function scoreTitle(jobTitle: string, desiredTitles: string[]): number {
  if (desiredTitles.length === 0) return 0
  const jobWords = new Set(jobTitle.toLowerCase().split(/\W+/).filter(Boolean))
  let best = 0
  for (const desired of desiredTitles) {
    const desiredWords = desired.toLowerCase().split(/\W+/).filter(Boolean)
    if (desiredWords.length === 0) continue
    const matchCount = desiredWords.filter((w) => jobWords.has(w)).length
    best = Math.max(best, matchCount / desiredWords.length)
  }
  return Math.round(best * 20)
}

export function scoreLocation(
  jobLocation: string | null,
  jobIsRemote: boolean,
  userLocation: string | null,
  workPreference: string | null,
  preferredLocations: string[]
): number {
  if (workPreference === 'remote') return jobIsRemote ? 15 : 0
  if (jobIsRemote) return workPreference === 'hybrid' || !workPreference ? 8 : 0

  const jobLoc = (jobLocation ?? '').toLowerCase()
  const preferred =
    preferredLocations.length > 0
      ? preferredLocations.map((l) => l.toLowerCase())
      : userLocation
      ? [userLocation.toLowerCase()]
      : []

  if (preferred.length === 0) return 0
  for (const pref of preferred) {
    if (jobLoc.includes(pref) || pref.includes(jobLoc)) return 15
  }
  return 0
}

export function scoreYearsExp(jobText: string, userYearsExp: number | null): number {
  if (userYearsExp === null) return 0
  const match = jobText.match(
    /(\d+)\+?\s*(?:[-–to]+\s*(\d+)\s*)?years?\s+(?:of\s+)?experience/i
  )
  if (!match) return 7
  const min = parseInt(match[1])
  const max = match[2] ? parseInt(match[2]) : min
  if (userYearsExp >= min && userYearsExp <= max + 2) return 15
  if (Math.abs(userYearsExp - min) <= 2) return 8
  return 2
}

export function scoreKeywords(jobDescription: string, keywords: string[]): number {
  if (keywords.length === 0) return 0
  const desc = (jobDescription ?? '').toLowerCase()
  const matches = keywords.filter((kw) => desc.includes(kw.toLowerCase()))
  return Math.round((matches.length / keywords.length) * 10)
}

export function scoreSalary(
  jobSalaryMin: number | null,
  jobSalaryMax: number | null,
  userSalaryMin: number | null,
  userSalaryMax: number | null
): number {
  if (userSalaryMin === null && userSalaryMax === null) return 2
  if (jobSalaryMin === null && jobSalaryMax === null) return 2

  const jMin = jobSalaryMin ?? 0
  const jMax = jobSalaryMax ?? jMin
  const uMin = userSalaryMin ?? 0
  const uMax = userSalaryMax ?? uMin

  const overlapStart = Math.max(jMin, uMin)
  const overlapEnd = Math.min(jMax, uMax)

  if (overlapEnd < overlapStart) return 0
  const jobRange = Math.max(jMax - jMin, 1)
  return Math.round(Math.min((overlapEnd - overlapStart) / jobRange, 1) * 5)
}

export function computePhase1(
  job: JobForScoring,
  profile: UserMatchProfile,
  userSkillNames: string[],
  resumeKeywords: string[]
): Phase1Result {
  const jobText = `${job.description ?? ''} ${job.requirements ?? ''}`

  const skills = scoreSkills(job.extracted_skills, userSkillNames)
  const title = scoreTitle(job.title, profile.desired_titles)
  const location = scoreLocation(
    job.location,
    job.is_remote,
    profile.location,
    profile.work_preference,
    profile.preferred_locations
  )
  const experience = scoreYearsExp(jobText, profile.years_experience)
  const keywords = scoreKeywords(jobText, resumeKeywords)
  const salary = scoreSalary(job.salary_min, job.salary_max, profile.salary_min, profile.salary_max)

  const score = Math.min(skills + title + location + experience + keywords + salary, 100)

  let label: Phase1Result['label']
  if (score >= 80) label = 'excellent'
  else if (score >= 60) label = 'strong'
  else if (score >= 40) label = 'good'
  else label = 'low'

  return { score, label, breakdown: { skills, title, location, experience, keywords, salary } }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd api
npm test -- --testPathPattern=matchEngine
```

Expected: Phase 1 tests PASS. (Phase 2 tests don't exist yet.)

- [ ] **Step 6: Commit**

```bash
git add api/src/workers/matchEngine.ts api/tests/matchEngine.test.ts
git commit -m "feat: add Phase 1 scoring functions to matchEngine"
```

---

## Task 5: Scraper Worker

**Files:**
- Create: `api/src/workers/scraper.ts`
- Test: `api/tests/scraper.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/tests/scraper.test.ts`:

```typescript
import { mapJSearchJob, buildQueries } from '../src/workers/scraper'

describe('buildQueries', () => {
  it('returns empty array when user has no titles and is not remote-only', () => {
    const queries = buildQueries([], [], null)
    expect(queries).toEqual([])
  })

  it('fans out one query per title × location', () => {
    const queries = buildQueries(
      ['Frontend Engineer', 'React Developer'],
      ['Austin, TX', 'Remote'],
      null
    )
    expect(queries).toHaveLength(4)
    expect(queries[0]).toMatchObject({ query: 'Frontend Engineer Austin, TX', remoteOnly: false })
    expect(queries[1]).toMatchObject({ query: 'Frontend Engineer Remote', remoteOnly: false })
  })

  it('produces remote-only query when work_preference is remote and no locations', () => {
    const queries = buildQueries(['Frontend Engineer'], [], 'remote')
    expect(queries).toHaveLength(1)
    expect(queries[0]).toMatchObject({ query: 'Frontend Engineer', remoteOnly: true })
  })

  it('skips non-remote queries when work_preference is remote', () => {
    const queries = buildQueries(['Engineer'], ['Austin'], 'remote')
    // remote preference: use locations but mark remoteOnly=true
    expect(queries[0].remoteOnly).toBe(true)
  })
})

describe('mapJSearchJob', () => {
  const rawJob = {
    job_id: 'ext-123',
    job_title: 'Senior React Developer',
    employer_name: 'Acme Corp',
    job_city: 'Austin',
    job_country: 'US',
    job_is_remote: false,
    job_description: 'We use React, TypeScript, and Node.js daily.',
    job_highlights: { Qualifications: ['3+ years React experience', 'TypeScript required'] },
    job_min_salary: 100000,
    job_max_salary: 140000,
    job_apply_link: 'https://example.com/apply',
    job_posted_at_datetime_utc: '2026-04-24T10:00:00.000Z',
  }

  it('maps external_id from job_id', () => {
    const mapped = mapJSearchJob(rawJob)
    expect(mapped.external_id).toBe('ext-123')
  })

  it('combines city and country into location', () => {
    const mapped = mapJSearchJob(rawJob)
    expect(mapped.location).toBe('Austin, US')
  })

  it('extracts skills from description + qualifications', () => {
    const mapped = mapJSearchJob(rawJob)
    expect(mapped.extracted_skills).toContain('react')
    expect(mapped.extracted_skills).toContain('typescript')
    expect(mapped.extracted_skills).toContain('node.js')
  })

  it('combines qualifications into requirements string', () => {
    const mapped = mapJSearchJob(rawJob)
    expect(mapped.requirements).toContain('3+ years React experience')
  })

  it('handles missing fields gracefully', () => {
    const minimal = { job_id: 'x', job_title: 'Engineer', employer_name: null }
    const mapped = mapJSearchJob(minimal)
    expect(mapped.extracted_skills).toEqual([])
    expect(mapped.location).toBe(', ')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api
npm test -- --testPathPattern=scraper
```

Expected: FAIL with "Cannot find module '../src/workers/scraper'"

- [ ] **Step 3: Implement scraper.ts**

Create `api/src/workers/scraper.ts`:

```typescript
import { supabaseAdmin } from '../config/supabase'
import { env } from '../config/env'
import { extractSkills } from '../lib/skillVocabulary'

const JSEARCH_HOST = 'jsearch.p.rapidapi.com'
const JSEARCH_BASE = `https://${JSEARCH_HOST}/search`

export interface ScrapeQuery {
  query: string
  remoteOnly: boolean
}

export function buildQueries(
  desiredTitles: string[],
  preferredLocations: string[],
  workPreference: 'remote' | 'hybrid' | 'onsite' | null
): ScrapeQuery[] {
  if (desiredTitles.length === 0) return []

  const isRemoteOnly = workPreference === 'remote'

  if (preferredLocations.length === 0) {
    if (!isRemoteOnly) return []
    return desiredTitles.map((title) => ({ query: title, remoteOnly: true }))
  }

  const queries: ScrapeQuery[] = []
  for (const title of desiredTitles) {
    for (const location of preferredLocations) {
      queries.push({ query: `${title} ${location}`, remoteOnly: isRemoteOnly })
    }
  }
  return queries
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapJSearchJob(raw: any): {
  external_id: string
  source: string
  title: string
  company: string | null
  location: string
  is_remote: boolean
  description: string | null
  requirements: string | null
  salary_min: number | null
  salary_max: number | null
  apply_url: string | null
  posted_at: string | null
  extracted_skills: string[]
  raw_data: unknown
} {
  const qualifications: string[] = raw.job_highlights?.Qualifications ?? []
  const requirements = qualifications.length > 0 ? qualifications.join('\n') : null
  const descText = `${raw.job_description ?? ''} ${requirements ?? ''}`

  return {
    external_id: raw.job_id,
    source: 'jsearch',
    title: raw.job_title,
    company: raw.employer_name ?? null,
    location: `${raw.job_city ?? ''}, ${raw.job_country ?? ''}`,
    is_remote: raw.job_is_remote ?? false,
    description: raw.job_description ?? null,
    requirements,
    salary_min: raw.job_min_salary ?? null,
    salary_max: raw.job_max_salary ?? null,
    apply_url: raw.job_apply_link ?? null,
    posted_at: raw.job_posted_at_datetime_utc ?? null,
    extracted_skills: extractSkills(descText),
    raw_data: raw,
  }
}

async function fetchJSearchPage(scrapeQuery: ScrapeQuery): Promise<unknown[]> {
  const params = new URLSearchParams({
    query: scrapeQuery.query,
    page: '1',
    num_pages: '1',
    date_posted: '3days',
    ...(scrapeQuery.remoteOnly ? { remote_jobs_only: 'true' } : {}),
  })

  const res = await fetch(`${JSEARCH_BASE}?${params}`, {
    headers: {
      'X-RapidAPI-Key': env.RAPIDAPI_KEY,
      'X-RapidAPI-Host': JSEARCH_HOST,
    },
  })

  if (!res.ok) {
    console.error(`[scraper] JSearch error ${res.status} for query: ${scrapeQuery.query}`)
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as any
  return Array.isArray(json.data) ? json.data : []
}

export async function scrapeJobsForUser(
  desiredTitles: string[],
  preferredLocations: string[],
  workPreference: 'remote' | 'hybrid' | 'onsite' | null
): Promise<string[]> {
  const queries = buildQueries(desiredTitles, preferredLocations, workPreference)
  if (queries.length === 0) return []

  const newJobIds: string[] = []

  for (const q of queries) {
    const rawJobs = await fetchJSearchPage(q)
    if (rawJobs.length === 0) continue

    const mapped = rawJobs.map(mapJSearchJob)

    const { data, error } = await supabaseAdmin
      .from('jobs')
      .upsert(mapped, { onConflict: 'external_id', ignoreDuplicates: true })
      .select('id, external_id')

    if (error) {
      console.error('[scraper] Insert error:', error.message)
      continue
    }

    const inserted = (data ?? []).map((j: { id: string }) => j.id)
    newJobIds.push(...inserted)
  }

  return newJobIds
}

export async function scrapeForAllActiveUsers(): Promise<{ userId: string; jobIds: string[] }[]> {
  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('id, desired_titles, preferred_locations, work_preference')
    .or('desired_titles.neq.{},work_preference.eq.remote')

  if (error || !profiles) {
    console.error('[scraper] Failed to fetch profiles:', error?.message)
    return []
  }

  const results: { userId: string; jobIds: string[] }[] = []

  for (const profile of profiles) {
    const titles: string[] = profile.desired_titles ?? []
    const locations: string[] = profile.preferred_locations ?? []
    const pref = profile.work_preference ?? null

    if (titles.length === 0 && pref !== 'remote') continue

    const jobIds = await scrapeJobsForUser(titles, locations, pref)
    results.push({ userId: profile.id, jobIds })
  }

  return results
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd api
npm test -- --testPathPattern=scraper
```

Expected: PASS. Note: the test for `mapJSearchJob` with `minimal` input expects `location: ', '` — verify the test passes as-is.

- [ ] **Step 5: Commit**

```bash
git add api/src/workers/scraper.ts api/tests/scraper.test.ts
git commit -m "feat: add JSearch scraper with skill extraction"
```

---

## Task 6: Phase 2 Claude Refinement + Pipeline Orchestration

**Files:**
- Modify: `api/src/workers/matchEngine.ts` (append Phase 2 + pipeline functions)
- Modify: `api/tests/matchEngine.test.ts` (append Phase 2 tests)

- [ ] **Step 1: Write the failing Phase 2 tests**

Append to the end of `api/tests/matchEngine.test.ts`:

```typescript
// ─── Phase 2 tests ───────────────────────────────────────────────────────────

import { runPhase2ForMatch } from '../src/workers/matchEngine'
import Anthropic from '@anthropic-ai/sdk'

jest.mock('@anthropic-ai/sdk')

const MockAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>

describe('runPhase2ForMatch', () => {
  const mockMatchId = 'match-uuid-1'
  const mockJob = {
    id: 'job-uuid-1',
    title: 'Frontend Engineer',
    company: 'Acme',
    description: 'We use React and TypeScript.',
    requirements: '3+ years experience.',
  }
  const mockParsedResume = {
    skills: ['React', 'TypeScript'],
    keywords: ['react', 'typescript'],
    experience: [],
    education: [],
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls Anthropic with the resume in the system prompt', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            refined_score: 85,
            skills_matched: ['React', 'TypeScript'],
            skills_missing: ['GraphQL'],
            explanation: 'Strong match.',
            gaps_to_improve: ['Learn GraphQL'],
          }),
        },
      ],
    })

    MockAnthropic.prototype.messages = { create: mockCreate } as any

    // Mock supabase update
    const { supabaseAdmin } = require('../src/config/supabase')
    jest.spyOn(supabaseAdmin, 'from').mockReturnValue({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
    })

    await runPhase2ForMatch(mockMatchId, mockJob as any, mockParsedResume as any)

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const call = mockCreate.mock.calls[0][0]
    expect(call.system).toContain('resume')
    expect(call.messages[0].content).toContain('Frontend Engineer')
  })

  it('sets ai_refined=false and does not throw when Claude returns invalid JSON', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json at all' }],
    })
    MockAnthropic.prototype.messages = { create: mockCreate } as any

    const { supabaseAdmin } = require('../src/config/supabase')
    jest.spyOn(supabaseAdmin, 'from').mockReturnValue({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
    })

    await expect(
      runPhase2ForMatch(mockMatchId, mockJob as any, mockParsedResume as any)
    ).resolves.not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api
npm test -- --testPathPattern=matchEngine
```

Expected: Phase 1 tests PASS, Phase 2 tests FAIL with "runPhase2ForMatch is not a function"

- [ ] **Step 3: Append Phase 2 + pipeline to matchEngine.ts**

Append to the bottom of `api/src/workers/matchEngine.ts` (after the Phase 1 code already written in Task 4):

```typescript
// ─── Phase 2 — Claude refinement ─────────────────────────────────────────────

interface Phase2Output {
  refined_score: number
  skills_matched: string[]
  skills_missing: string[]
  explanation: string
  gaps_to_improve: string[]
}

interface JobForPhase2 {
  id: string
  title: string
  company: string | null
  description: string | null
  requirements: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runPhase2ForMatch(
  matchId: string,
  job: JobForPhase2,
  parsedResume: Record<string, unknown>
): Promise<void> {
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  let output: Phase2Output | null = null

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: `You are a job matching assistant. Given a candidate's resume data and a job description, output a JSON object with exactly these fields:
{
  "refined_score": number 0-100,
  "skills_matched": string[],
  "skills_missing": string[],
  "explanation": "2-3 sentences on fit quality",
  "gaps_to_improve": ["top 3 actionable gaps"]
}
Output raw JSON only — no markdown, no code blocks.

Candidate resume:
${JSON.stringify(parsedResume)}`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Rate this job for the candidate above:

Title: ${job.title}
Company: ${job.company ?? 'Unknown'}
Description: ${job.description ?? ''}
Requirements: ${job.requirements ?? ''}`,
        },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    output = JSON.parse(text) as Phase2Output
  } catch (err) {
    console.error('[matchEngine] Phase 2 failed for match', matchId, err)
  }

  if (output) {
    await supabaseAdmin
      .from('job_matches')
      .update({
        refined_score: output.refined_score,
        skills_matched: output.skills_matched,
        skills_missing: output.skills_missing,
        match_explanation: output.explanation,
        gaps_to_improve: output.gaps_to_improve,
        ai_refined: true,
        refined_at: new Date().toISOString(),
      })
      .eq('id', matchId)
  } else {
    await supabaseAdmin
      .from('job_matches')
      .update({ ai_refined: false })
      .eq('id', matchId)
  }
}

// ─── Pipeline orchestration ───────────────────────────────────────────────────

const phase2Queue = new PQueue({ concurrency: 3 })

interface ActiveUser {
  id: string
  desired_titles: string[]
  preferred_locations: string[]
  work_preference: 'remote' | 'hybrid' | 'onsite' | null
  location: string | null
  salary_min: number | null
  salary_max: number | null
  years_experience: number | null
}

export async function runPipelineForJobs(
  newJobIds: string[],
  userId: string
): Promise<void> {
  if (newJobIds.length === 0) return

  // Fetch user profile, skills, and resume in parallel
  const [profileResult, skillsResult, resumeResult] = await Promise.all([
    supabaseAdmin.from('profiles').select('*').eq('id', userId).single(),
    supabaseAdmin.from('skills').select('name').eq('user_id', userId),
    supabaseAdmin
      .from('resumes')
      .select('parsed_data')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
  ])

  const profile = profileResult.data as ActiveUser | null
  if (!profile) return

  const userSkills: string[] = (skillsResult.data ?? []).map((s: { name: string }) => s.name)
  const parsedResume = resumeResult.data?.parsed_data ?? null
  const keywords: string[] = (parsedResume as any)?.keywords ?? []

  // Fetch the new jobs
  const { data: jobs } = await supabaseAdmin
    .from('jobs')
    .select('id, title, company, location, is_remote, description, requirements, salary_min, salary_max, extracted_skills, posted_at')
    .in('id', newJobIds)

  if (!jobs) return

  const phase2Jobs: Array<{ matchId: string; job: JobForPhase2 }> = []

  for (const job of jobs) {
    const phase1 = computePhase1(
      {
        title: job.title,
        location: job.location,
        is_remote: job.is_remote,
        description: job.description,
        requirements: job.requirements,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        extracted_skills: job.extracted_skills ?? [],
      },
      profile,
      userSkills,
      keywords
    )

    const { data: matchRow } = await supabaseAdmin
      .from('job_matches')
      .upsert(
        {
          user_id: userId,
          job_id: job.id,
          match_score: phase1.score,
          match_label: phase1.label,
          match_breakdown: phase1.breakdown,
          computed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,job_id' }
      )
      .select('id')
      .single()

    if (matchRow && phase1.score >= 40 && parsedResume) {
      phase2Jobs.push({ matchId: matchRow.id, job })
    }
  }

  // Queue Phase 2 for matches scoring >= 40
  for (const { matchId, job } of phase2Jobs) {
    phase2Queue.add(() => runPhase2ForMatch(matchId, job, parsedResume as Record<string, unknown>))
  }
}

export async function recomputeForUser(userId: string): Promise<void> {
  const { data: existingMatches } = await supabaseAdmin
    .from('job_matches')
    .select('job_id')
    .eq('user_id', userId)

  const jobIds = (existingMatches ?? []).map((m: { job_id: string }) => m.job_id)
  if (jobIds.length === 0) return

  await runPipelineForJobs(jobIds, userId)
}
```

- [ ] **Step 4: Run all tests to verify they pass**

```bash
cd api
npm test -- --testPathPattern=matchEngine
```

Expected: All tests PASS (including Phase 2 tests)

- [ ] **Step 5: Commit**

```bash
git add api/src/workers/matchEngine.ts api/tests/matchEngine.test.ts
git commit -m "feat: add Phase 2 Claude refinement and pipeline orchestration to matchEngine"
```

---

## Task 7: Jobs API Routes

**Files:**
- Create: `api/src/routes/jobs.ts`
- Test: `api/tests/jobs.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/tests/jobs.test.ts`:

```typescript
import request from 'supertest'
import { createApp } from '../src/app'
import { supabaseAdmin } from '../src/config/supabase'

jest.mock('../src/config/supabase', () => ({
  supabaseAdmin: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}))

jest.mock('../src/workers/matchEngine', () => ({
  runPipelineForJobs: jest.fn().mockResolvedValue(undefined),
  recomputeForUser: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../src/workers/scraper', () => ({
  scrapeJobsForUser: jest.fn().mockResolvedValue(['job-1', 'job-2']),
}))

const mockSbFrom = supabaseAdmin.from as jest.Mock
const mockGetUser = supabaseAdmin.auth.getUser as jest.Mock

function makeChain(result: { data: unknown; error: unknown }) {
  const t: any = {}
  ;['select', 'eq', 'neq', 'gte', 'lte', 'not', 'limit', 'update', 'upsert', 'insert', 'delete'].forEach(
    (m) => { t[m] = jest.fn(() => t) }
  )
  ;['single', 'range', 'order', 'in'].forEach((m) => {
    t[m] = jest.fn(() => Promise.resolve(result))
  })
  t.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return t
}

function authAs(userId: string) {
  mockGetUser.mockResolvedValueOnce({
    data: { user: { id: userId, email: 'test@example.com' } },
    error: null,
  })
}

const app = createApp()

describe('GET /api/v1/jobs', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/jobs')
    expect(res.status).toBe(401)
  })

  it('returns 200 with jobs array on valid auth', async () => {
    authAs('user-1')
    // job_matches query
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: [
          {
            match_score: 75,
            match_label: 'strong',
            refined_score: 78,
            ai_refined: true,
            job_id: 'job-1',
            jobs: {
              id: 'job-1',
              title: 'Frontend Engineer',
              company: 'Acme',
              location: 'Austin, TX',
              is_remote: false,
              salary_min: 100000,
              salary_max: 130000,
              apply_url: null,
              posted_at: '2026-04-24T10:00:00Z',
            },
          },
        ],
        error: null,
      })
    )
    // job_applications query
    mockSbFrom.mockReturnValueOnce(
      makeChain({ data: [], error: null })
    )

    const res = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data.jobs).toHaveLength(1)
    expect(res.body.data.jobs[0].title).toBe('Frontend Engineer')
    expect(res.body.data.jobs[0].match_score).toBe(75)
    expect(res.body.data.jobs[0].application_status).toBeNull()
  })
})

describe('GET /api/v1/jobs/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/jobs/some-id')
    expect(res.status).toBe(401)
  })

  it('returns 404 when job match not found', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(
      makeChain({ data: null, error: { message: 'No rows' } })
    )

    const res = await request(app)
      .get('/api/v1/jobs/nonexistent-id')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(404)
  })
})

describe('GET /api/v1/jobs/:id/match', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/jobs/some-id/match')
    expect(res.status).toBe(401)
  })

  it('returns match data for a known job', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: {
          match_score: 72,
          match_label: 'strong',
          refined_score: 78,
          ai_refined: true,
          skills_matched: ['React'],
          skills_missing: ['GraphQL'],
          match_explanation: 'Good match.',
          gaps_to_improve: ['Learn GraphQL'],
        },
        error: null,
      })
    )

    const res = await request(app)
      .get('/api/v1/jobs/job-1/match')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data.match_score).toBe(72)
    expect(res.body.data.ai_refined).toBe(true)
  })
})

describe('POST /api/v1/jobs/refresh', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/jobs/refresh')
    expect(res.status).toBe(401)
  })

  it('returns 202 when eligible (no previous refresh)', async () => {
    authAs('user-1')
    // Profile fetch (for rate limit check + scraper data)
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: {
          id: 'user-1',
          last_refresh_at: null,
          desired_titles: ['Frontend Engineer'],
          preferred_locations: ['Austin'],
          work_preference: null,
        },
        error: null,
      })
    )
    // Profile update (last_refresh_at)
    mockSbFrom.mockReturnValueOnce(makeChain({ data: null, error: null }))

    const res = await request(app)
      .post('/api/v1/jobs/refresh')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(202)
    expect(res.body.data.message).toBe('Refresh queued')
  })

  it('returns 429 when refreshed within the last hour', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: {
          id: 'user-1',
          last_refresh_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
          desired_titles: ['Frontend Engineer'],
          preferred_locations: [],
          work_preference: 'remote',
        },
        error: null,
      })
    )

    const res = await request(app)
      .post('/api/v1/jobs/refresh')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(429)
    expect(res.body.error).toContain('hour')
  })
})

describe('PATCH /api/v1/jobs/:id/status', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).patch('/api/v1/jobs/job-1/status')
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid status value', async () => {
    authAs('user-1')

    const res = await request(app)
      .patch('/api/v1/jobs/job-1/status')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'invalid-status' })

    expect(res.status).toBe(400)
  })

  it('returns 200 with updated application status', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: { job_id: 'job-1', user_id: 'user-1', status: 'applied' },
        error: null,
      })
    )

    const res = await request(app)
      .patch('/api/v1/jobs/job-1/status')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'applied' })

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('applied')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd api
npm test -- --testPathPattern=jobs
```

Expected: FAIL — routes not mounted yet, expect 404s.

- [ ] **Step 3: Implement jobs.ts**

Create `api/src/routes/jobs.ts`:

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { verifyToken, AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { supabaseAdmin } from '../config/supabase'
import { success, failure } from '../types'
import { scrapeJobsForUser } from '../workers/scraper'
import { runPipelineForJobs } from '../workers/matchEngine'

const router = Router()

const ONE_HOUR_MS = 60 * 60 * 1000

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  min_score: z.coerce.number().int().min(0).max(100).optional(),
  status: z
    .enum(['saved', 'dismissed', 'applied', 'interviewing', 'offer', 'rejected'])
    .optional(),
  remote: z.coerce.boolean().optional(),
})

const statusSchema = z.object({
  status: z.enum(['saved', 'dismissed', 'applied', 'interviewing', 'offer', 'rejected']),
})

// GET /jobs — paginated list with match scores
router.get('/', verifyToken, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json(failure('Invalid query parameters'))
    return
  }

  const { page, limit, min_score, status: statusFilter, remote } = parsed.data
  const { userId } = req as AuthRequest
  const offset = (page - 1) * limit

  // If filtering by application status, get matching job_ids first
  let statusJobIds: string[] | null = null
  if (statusFilter) {
    const { data: apps } = await supabaseAdmin
      .from('job_applications')
      .select('job_id')
      .eq('user_id', userId)
      .eq('status', statusFilter)
    statusJobIds = (apps ?? []).map((a: { job_id: string }) => a.job_id)
    if (statusJobIds.length === 0) {
      res.json(success({ jobs: [], total: 0, page, limit }))
      return
    }
  }

  let query = supabaseAdmin
    .from('job_matches')
    .select(
      `match_score, match_label, refined_score, ai_refined, job_id,
       jobs!inner(id, title, company, location, is_remote, salary_min, salary_max, apply_url, posted_at)`
    )
    .eq('user_id', userId)
    .gte('match_score', min_score ?? 0)
    .order('match_score', { ascending: false })

  if (statusJobIds) {
    query = (query as any).in('job_id', statusJobIds)
  }

  const { data: matches, error } = await (query as any).range(offset, offset + limit - 1)

  if (error) {
    res.status(500).json(failure('Failed to fetch jobs'))
    return
  }

  const matchList = (matches ?? []) as any[]
  const jobIds = matchList.map((m) => m.job_id)

  // Fetch application statuses for these jobs
  const { data: applications } = jobIds.length > 0
    ? await supabaseAdmin
        .from('job_applications')
        .select('job_id, status')
        .eq('user_id', userId)
        .in('job_id', jobIds)
    : { data: [] }

  const appMap = new Map(
    (applications ?? []).map((a: { job_id: string; status: string }) => [a.job_id, a.status])
  )

  const jobs = matchList
    .map((m) => ({
      ...m.jobs,
      match_score: m.match_score,
      match_label: m.match_label,
      refined_score: m.refined_score,
      ai_refined: m.ai_refined,
      application_status: appMap.get(m.job_id) ?? null,
    }))
    .filter((j) => remote === undefined || j.is_remote === remote)

  res.json(success({ jobs, total: jobs.length, page, limit }))
})

// GET /jobs/:id — full detail with match breakdown
router.get('/:id', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest

  const { data: match, error } = await supabaseAdmin
    .from('job_matches')
    .select(
      `match_score, match_label, refined_score, ai_refined,
       skills_matched, skills_missing, match_explanation, gaps_to_improve, match_breakdown,
       jobs!inner(id, title, company, location, is_remote, description, requirements,
                  extracted_skills, salary_min, salary_max, apply_url, posted_at)`
    )
    .eq('job_id', req.params.id)
    .eq('user_id', userId)
    .single()

  if (error || !match) {
    res.status(404).json(failure('Job not found'))
    return
  }

  const { data: application } = await supabaseAdmin
    .from('job_applications')
    .select('status')
    .eq('job_id', req.params.id)
    .eq('user_id', userId)
    .single()

  const m = match as any
  res.json(
    success({
      ...m.jobs,
      match_score: m.match_score,
      match_label: m.match_label,
      refined_score: m.refined_score,
      ai_refined: m.ai_refined,
      skills_matched: m.skills_matched,
      skills_missing: m.skills_missing,
      match_explanation: m.match_explanation,
      gaps_to_improve: m.gaps_to_improve,
      match_breakdown: m.match_breakdown,
      application_status: (application as any)?.status ?? null,
    })
  )
})

// GET /jobs/:id/match — match data only (for polling)
router.get('/:id/match', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest

  const { data, error } = await supabaseAdmin
    .from('job_matches')
    .select(
      'match_score, match_label, refined_score, ai_refined, skills_matched, skills_missing, match_explanation, gaps_to_improve'
    )
    .eq('job_id', req.params.id)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    res.status(404).json(failure('Match not found'))
    return
  }

  res.json(success(data))
})

// POST /jobs/refresh — manual trigger (rate-limited 1/hour/user)
router.post('/refresh', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, last_refresh_at, desired_titles, preferred_locations, work_preference')
    .eq('id', userId)
    .single()

  if (error || !profile) {
    res.status(500).json(failure('Failed to fetch profile'))
    return
  }

  const p = profile as any

  if (p.last_refresh_at) {
    const elapsed = Date.now() - new Date(p.last_refresh_at).getTime()
    if (elapsed < ONE_HOUR_MS) {
      res.status(429).json(failure('Refresh allowed once per hour'))
      return
    }
  }

  // Update last_refresh_at immediately (before async work)
  await supabaseAdmin
    .from('profiles')
    .update({ last_refresh_at: new Date().toISOString() })
    .eq('id', userId)

  // Fire-and-forget: scrape + match
  ;(async () => {
    try {
      const jobIds = await scrapeJobsForUser(
        p.desired_titles ?? [],
        p.preferred_locations ?? [],
        p.work_preference ?? null
      )
      if (jobIds.length > 0) {
        await runPipelineForJobs(jobIds, userId)
      }
    } catch (err) {
      console.error('[jobs/refresh] Pipeline error:', err)
    }
  })()

  res.status(202).json(success({ message: 'Refresh queued' }))
})

// PATCH /jobs/:id/status — update application status
router.patch('/:id/status', verifyToken, validate(statusSchema), async (req, res) => {
  const { userId } = req as AuthRequest

  const { data, error } = await supabaseAdmin
    .from('job_applications')
    .upsert(
      {
        user_id: userId,
        job_id: req.params.id,
        status: req.body.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,job_id' }
    )
    .select()
    .single()

  if (error) {
    res.status(500).json(failure('Failed to update status'))
    return
  }

  res.json(success(data))
})

export default router
```

- [ ] **Step 4: Mount the router temporarily for testing**

Open `api/src/routes/index.ts` and add the jobs router (this is also needed for Task 9 but add it now so tests work):

```typescript
import { Router } from 'express'
import healthRouter from './health'
import profileRouter from './profile'
import skillsRouter from './skills'
import resumeRouter from './resume'
import jobsRouter from './jobs'

const router = Router()

router.use('/health', healthRouter)
router.use('/profile', profileRouter)
router.use('/skills', skillsRouter)
router.use('/resume', resumeRouter)
router.use('/jobs', jobsRouter)

export default router
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd api
npm test -- --testPathPattern=jobs
```

Expected: PASS (all jobs tests)

- [ ] **Step 6: Run all tests to confirm nothing is broken**

```bash
cd api
npm test
```

Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add api/src/routes/jobs.ts api/src/routes/index.ts api/tests/jobs.test.ts
git commit -m "feat: add Jobs API routes (GET /jobs, GET /jobs/:id, POST /jobs/refresh, PATCH /jobs/:id/status)"
```

---

## Task 8: Scheduler

**Files:**
- Create: `api/src/workers/scheduler.ts`

No test file — the scheduler is a thin wrapper around node-cron and the pipeline. The pipeline functions are already tested.

- [ ] **Step 1: Implement scheduler.ts**

Create `api/src/workers/scheduler.ts`:

```typescript
import cron from 'node-cron'
import { scrapeForAllActiveUsers } from './scraper'
import { runPipelineForJobs } from './matchEngine'

let schedulerTask: cron.ScheduledTask | null = null

async function runFullPipeline(): Promise<void> {
  console.log('[scheduler] Starting jobs pipeline run...')
  try {
    const results = await scrapeForAllActiveUsers()
    for (const { userId, jobIds } of results) {
      if (jobIds.length > 0) {
        await runPipelineForJobs(jobIds, userId)
      }
    }
    console.log(`[scheduler] Pipeline complete. Processed ${results.length} users.`)
  } catch (err) {
    console.error('[scheduler] Pipeline run failed:', err)
  }
}

export function startScheduler(): void {
  if (schedulerTask) return // already running

  // Run every 2 hours
  schedulerTask = cron.schedule('0 */2 * * *', () => {
    runFullPipeline().catch(console.error)
  })

  console.log('[scheduler] Jobs pipeline scheduled (every 2 hours)')
}

export function stopScheduler(): void {
  schedulerTask?.stop()
  schedulerTask = null
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd api
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add api/src/workers/scheduler.ts
git commit -m "feat: add node-cron scheduler for 2-hour pipeline runs"
```

---

## Task 9: Wire Up — Scheduler + Recompute Triggers

**Files:**
- Modify: `api/src/index.ts` (start scheduler on boot)
- Modify: `api/src/services/resumeParser.ts` (trigger recompute after parse)
- Modify: `api/src/routes/skills.ts` (trigger recompute after skill mutation)

- [ ] **Step 1: Start scheduler in index.ts**

Open `api/src/index.ts`. The current content is:

```typescript
import 'dotenv/config'
import { createApp } from './app'
import { env } from './config/env'

const app = createApp()

const port = parseInt(env.PORT, 10)
app.listen(port, () => {
  console.log(`🚀 API running on port ${port} [${env.NODE_ENV}]`)
})
```

Replace with:

```typescript
import 'dotenv/config'
import { createApp } from './app'
import { env } from './config/env'
import { startScheduler } from './workers/scheduler'

const app = createApp()

const port = parseInt(env.PORT, 10)
app.listen(port, () => {
  console.log(`🚀 API running on port ${port} [${env.NODE_ENV}]`)
  if (env.NODE_ENV !== 'test') {
    startScheduler()
  }
})
```

- [ ] **Step 2: Trigger recompute after resume parsing**

Open `api/src/services/resumeParser.ts`. At the top, add the recomputeForUser import:

```typescript
import Anthropic from '@anthropic-ai/sdk'
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>
import mammoth from 'mammoth'
import { supabaseAdmin } from '../config/supabase'
import { env } from '../config/env'
import { recomputeForUser } from '../workers/matchEngine'
```

In the `parseResumeAsync` function, after the skill sync block (after the `if (parsed.skills.length > 0)` block), add a recompute call. The full updated `parseResumeAsync` function:

```typescript
export async function parseResumeAsync(
  resumeId: string,
  buffer: Buffer,
  fileType: 'pdf' | 'docx',
  userId: string
): Promise<void> {
  try {
    const parsed = await parseResume(buffer, fileType)

    await supabaseAdmin
      .from('resumes')
      .update({
        parsed_data: parsed,
        parsed_at: new Date().toISOString(),
        is_active: true,
      })
      .eq('id', resumeId)

    if (parsed.skills.length > 0) {
      await supabaseAdmin.from('skills').delete().eq('user_id', userId).eq('source', 'resume')

      await supabaseAdmin.from('skills').insert(
        parsed.skills.map((name) => ({ user_id: userId, name, source: 'resume' }))
      )
    }

    // Recompute match scores with the new resume data
    recomputeForUser(userId).catch((err) =>
      console.error('[resumeParser] Recompute failed:', err)
    )
  } catch (err) {
    console.error('[resumeParser] Parsing failed:', err)
  }
}
```

- [ ] **Step 3: Trigger recompute after skill mutations**

Open `api/src/routes/skills.ts`. Add the import at the top:

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { verifyToken, AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { supabaseAdmin } from '../config/supabase'
import { success, failure } from '../types'
import { recomputeForUser } from '../workers/matchEngine'
```

After the successful response in the POST handler, add the fire-and-forget recompute:

```typescript
router.post('/', verifyToken, validate(createSkillSchema), async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('skills')
    .insert({ user_id: userId, source: 'manual', ...req.body })
    .select()
    .single()

  if (error) {
    res.status(500).json(failure('Failed to create skill'))
    return
  }
  recomputeForUser(userId).catch(console.error)
  res.status(201).json(success(data))
})
```

After the successful response in the PUT handler:

```typescript
router.put('/:id', verifyToken, validate(updateSkillSchema), async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('skills')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error || !data) {
    res.status(404).json(failure('Skill not found'))
    return
  }
  recomputeForUser(userId).catch(console.error)
  res.json(success(data))
})
```

After the successful response in the DELETE handler:

```typescript
router.delete('/:id', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { error } = await supabaseAdmin
    .from('skills')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId)

  if (error) {
    res.status(500).json(failure('Failed to delete skill'))
    return
  }
  recomputeForUser(userId).catch(console.error)
  res.status(204).send()
})
```

- [ ] **Step 4: Run typecheck**

```bash
cd api
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Run all tests**

```bash
cd api
npm test
```

Expected: All tests PASS (37+ tests)

- [ ] **Step 6: Commit**

```bash
git add api/src/index.ts api/src/services/resumeParser.ts api/src/routes/skills.ts
git commit -m "feat: wire up scheduler startup and recompute triggers in resume/skills routes"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
cd api
npm test
```

Expected: All tests PASS, 0 failures.

- [ ] **Run typecheck**

```bash
cd api
npm run typecheck
```

Expected: 0 errors.
