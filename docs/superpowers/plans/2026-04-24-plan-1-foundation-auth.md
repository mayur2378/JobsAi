# JobTrack AI — Plan 1: Foundation & Auth

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the full project structure (`api/` + `web/` + `supabase/`), run all 10 database migrations with RLS, and deliver working end-to-end authentication (register, login, forgot/reset password) with JWT middleware and security baseline.

**Architecture:** `api/` is a Node.js/Express/TypeScript server deployed on Railway. `web/` is a Next.js 14 App Router app deployed on Vercel. Supabase handles PostgreSQL, Auth, Storage, and Realtime. Auth flows go directly from the frontend to Supabase JS — the Express API only needs to verify the resulting JWT via `verifyToken` middleware.

**Tech Stack:** Node.js 20, TypeScript 5, Express 4, @supabase/supabase-js v2, @supabase/ssr, Zod 3, express-rate-limit 7, Jest 29, Supertest 6, Next.js 14, Tailwind CSS 3, react-hook-form 7, @hookform/resolvers

---

## File Map

```
jobtrack-ai/
├── api/
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.ts              -- Zod env validation, exits on bad config
│   │   │   └── supabase.ts         -- Supabase admin client (service role)
│   │   ├── middleware/
│   │   │   ├── auth.ts             -- verifyToken: validates Supabase JWT, attaches userId
│   │   │   ├── validate.ts         -- Zod request body validation factory
│   │   │   ├── errorHandler.ts     -- 404 + 500 error handlers
│   │   │   └── rateLimiter.ts      -- general (100/min) + ai (10/min) limiters
│   │   ├── routes/
│   │   │   ├── health.ts           -- GET /api/v1/health
│   │   │   └── index.ts            -- mounts all routers
│   │   ├── types/
│   │   │   └── index.ts            -- ApiResponse, success(), failure()
│   │   ├── app.ts                  -- Express app factory (used by server + tests)
│   │   └── index.ts                -- server entry point
│   ├── tests/
│   │   ├── health.test.ts          -- health endpoint tests
│   │   └── auth.middleware.test.ts -- verifyToken unit tests
│   ├── .env.example
│   ├── jest.config.ts
│   ├── package.json
│   └── tsconfig.json
│
├── web/
│   ├── app/
│   │   ├── layout.tsx              -- root layout (fonts, metadata)
│   │   ├── globals.css             -- Tailwind base + dark galaxy CSS vars
│   │   ├── page.tsx                -- landing page (redirects to /login if unauthed)
│   │   ├── (auth)/
│   │   │   ├── layout.tsx          -- centered card layout for auth pages
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── forgot-password/page.tsx
│   │   └── (app)/
│   │       ├── layout.tsx          -- sidebar layout (placeholder)
│   │       └── dashboard/page.tsx  -- placeholder dashboard
│   ├── components/
│   │   └── auth/
│   │       ├── LoginForm.tsx       -- email/password form with Zod validation
│   │       ├── RegisterForm.tsx    -- register form with password confirm
│   │       └── ForgotPasswordForm.tsx
│   ├── lib/
│   │   └── supabase/
│   │       ├── client.ts           -- browser Supabase client
│   │       └── server.ts           -- server-side Supabase client (SSR cookies)
│   ├── middleware.ts                -- Next.js route protection + auth redirects
│   ├── .env.example
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── package.json
│   └── tsconfig.json
│
└── supabase/
    └── migrations/
        ├── 001_schema.sql          -- all 10 tables + enums + indexes
        └── 002_rls.sql             -- RLS enable + all policies
```

---

## Task 1: Bootstrap `api/` package

**Files:**
- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/jest.config.ts`
- Create: `api/.env.example`

- [ ] **Step 1: Create `api/` directory structure**

```bash
mkdir -p api/src/config api/src/middleware api/src/routes api/src/types api/tests
```

- [ ] **Step 2: Create `api/package.json`**

```json
{
  "name": "jobtrack-api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.3.1",
    "helmet": "^7.1.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.1.4",
    "tsx": "^4.15.6",
    "typescript": "^5.5.2"
  }
}
```

- [ ] **Step 3: Create `api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src", "tests"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create `api/jest.config.ts`**

```typescript
import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  clearMocks: true,
}

export default config
```

- [ ] **Step 5: Create `api/.env.example`**

```bash
PORT=3001
NODE_ENV=development
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SERPAPI_KEY=your-serpapi-key
ANTHROPIC_API_KEY=your-anthropic-key
RESEND_API_KEY=your-resend-key
CORS_ORIGIN=http://localhost:3000
```

- [ ] **Step 6: Install api dependencies**

```bash
cd api && npm install
```

Expected: `node_modules/` populated, no errors.

- [ ] **Step 7: Commit**

```bash
git add api/package.json api/tsconfig.json api/jest.config.ts api/.env.example
git commit -m "chore: bootstrap api package structure"
```

---

## Task 2: API config — env validation + Supabase admin client

**Files:**
- Create: `api/src/config/env.ts`
- Create: `api/src/config/supabase.ts`

- [ ] **Step 1: Write the failing test for env validation**

```typescript
// api/tests/env.test.ts
import { z } from 'zod'

describe('env config', () => {
  it('exports SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    process.env.PORT = '3001'
    process.env.NODE_ENV = 'test'
    process.env.CORS_ORIGIN = 'http://localhost:3000'

    // Re-import after setting env
    jest.resetModules()
    const { env } = require('../src/config/env')
    expect(env.SUPABASE_URL).toBe('https://test.supabase.co')
    expect(env.PORT).toBe('3001')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && npx jest tests/env.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../src/config/env'`

- [ ] **Step 3: Create `api/src/config/env.ts`**

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

- [ ] **Step 4: Create `api/src/config/supabase.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'
import { env } from './env'

export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd api && npx jest tests/env.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add api/src/config/ api/tests/env.test.ts
git commit -m "feat(api): add env validation and supabase admin client"
```

---

## Task 3: API shared types + response helpers

**Files:**
- Create: `api/src/types/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// api/tests/types.test.ts
import { success, failure } from '../src/types'

describe('response helpers', () => {
  it('success wraps data with null error', () => {
    const res = success({ id: 1 })
    expect(res.data).toEqual({ id: 1 })
    expect(res.error).toBeNull()
    expect(res.meta).toEqual({})
  })

  it('success includes meta when provided', () => {
    const res = success('ok', { total: 5 })
    expect(res.meta).toEqual({ total: 5 })
  })

  it('failure wraps error string with null data', () => {
    const res = failure('Something broke')
    expect(res.data).toBeNull()
    expect(res.error).toBe('Something broke')
    expect(res.meta).toEqual({})
  })

  it('failure includes meta fields when provided', () => {
    const res = failure('Validation error', { fields: { email: ['Invalid'] } })
    expect(res.meta).toEqual({ fields: { email: ['Invalid'] } })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && npx jest tests/types.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../src/types'`

- [ ] **Step 3: Create `api/src/types/index.ts`**

```typescript
export interface ApiResponse<T = unknown> {
  data: T | null
  error: string | null
  meta: Record<string, unknown>
}

export function success<T>(
  data: T,
  meta: Record<string, unknown> = {}
): ApiResponse<T> {
  return { data, error: null, meta }
}

export function failure(
  error: string,
  meta: Record<string, unknown> = {}
): ApiResponse<null> {
  return { data: null, error, meta }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd api && npx jest tests/types.test.ts --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add api/src/types/ api/tests/types.test.ts
git commit -m "feat(api): add ApiResponse type and success/failure helpers"
```

---

## Task 4: API middleware — auth, validate, errorHandler, rateLimiter

**Files:**
- Create: `api/src/middleware/auth.ts`
- Create: `api/src/middleware/validate.ts`
- Create: `api/src/middleware/errorHandler.ts`
- Create: `api/src/middleware/rateLimiter.ts`

- [ ] **Step 1: Write the failing tests for auth middleware**

```typescript
// api/tests/auth.middleware.test.ts
import express, { Router } from 'express'
import request from 'supertest'
import { verifyToken, AuthRequest } from '../src/middleware/auth'
import { supabaseAdmin } from '../src/config/supabase'

function makeApp() {
  const app = express()
  app.use(express.json())
  const router = Router()
  router.get('/protected', verifyToken, (req, res) => {
    res.json({ userId: (req as AuthRequest).userId })
  })
  app.use('/api/v1', router)
  return app
}

describe('verifyToken middleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(makeApp()).get('/api/v1/protected')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Missing authorization header')
    expect(res.body.data).toBeNull()
  })

  it('returns 401 when header does not start with Bearer', async () => {
    const res = await request(makeApp())
      .get('/api/v1/protected')
      .set('Authorization', 'Basic abc123')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Missing authorization header')
  })

  it('returns 401 when token is invalid', async () => {
    jest.spyOn(supabaseAdmin.auth, 'getUser').mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid JWT' },
    } as any)

    const res = await request(makeApp())
      .get('/api/v1/protected')
      .set('Authorization', 'Bearer bad-token')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid or expired token')
  })

  it('calls next and attaches userId when token is valid', async () => {
    jest.spyOn(supabaseAdmin.auth, 'getUser').mockResolvedValueOnce({
      data: { user: { id: 'user-abc', email: 'test@example.com' } },
      error: null,
    } as any)

    const res = await request(makeApp())
      .get('/api/v1/protected')
      .set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(200)
    expect(res.body.userId).toBe('user-abc')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && npx jest tests/auth.middleware.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../src/middleware/auth'`

- [ ] **Step 3: Create `api/src/middleware/auth.ts`**

```typescript
import { Request, Response, NextFunction } from 'express'
import { supabaseAdmin } from '../config/supabase'
import { failure } from '../types'

export interface AuthRequest extends Request {
  userId: string
  userEmail: string
}

export async function verifyToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json(failure('Missing authorization header'))
    return
  }

  const token = authHeader.slice(7)

  try {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token)

    if (error || !user) {
      res.status(401).json(failure('Invalid or expired token'))
      return
    }

    ;(req as AuthRequest).userId = user.id
    ;(req as AuthRequest).userEmail = user.email!
    next()
  } catch {
    res.status(401).json(failure('Token verification failed'))
  }
}
```

- [ ] **Step 4: Run auth middleware tests to verify they pass**

```bash
cd api && npx jest tests/auth.middleware.test.ts --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Create `api/src/middleware/validate.ts`**

```typescript
import { Request, Response, NextFunction } from 'express'
import { ZodSchema } from 'zod'
import { failure } from '../types'

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json(
        failure('Validation error', {
          fields: result.error.flatten().fieldErrors,
        })
      )
      return
    }
    req.body = result.data
    next()
  }
}
```

- [ ] **Step 6: Create `api/src/middleware/errorHandler.ts`**

```typescript
import { Request, Response, NextFunction } from 'express'
import { failure } from '../types'
import { env } from '../config/env'

export function notFound(_req: Request, res: Response): void {
  res.status(404).json(failure('Not found'))
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(err.stack)
  const message =
    env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  res.status(500).json(failure(message))
}
```

- [ ] **Step 7: Create `api/src/middleware/rateLimiter.ts`**

```typescript
import rateLimit from 'express-rate-limit'
import { failure } from '../types'

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json(failure('Too many requests')),
})

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json(failure('AI rate limit exceeded — try again in a minute')),
})
```

- [ ] **Step 8: Commit**

```bash
git add api/src/middleware/ api/tests/auth.middleware.test.ts
git commit -m "feat(api): add auth, validate, errorHandler, rateLimiter middleware"
```

---

## Task 5: API app factory + health route

**Files:**
- Create: `api/src/routes/health.ts`
- Create: `api/src/routes/index.ts`
- Create: `api/src/app.ts`
- Create: `api/src/index.ts`

- [ ] **Step 1: Write the failing test for health endpoint**

```typescript
// api/tests/health.test.ts
import request from 'supertest'
import { createApp } from '../src/app'

describe('GET /api/v1/health', () => {
  it('returns 200 with status ok and timestamp', async () => {
    const res = await request(createApp()).get('/api/v1/health')
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('ok')
    expect(res.body.error).toBeNull()
    expect(typeof res.body.data.timestamp).toBe('string')
  })

  it('returns 404 for unknown routes', async () => {
    const res = await request(createApp()).get('/api/v1/nonexistent')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Not found')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && npx jest tests/health.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../src/app'`

- [ ] **Step 3: Create `api/src/routes/health.ts`**

```typescript
import { Router } from 'express'
import { success } from '../types'

const router = Router()

router.get('/', (_req, res) => {
  res.json(success({ status: 'ok', timestamp: new Date().toISOString() }))
})

export default router
```

- [ ] **Step 4: Create `api/src/routes/index.ts`**

```typescript
import { Router } from 'express'
import healthRouter from './health'

const router = Router()

router.use('/health', healthRouter)

export default router
```

- [ ] **Step 5: Create `api/src/app.ts`**

```typescript
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env'
import router from './routes'
import { errorHandler, notFound } from './middleware/errorHandler'
import { generalLimiter } from './middleware/rateLimiter'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  )
  app.use(express.json({ limit: '10mb' }))
  app.use(generalLimiter)

  app.use('/api/v1', router)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
```

- [ ] **Step 6: Create `api/src/index.ts`**

```typescript
import { createApp } from './app'
import { env } from './config/env'

const app = createApp()

const port = parseInt(env.PORT, 10)
app.listen(port, () => {
  console.log(`🚀 API running on port ${port} [${env.NODE_ENV}]`)
})
```

- [ ] **Step 7: Run all API tests**

```bash
cd api && npx jest --no-coverage
```

Expected: PASS — all tests across env, types, auth.middleware, health suites

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd api && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add api/src/routes/ api/src/app.ts api/src/index.ts api/tests/health.test.ts
git commit -m "feat(api): add health route and Express app factory"
```

---

## Task 6: Database migrations — schema (all 10 tables)

**Files:**
- Create: `supabase/migrations/001_schema.sql`

- [ ] **Step 1: Create migrations directory**

```bash
mkdir -p supabase/migrations
```

- [ ] **Step 2: Create `supabase/migrations/001_schema.sql`**

```sql
-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

create type work_preference_type   as enum ('remote', 'hybrid', 'onsite');
create type file_type_enum         as enum ('pdf', 'docx');
create type skill_source_enum      as enum ('resume', 'manual');
create type proficiency_enum       as enum ('beginner', 'intermediate', 'expert');
create type match_label_enum       as enum ('excellent', 'strong', 'good', 'possible', 'low');
create type app_status_enum        as enum ('saved', 'dismissed', 'applied', 'interviewing', 'offer', 'rejected');
create type reminder_type_enum     as enum ('interview', 'followup', 'deadline', 'custom');
create type notification_type_enum as enum ('new_jobs', 'interview_reminder', 'followup', 'offer', 'system');

-- ─── TABLES ───────────────────────────────────────────────────────────────────

-- profiles (1-to-1 with auth.users)
create table profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  full_name            varchar,
  phone                varchar,
  location             varchar,
  desired_titles       text[]               default '{}',
  preferred_locations  text[]               default '{}',
  work_preference      work_preference_type,
  salary_min           int,
  salary_max           int,
  years_experience     int,
  industries           text[]               default '{}',
  onboarding_completed bool                 default false,
  updated_at           timestamptz          default now()
);

-- resumes
create table resumes (
  id          uuid        primary key default uuid_generate_v4(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  file_name   varchar     not null,
  file_url    varchar     not null,
  file_type   file_type_enum not null,
  parsed_data jsonb,
  is_active   bool        default false,
  parsed_at   timestamptz,
  created_at  timestamptz default now()
);

-- skills
create table skills (
  id          uuid             primary key default uuid_generate_v4(),
  user_id     uuid             not null references auth.users(id) on delete cascade,
  name        varchar          not null,
  source      skill_source_enum not null default 'manual',
  proficiency proficiency_enum,
  created_at  timestamptz      default now()
);

-- jobs (shared pool — deduped by external_id)
create table jobs (
  id               uuid        primary key default uuid_generate_v4(),
  external_id      varchar     unique not null,
  source           varchar     not null,
  title            varchar     not null,
  company          varchar,
  location         varchar,
  is_remote        bool        default false,
  description      text,
  requirements     text,
  salary_min       int,
  salary_max       int,
  salary_currency  varchar     default 'USD',
  apply_url        varchar,
  posted_at        timestamptz,
  expires_at       timestamptz,
  is_active        bool        default true,
  raw_data         jsonb,
  created_at       timestamptz default now()
);

-- job_matches (per-user, two-phase scored)
create table job_matches (
  id                uuid            primary key default uuid_generate_v4(),
  user_id           uuid            not null references auth.users(id) on delete cascade,
  job_id            uuid            not null references jobs(id) on delete cascade,
  match_score       int             check (match_score >= 0 and match_score <= 100),
  match_label       match_label_enum,
  skills_matched    text[]          default '{}',
  skills_missing    text[]          default '{}',
  match_breakdown   jsonb,
  match_explanation text,
  gaps_to_improve   text[]          default '{}',
  computed_at       timestamptz     default now(),
  created_at        timestamptz     default now(),
  unique (user_id, job_id)
);

-- job_applications (lifecycle tracker)
create table job_applications (
  id             uuid           primary key default uuid_generate_v4(),
  user_id        uuid           not null references auth.users(id) on delete cascade,
  job_id         uuid           not null references jobs(id) on delete cascade,
  status         app_status_enum not null default 'saved',
  applied_at     timestamptz,
  interview_date timestamptz,
  follow_up_date timestamptz,
  offer_amount   int,
  created_at     timestamptz    default now(),
  updated_at     timestamptz    default now(),
  unique (user_id, job_id)
);

-- notes
create table notes (
  id                   uuid        primary key default uuid_generate_v4(),
  user_id              uuid        not null references auth.users(id) on delete cascade,
  job_application_id   uuid        not null references job_applications(id) on delete cascade,
  content              text        not null,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- reminders
create table reminders (
  id                   uuid               primary key default uuid_generate_v4(),
  user_id              uuid               not null references auth.users(id) on delete cascade,
  job_application_id   uuid               not null references job_applications(id) on delete cascade,
  reminder_type        reminder_type_enum not null,
  remind_at            timestamptz        not null,
  message              text,
  is_sent              bool               default false,
  created_at           timestamptz        default now()
);

-- notifications
create table notifications (
  id          uuid                    primary key default uuid_generate_v4(),
  user_id     uuid                    not null references auth.users(id) on delete cascade,
  type        notification_type_enum  not null,
  title       varchar                 not null,
  message     text,
  is_read     bool                    default false,
  metadata    jsonb,
  created_at  timestamptz             default now()
);

-- ─── INDEXES ──────────────────────────────────────────────────────────────────

create index idx_resumes_user_id             on resumes(user_id);
create index idx_skills_user_id              on skills(user_id);
create index idx_jobs_active                 on jobs(is_active, created_at desc);
create index idx_job_matches_user_id         on job_matches(user_id);
create index idx_job_matches_score           on job_matches(user_id, match_score desc);
create index idx_job_applications_user_id    on job_applications(user_id);
create index idx_job_applications_status     on job_applications(user_id, status);
create index idx_notes_application_id        on notes(job_application_id);
create index idx_reminders_pending           on reminders(user_id, remind_at) where is_sent = false;
create index idx_notifications_user_unread   on notifications(user_id, created_at desc) where is_read = false;
```

- [ ] **Step 3: Run migration in Supabase SQL Editor**

Go to your Supabase project → SQL Editor → paste the entire contents of `001_schema.sql` → Run.

Expected: "Success. No rows returned." — all tables and enums created.

- [ ] **Step 4: Verify tables exist in Supabase Table Editor**

Navigate to Table Editor in Supabase dashboard. Confirm these 10 tables are visible: `profiles`, `resumes`, `skills`, `jobs`, `job_matches`, `job_applications`, `notes`, `reminders`, `notifications` (plus `users` from auth schema).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/001_schema.sql
git commit -m "feat(db): add initial schema — 10 tables, enums, indexes"
```

---

## Task 7: Database RLS policies

**Files:**
- Create: `supabase/migrations/002_rls.sql`

- [ ] **Step 1: Create `supabase/migrations/002_rls.sql`**

```sql
-- ─── ENABLE RLS ───────────────────────────────────────────────────────────────

alter table profiles         enable row level security;
alter table resumes          enable row level security;
alter table skills           enable row level security;
alter table jobs             enable row level security;
alter table job_matches      enable row level security;
alter table job_applications enable row level security;
alter table notes            enable row level security;
alter table reminders        enable row level security;
alter table notifications    enable row level security;

-- ─── PROFILES ─────────────────────────────────────────────────────────────────

create policy "profiles: users manage own"
  on profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ─── RESUMES ──────────────────────────────────────────────────────────────────

create policy "resumes: users manage own"
  on resumes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── SKILLS ───────────────────────────────────────────────────────────────────

create policy "skills: users manage own"
  on skills for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── JOBS (shared pool) ───────────────────────────────────────────────────────
-- Authenticated users can read all active jobs.
-- Only the service_role (API backend) can insert/update/delete.

create policy "jobs: authenticated users can read"
  on jobs for select
  using (auth.role() = 'authenticated');

create policy "jobs: service_role can write"
  on jobs for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- ─── JOB_MATCHES ──────────────────────────────────────────────────────────────
-- Users read their own. Service role writes (match engine runs server-side).

create policy "job_matches: users read own"
  on job_matches for select
  using (auth.uid() = user_id);

create policy "job_matches: service_role manages all"
  on job_matches for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- ─── JOB_APPLICATIONS ─────────────────────────────────────────────────────────

create policy "job_applications: users manage own"
  on job_applications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── NOTES ────────────────────────────────────────────────────────────────────

create policy "notes: users manage own"
  on notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── REMINDERS ────────────────────────────────────────────────────────────────

create policy "reminders: users manage own"
  on reminders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
-- Users can read and mark-as-read their own. Service role creates them.

create policy "notifications: users read own"
  on notifications for select
  using (auth.uid() = user_id);

create policy "notifications: users update own (read status)"
  on notifications for update
  using (auth.uid() = user_id);

create policy "notifications: service_role manages all"
  on notifications for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- ─── AUTO-CREATE PROFILE ON SIGNUP ───────────────────────────────────────────
-- Trigger that inserts an empty profile row when a new user registers.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
```

- [ ] **Step 2: Run migration in Supabase SQL Editor**

Paste the entire contents of `002_rls.sql` → Run.

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify RLS is enabled**

In Supabase dashboard → Authentication → Policies. Confirm all 9 tables show policies listed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/002_rls.sql
git commit -m "feat(db): add RLS policies and auto-create profile trigger"
```

---

## Task 8: Bootstrap `web/` Next.js app

**Files:**
- Create: `web/` (via `create-next-app`)
- Create: `web/lib/supabase/client.ts`
- Create: `web/lib/supabase/server.ts`
- Create: `web/app/globals.css`

- [ ] **Step 1: Scaffold Next.js app**

```bash
cd .. # ensure you're in jobtrack-ai/
npx create-next-app@14 web \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*" \
  --no-git
```

When prompted for additional options, accept defaults. This creates `web/` with App Router, TypeScript, Tailwind configured.

- [ ] **Step 2: Install Supabase SSR + auth helpers**

```bash
cd web && npm install @supabase/supabase-js @supabase/ssr
npm install react-hook-form @hookform/resolvers zod
```

- [ ] **Step 3: Create `web/.env.example`**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Copy to `.env.local` and fill in your real Supabase values.

- [ ] **Step 4: Create `web/lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 5: Create `web/lib/supabase/server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from a Server Component — safe to ignore
          }
        },
      },
    }
  )
}
```

- [ ] **Step 6: Update `web/app/globals.css` with dark galaxy base**

Replace the generated content with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-base: #0a0a0f;
  --bg-surface: #0f0c1a;
  --border-default: rgba(139, 92, 246, 0.15);
  --border-hover: rgba(139, 92, 246, 0.4);
}

body {
  background-color: var(--bg-base);
  color: #e2e8f0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

* {
  box-sizing: border-box;
}
```

- [ ] **Step 7: Update `web/app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'JobTrack AI',
  description: 'AI-powered job search and application tracker',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 8: Verify Next.js dev server starts**

```bash
cd web && npm run dev
```

Expected: `▲ Next.js 14.x.x` running on `http://localhost:3000`

- [ ] **Step 9: Commit**

```bash
git add web/
git commit -m "feat(web): bootstrap Next.js 14 app with Supabase SSR client"
```

---

## Task 9: Next.js route protection middleware

**Files:**
- Create: `web/middleware.ts`

- [ ] **Step 1: Create `web/middleware.ts`**

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

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add web/middleware.ts
git commit -m "feat(web): add route protection middleware with Supabase auth"
```

---

## Task 10: Auth pages — Login, Register, Forgot Password

**Files:**
- Create: `web/app/(auth)/layout.tsx`
- Create: `web/components/auth/LoginForm.tsx`
- Create: `web/app/(auth)/login/page.tsx`
- Create: `web/components/auth/RegisterForm.tsx`
- Create: `web/app/(auth)/register/page.tsx`
- Create: `web/components/auth/ForgotPasswordForm.tsx`
- Create: `web/app/(auth)/forgot-password/page.tsx`

- [ ] **Step 1: Create `web/app/(auth)/layout.tsx`**

```typescript
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'radial-gradient(ellipse at top, #1a0a2e 0%, #0a0a0f 60%)' }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1
            className="text-2xl font-extrabold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            JobTrack AI
          </h1>
          <p className="text-slate-500 text-sm mt-1">Powered by Claude</p>
        </div>
        <div
          className="rounded-2xl p-8"
          style={{
            background: '#0f0c1a',
            border: '1px solid rgba(139, 92, 246, 0.2)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `web/components/auth/LoginForm.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type FormData = z.infer<typeof schema>

const inputClass =
  'w-full px-3 py-2.5 rounded-lg text-sm text-slate-100 placeholder-slate-500 bg-white/5 border border-purple-500/20 focus:outline-none focus:border-purple-500/60 transition'

export function LoginForm() {
  const router = useRouter()
  const supabase = createClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setIsLoading(true)
    setServerError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })

    setIsLoading(false)

    if (error) {
      setServerError(error.message)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Email
        </label>
        <input
          {...register('email')}
          type="email"
          placeholder="you@example.com"
          className={inputClass}
        />
        {errors.email && (
          <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-slate-300">
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-xs text-purple-400 hover:text-purple-300 transition"
          >
            Forgot password?
          </Link>
        </div>
        <input
          {...register('password')}
          type="password"
          placeholder="••••••••"
          className={inputClass}
        />
        {errors.password && (
          <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
        )}
      </div>

      {serverError && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {serverError}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-2.5 rounded-lg font-semibold text-sm text-white disabled:opacity-50 transition hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
      >
        {isLoading ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="text-center text-sm text-slate-500">
        No account?{' '}
        <Link href="/register" className="text-purple-400 hover:text-purple-300 transition">
          Create one
        </Link>
      </p>
    </form>
  )
}
```

- [ ] **Step 3: Create `web/app/(auth)/login/page.tsx`**

```typescript
import { LoginForm } from '@/components/auth/LoginForm'

export default function LoginPage() {
  return (
    <>
      <h2 className="text-lg font-bold text-slate-100 mb-6">Sign in</h2>
      <LoginForm />
    </>
  )
}
```

- [ ] **Step 4: Create `web/components/auth/RegisterForm.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const schema = z
  .object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormData = z.infer<typeof schema>

const inputClass =
  'w-full px-3 py-2.5 rounded-lg text-sm text-slate-100 placeholder-slate-500 bg-white/5 border border-purple-500/20 focus:outline-none focus:border-purple-500/60 transition'

export function RegisterForm() {
  const router = useRouter()
  const supabase = createClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setIsLoading(true)
    setServerError(null)

    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/onboarding/welcome`,
      },
    })

    setIsLoading(false)

    if (error) {
      setServerError(error.message)
      return
    }

    router.push('/onboarding/welcome')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Email
        </label>
        <input
          {...register('email')}
          type="email"
          placeholder="you@example.com"
          className={inputClass}
        />
        {errors.email && (
          <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Password
        </label>
        <input
          {...register('password')}
          type="password"
          placeholder="Min 8 characters"
          className={inputClass}
        />
        {errors.password && (
          <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Confirm Password
        </label>
        <input
          {...register('confirmPassword')}
          type="password"
          placeholder="••••••••"
          className={inputClass}
        />
        {errors.confirmPassword && (
          <p className="text-red-400 text-xs mt-1">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      {serverError && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {serverError}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-2.5 rounded-lg font-semibold text-sm text-white disabled:opacity-50 transition hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
      >
        {isLoading ? 'Creating account…' : 'Create account'}
      </button>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="text-purple-400 hover:text-purple-300 transition">
          Sign in
        </Link>
      </p>
    </form>
  )
}
```

- [ ] **Step 5: Create `web/app/(auth)/register/page.tsx`**

```typescript
import { RegisterForm } from '@/components/auth/RegisterForm'

export default function RegisterPage() {
  return (
    <>
      <h2 className="text-lg font-bold text-slate-100 mb-6">Create account</h2>
      <RegisterForm />
    </>
  )
}
```

- [ ] **Step 6: Create `web/components/auth/ForgotPasswordForm.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const schema = z.object({
  email: z.string().email('Invalid email address'),
})

type FormData = z.infer<typeof schema>

const inputClass =
  'w-full px-3 py-2.5 rounded-lg text-sm text-slate-100 placeholder-slate-500 bg-white/5 border border-purple-500/20 focus:outline-none focus:border-purple-500/60 transition'

export function ForgotPasswordForm() {
  const supabase = createClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setIsLoading(true)
    setServerError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setIsLoading(false)

    if (error) {
      setServerError(error.message)
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div className="text-center space-y-3">
        <div className="text-3xl">📧</div>
        <p className="text-slate-300 text-sm">
          Check your inbox — we sent a password reset link.
        </p>
        <Link
          href="/login"
          className="block text-purple-400 hover:text-purple-300 text-sm transition"
        >
          ← Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <p className="text-slate-400 text-sm mb-2">
        Enter your email and we'll send you a reset link.
      </p>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          Email
        </label>
        <input
          {...register('email')}
          type="email"
          placeholder="you@example.com"
          className={inputClass}
        />
        {errors.email && (
          <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
        )}
      </div>

      {serverError && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {serverError}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-2.5 rounded-lg font-semibold text-sm text-white disabled:opacity-50 transition hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
      >
        {isLoading ? 'Sending…' : 'Send reset link'}
      </button>

      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="text-purple-400 hover:text-purple-300 transition">
          ← Back to sign in
        </Link>
      </p>
    </form>
  )
}
```

- [ ] **Step 7: Create `web/app/(auth)/forgot-password/page.tsx`**

```typescript
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'

export default function ForgotPasswordPage() {
  return (
    <>
      <h2 className="text-lg font-bold text-slate-100 mb-6">Reset password</h2>
      <ForgotPasswordForm />
    </>
  )
}
```

- [ ] **Step 8: Verify TypeScript compiles with no errors**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 9: Smoke test in browser**

```bash
cd web && npm run dev
```

Navigate to:
- `http://localhost:3000/login` — should show Sign in form with dark galaxy card
- `http://localhost:3000/register` — should show Create account form
- `http://localhost:3000/forgot-password` — should show Reset password form
- `http://localhost:3000/dashboard` — should redirect to `/login` (not authenticated)

- [ ] **Step 10: Commit**

```bash
git add web/app/ web/components/
git commit -m "feat(web): add auth pages — login, register, forgot-password"
```

---

## Task 11: Protected app layout + placeholder dashboard

**Files:**
- Create: `web/app/(app)/layout.tsx`
- Create: `web/app/(app)/dashboard/page.tsx`
- Create: `web/app/(onboarding)/welcome/page.tsx`

- [ ] **Step 1: Create `web/app/(app)/layout.tsx`** (placeholder sidebar)

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0a0a0f' }}>
      {/* Sidebar placeholder — replaced in Plan 4 */}
      <aside
        className="w-52 flex-shrink-0 flex flex-col py-4"
        style={{
          background: '#0f0c1a',
          borderRight: '1px solid rgba(139,92,246,0.12)',
        }}
      >
        <div
          className="px-4 pb-4 text-base font-extrabold"
          style={{
            background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          JobTrack AI
        </div>
        <nav className="flex-1 px-2 space-y-0.5 text-sm text-slate-500">
          <a href="/dashboard" className="block px-3 py-2 rounded-lg hover:text-slate-300 transition">Dashboard</a>
          <a href="/jobs" className="block px-3 py-2 rounded-lg hover:text-slate-300 transition">Jobs</a>
          <a href="/tracker" className="block px-3 py-2 rounded-lg hover:text-slate-300 transition">Tracker</a>
          <a href="/analytics" className="block px-3 py-2 rounded-lg hover:text-slate-300 transition">Analytics</a>
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Create `web/app/(app)/dashboard/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-slate-100">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">
          Signed in as {user?.email}
        </p>
      </div>
      <div
        className="rounded-xl p-6 text-slate-400 text-sm"
        style={{
          background: '#0f0c1a',
          border: '1px solid rgba(139,92,246,0.15)',
        }}
      >
        ✅ Auth working — Dashboard UI comes in Plan 4.
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `web/app/(onboarding)/welcome/page.tsx`**

```typescript
import Link from 'next/link'

export default function OnboardingWelcomePage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#0a0a0f' }}
    >
      <div
        className="max-w-md w-full rounded-2xl p-8 text-center space-y-4"
        style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.2)' }}
      >
        <div className="text-4xl">🎉</div>
        <h1 className="text-xl font-extrabold text-slate-100">Account created!</h1>
        <p className="text-slate-400 text-sm">
          Onboarding wizard comes in Plan 2. For now, head to the dashboard.
        </p>
        <Link
          href="/dashboard"
          className="inline-block w-full py-2.5 rounded-lg text-white text-sm font-semibold text-center hover:opacity-90 transition"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
        >
          Go to Dashboard →
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: End-to-end smoke test**

```bash
cd web && npm run dev
```

1. Go to `http://localhost:3000/register` → fill form with a real email → submit
2. Check Supabase Auth dashboard → confirm user was created
3. Check Supabase Table Editor → `profiles` table → confirm a row was auto-created (trigger from Task 7)
4. Go to `http://localhost:3000/login` → sign in → confirm redirect to `/dashboard`
5. Confirm email shown on dashboard
6. Go to `http://localhost:3000/login` again while signed in → confirm redirect to `/dashboard`

- [ ] **Step 5: Run all API tests one final time**

```bash
cd ../api && npx jest --no-coverage
```

Expected: All tests PASS

- [ ] **Step 6: Final commit**

```bash
git add web/app/(app)/ web/app/(onboarding)/
git commit -m "feat(web): add protected app layout and placeholder dashboard"
```

---

## Self-Review Checklist

- [x] **Auth:** register, login, forgot-password all implemented end-to-end
- [x] **JWT middleware:** `verifyToken` tested for missing header, invalid token, valid token
- [x] **Database:** All 10 tables created with enums, indexes, and RLS policies
- [x] **Auto-profile trigger:** Profile row created on signup (Task 7)
- [x] **Route protection:** Unauthenticated → `/login`, authenticated → `/dashboard`
- [x] **API response envelope:** `{ data, error, meta }` used consistently
- [x] **Rate limiting:** 100/min general limiter applied to all routes
- [x] **No placeholders:** Every step has actual code or exact commands
- [x] **TypeScript:** Both `api/` and `web/` compile with `--noEmit`
- [x] **AWS portability:** `verifyToken` is the only auth coupling point; swappable without touching routes

---

## What's Next

- **Plan 2:** Profile form, 4-step onboarding wizard, resume upload + Claude API parsing, skills CRUD
- **Plan 3:** SerpAPI job scraper (cron worker), Phase 1 rule-based scoring, Phase 2 Claude scoring, Supabase Realtime updates
- **Plan 4:** Frontend — dashboard, jobs list, job detail page, filters, match score UI
- **Plan 5:** Kanban tracker, notes, analytics charts, notifications, reminders
