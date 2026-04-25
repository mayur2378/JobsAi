# JobTrack AI — Plan 2: Profile, Resume & Onboarding

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the profile API (get/update/complete onboarding), skills CRUD, resume upload + async Claude parsing, and 4-step onboarding wizard so a user can go from registered → fully onboarded with a parsed resume and skills list, before the dashboard gate lets them in.

**Architecture:** The Express API handles `/profile`, `/skills`, and `/resume` routes guarded by `verifyToken`. Resume files upload to Supabase Storage via the service role; Claude (haiku model) parses the extracted text asynchronously and writes `parsed_data` back to the `resumes` table. The Next.js frontend drives a 4-step onboarding wizard (`/onboarding/*`); `(app)/layout.tsx` enforces `onboarding_completed = true` before the dashboard is accessible.

**Tech Stack:** Node.js/Express/TypeScript, multer (memory storage), @anthropic-ai/sdk, pdf-parse, mammoth, Next.js 14 App Router, react-hook-form + Zod, Supabase Storage (service role)

**Prerequisites (already complete):**
- Supabase Storage bucket `resumes` created: private, 10 MB limit, PDF/DOCX only
- Plan 1 merged to `master` — all auth infrastructure in place

---

## File Map

```
jobtrack-ai/
├── api/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── profile.ts           -- GET /profile, PUT /profile, POST /profile/onboarding
│   │   │   ├── skills.ts            -- GET/POST/PUT/:id/DELETE/:id /skills
│   │   │   ├── resume.ts            -- POST /resume/upload, GET /resume, DELETE /resume/:id, POST /resume/:id/reparse
│   │   │   └── index.ts             -- mount profile, skills, resume routers (MODIFY)
│   │   ├── services/
│   │   │   └── resumeParser.ts      -- extractText (pdf-parse/mammoth) + parseResume (Claude) + parseResumeAsync
│   │   └── index.ts                 -- add dotenv/config import for local dev (MODIFY)
│   ├── tests/
│   │   ├── profile.test.ts
│   │   ├── skills.test.ts
│   │   ├── resume.test.ts
│   │   └── resumeParser.test.ts
│   └── package.json                 -- add multer, @anthropic-ai/sdk, pdf-parse, mammoth (MODIFY)
│
└── web/
    ├── app/
    │   ├── (app)/
    │   │   ├── layout.tsx            -- add onboarding_completed gate (MODIFY)
    │   │   └── profile/
    │   │       └── page.tsx          -- profile settings page (uses shared components)
    │   └── (onboarding)/
    │       ├── layout.tsx            -- server auth check + renders OnboardingContainer (NEW — replaces absence)
    │       ├── welcome/page.tsx      -- update CTA to /onboarding/profile (MODIFY)
    │       ├── profile/page.tsx      -- step 2: profile form
    │       ├── resume/page.tsx       -- step 3: resume upload + parse preview
    │       └── skills/page.tsx       -- step 4: skills tagging + complete onboarding
    ├── components/
    │   ├── onboarding/
    │   │   ├── OnboardingContainer.tsx  -- client wrapper: reads pathname, renders step indicator
    │   │   └── StepIndicator.tsx        -- 4-dot progress bar
    │   ├── profile/
    │   │   └── ProfileForm.tsx          -- controlled form: name, phone, location, titles, salary, etc.
    │   ├── resume/
    │   │   ├── ResumeUploader.tsx       -- drag-drop file input + upload progress
    │   │   └── ParsedResumePreview.tsx  -- shows skills/experience/education from parsed_data
    │   └── skills/
    │       └── SkillsManager.tsx        -- add/remove skills with proficiency selector
    └── lib/
        └── api.ts                       -- apiFetch<T>(path, options) with Bearer token
```

---

## Task 1: API — Install dependencies + fix dev env + profile routes

**Files:**
- Modify: `api/package.json`
- Modify: `api/src/index.ts`
- Create: `api/src/routes/profile.ts`
- Modify: `api/src/routes/index.ts`
- Create: `api/tests/profile.test.ts`

- [ ] **Step 1: Install new dependencies**

```bash
cd api && npm install multer @anthropic-ai/sdk pdf-parse mammoth
npm install --save-dev @types/multer @types/pdf-parse @types/mammoth
```

Expected: packages added to `node_modules/`, no errors.

- [ ] **Step 2: Move dotenv to dependencies and fix dev startup**

In `api/package.json`, move `"dotenv"` from `devDependencies` to `dependencies`:

```json
{
  "name": "jobtrack-api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "test": "jest --runInBand",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@supabase/supabase-js": "^2.45.0",
    "cors": "^2.8.5",
    "dotenv": "^17.4.2",
    "express": "^4.19.2",
    "express-rate-limit": "^7.3.1",
    "helmet": "^7.1.0",
    "mammoth": "^1.8.0",
    "multer": "^1.4.5-lts.1",
    "pdf-parse": "^1.1.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/mammoth": "^1.5.1",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.14.0",
    "@types/pdf-parse": "^1.1.4",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.1.4",
    "ts-node": "^10.9.2",
    "tsx": "^4.15.6",
    "typescript": "^5.5.2"
  }
}
```

- [ ] **Step 3: Add dotenv import to `api/src/index.ts`**

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

- [ ] **Step 4: Write failing tests for profile routes**

```typescript
// api/tests/profile.test.ts
import express from 'express'
import request from 'supertest'
import { createApp } from '../src/app'
import { supabaseAdmin } from '../src/config/supabase'

jest.mock('../src/config/supabase', () => ({
  supabaseAdmin: { from: jest.fn(), auth: { getUser: jest.fn() } },
}))

function mockVerifyToken(userId = 'user-abc') {
  ;(supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: userId, email: 'test@test.com' } },
    error: null,
  })
}

function mockFrom(overrides: Record<string, jest.Mock> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    single: jest.fn(),
    ...overrides,
  }
  ;(supabaseAdmin.from as jest.Mock).mockReturnValue(chain)
  return chain
}

describe('GET /api/v1/profile', () => {
  it('returns 401 without token', async () => {
    const res = await request(createApp()).get('/api/v1/profile')
    expect(res.status).toBe(401)
  })

  it('returns profile data for authenticated user', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.single.mockResolvedValue({
      data: { id: 'user-abc', full_name: 'Alice', onboarding_completed: false },
      error: null,
    })

    const res = await request(createApp())
      .get('/api/v1/profile')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data.full_name).toBe('Alice')
    expect(res.body.error).toBeNull()
  })
})

describe('PUT /api/v1/profile', () => {
  it('updates profile and returns updated row', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.single.mockResolvedValue({
      data: { id: 'user-abc', full_name: 'Bob', location: 'Austin', updated_at: new Date().toISOString() },
      error: null,
    })

    const res = await request(createApp())
      .put('/api/v1/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ full_name: 'Bob', location: 'Austin' })

    expect(res.status).toBe(200)
    expect(res.body.data.full_name).toBe('Bob')
  })

  it('returns 400 for invalid field type', async () => {
    mockVerifyToken()
    const res = await request(createApp())
      .put('/api/v1/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ salary_min: 'not-a-number' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Validation error')
  })
})

describe('POST /api/v1/profile/onboarding', () => {
  it('marks onboarding_completed true', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.single.mockResolvedValue({
      data: { id: 'user-abc', onboarding_completed: true },
      error: null,
    })

    const res = await request(createApp())
      .post('/api/v1/profile/onboarding')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data.onboarding_completed).toBe(true)
  })
})
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
cd api && npx jest tests/profile.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module` or routing errors.

- [ ] **Step 6: Create `api/src/routes/profile.ts`**

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { verifyToken, AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { supabaseAdmin } from '../config/supabase'
import { success, failure } from '../types'

const router = Router()

const updateProfileSchema = z.object({
  full_name: z.string().min(1).optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  desired_titles: z.array(z.string()).optional(),
  preferred_locations: z.array(z.string()).optional(),
  work_preference: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  salary_min: z.number().int().min(0).optional(),
  salary_max: z.number().int().min(0).optional(),
  years_experience: z.number().int().min(0).optional(),
  industries: z.array(z.string()).optional(),
})

router.get('/', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    res.status(500).json(failure('Failed to fetch profile'))
    return
  }
  res.json(success(data))
})

router.put('/', verifyToken, validate(updateProfileSchema), async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single()

  if (error) {
    res.status(500).json(failure('Failed to update profile'))
    return
  }
  res.json(success(data))
})

router.post('/onboarding', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single()

  if (error) {
    res.status(500).json(failure('Failed to complete onboarding'))
    return
  }
  res.json(success(data))
})

export default router
```

- [ ] **Step 7: Mount profile router in `api/src/routes/index.ts`**

```typescript
import { Router } from 'express'
import healthRouter from './health'
import profileRouter from './profile'

const router = Router()

router.use('/health', healthRouter)
router.use('/profile', profileRouter)

export default router
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd api && npx jest tests/profile.test.ts --no-coverage
```

Expected: PASS (6 tests)

- [ ] **Step 9: Commit**

```bash
cd api && npm install
git add api/package.json api/package-lock.json api/src/index.ts api/src/routes/profile.ts api/src/routes/index.ts api/tests/profile.test.ts
git commit -m "feat(api): add profile routes and install plan-2 dependencies"
```

---

## Task 2: API — Skills routes

**Files:**
- Create: `api/src/routes/skills.ts`
- Modify: `api/src/routes/index.ts`
- Create: `api/tests/skills.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// api/tests/skills.test.ts
import request from 'supertest'
import { createApp } from '../src/app'
import { supabaseAdmin } from '../src/config/supabase'

jest.mock('../src/config/supabase', () => ({
  supabaseAdmin: { from: jest.fn(), auth: { getUser: jest.fn() } },
}))

function mockVerifyToken(userId = 'user-abc') {
  ;(supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: userId, email: 'test@test.com' } },
    error: null,
  })
}

function mockFrom(overrides: Record<string, jest.Mock> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn(),
    ...overrides,
  }
  ;(supabaseAdmin.from as jest.Mock).mockReturnValue(chain)
  return chain
}

describe('GET /api/v1/skills', () => {
  it('returns skills list for authenticated user', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.order.mockResolvedValue({
      data: [{ id: 'skill-1', name: 'TypeScript', source: 'manual' }],
      error: null,
    })

    const res = await request(createApp())
      .get('/api/v1/skills')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].name).toBe('TypeScript')
  })
})

describe('POST /api/v1/skills', () => {
  it('creates a skill and returns 201', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.single.mockResolvedValue({
      data: { id: 'skill-2', name: 'React', source: 'manual', proficiency: 'expert' },
      error: null,
    })

    const res = await request(createApp())
      .post('/api/v1/skills')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'React', proficiency: 'expert' })

    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('React')
  })

  it('returns 400 when name is missing', async () => {
    mockVerifyToken()
    const res = await request(createApp())
      .post('/api/v1/skills')
      .set('Authorization', 'Bearer valid-token')
      .send({ proficiency: 'expert' })

    expect(res.status).toBe(400)
  })
})

describe('PUT /api/v1/skills/:id', () => {
  it('updates skill proficiency', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.single.mockResolvedValue({
      data: { id: 'skill-1', name: 'TypeScript', proficiency: 'expert' },
      error: null,
    })

    const res = await request(createApp())
      .put('/api/v1/skills/skill-1')
      .set('Authorization', 'Bearer valid-token')
      .send({ proficiency: 'expert' })

    expect(res.status).toBe(200)
    expect(res.body.data.proficiency).toBe('expert')
  })
})

describe('DELETE /api/v1/skills/:id', () => {
  it('deletes skill and returns 204', async () => {
    mockVerifyToken()
    const chain = mockFrom()
    chain.eq.mockResolvedValue({ error: null })

    const res = await request(createApp())
      .delete('/api/v1/skills/skill-1')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd api && npx jest tests/skills.test.ts --no-coverage
```

Expected: FAIL — routing errors (skills router not mounted yet).

- [ ] **Step 3: Create `api/src/routes/skills.ts`**

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { verifyToken, AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { supabaseAdmin } from '../config/supabase'
import { success, failure } from '../types'

const router = Router()

const createSkillSchema = z.object({
  name: z.string().min(1).max(100),
  proficiency: z.enum(['beginner', 'intermediate', 'expert']).optional(),
})

const updateSkillSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  proficiency: z.enum(['beginner', 'intermediate', 'expert']).optional(),
})

router.get('/', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('skills')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    res.status(500).json(failure('Failed to fetch skills'))
    return
  }
  res.json(success(data))
})

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
  res.status(201).json(success(data))
})

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
  res.json(success(data))
})

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
  res.status(204).send()
})

export default router
```

- [ ] **Step 4: Mount skills router in `api/src/routes/index.ts`**

```typescript
import { Router } from 'express'
import healthRouter from './health'
import profileRouter from './profile'
import skillsRouter from './skills'

const router = Router()

router.use('/health', healthRouter)
router.use('/profile', profileRouter)
router.use('/skills', skillsRouter)

export default router
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd api && npx jest tests/skills.test.ts --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/skills.ts api/src/routes/index.ts api/tests/skills.test.ts
git commit -m "feat(api): add skills CRUD routes"
```

---

## Task 3: API — Resume upload routes

**Files:**
- Create: `api/src/routes/resume.ts`
- Modify: `api/src/routes/index.ts`
- Create: `api/tests/resume.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// api/tests/resume.test.ts
import request from 'supertest'
import { createApp } from '../src/app'
import { supabaseAdmin } from '../src/config/supabase'

jest.mock('../src/config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    storage: { from: jest.fn() },
    auth: { getUser: jest.fn() },
  },
}))

// Mock parseResumeAsync so upload tests don't hit Claude
jest.mock('../src/services/resumeParser', () => ({
  parseResumeAsync: jest.fn().mockResolvedValue(undefined),
}))

function mockVerifyToken(userId = 'user-abc') {
  ;(supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: userId, email: 'test@test.com' } },
    error: null,
  })
}

function mockStorage() {
  const storageChain = {
    upload: jest.fn().mockResolvedValue({ error: null }),
    createSignedUrl: jest.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.url/file.pdf' } }),
    download: jest.fn().mockResolvedValue({ data: Buffer.from('pdf content'), error: null }),
    remove: jest.fn().mockResolvedValue({ error: null }),
  }
  ;(supabaseAdmin.storage.from as jest.Mock).mockReturnValue(storageChain)
  return storageChain
}

function mockFrom(overrides: Record<string, jest.Mock> = {}) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn(),
    ...overrides,
  }
  ;(supabaseAdmin.from as jest.Mock).mockReturnValue(chain)
  return chain
}

describe('POST /api/v1/resume/upload', () => {
  it('returns 400 when no file is attached', async () => {
    mockVerifyToken()
    const res = await request(createApp())
      .post('/api/v1/resume/upload')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('No file uploaded')
  })

  it('returns 201 with resume record on valid PDF upload', async () => {
    mockVerifyToken()
    mockStorage()
    const chain = mockFrom()
    // First call: deactivate old resumes (update, no single)
    chain.update.mockReturnThis()
    // Second call: insert new record
    chain.single.mockResolvedValue({
      data: {
        id: 'resume-1',
        user_id: 'user-abc',
        file_name: 'cv.pdf',
        file_url: 'user-abc/uuid-cv.pdf',
        file_type: 'pdf',
        is_active: false,
        parsed_data: null,
      },
      error: null,
    })

    const res = await request(createApp())
      .post('/api/v1/resume/upload')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', Buffer.from('%PDF-1.4 fake pdf'), { filename: 'cv.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(201)
    expect(res.body.data.file_name).toBe('cv.pdf')
  })

  it('returns 400 for unsupported file type', async () => {
    mockVerifyToken()
    const res = await request(createApp())
      .post('/api/v1/resume/upload')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', Buffer.from('plain text'), { filename: 'cv.txt', contentType: 'text/plain' })

    expect(res.status).toBe(400)
  })
})

describe('GET /api/v1/resume', () => {
  it('returns null data when no active resume exists', async () => {
    mockVerifyToken()
    mockStorage()
    const chain = mockFrom()
    chain.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    const res = await request(createApp())
      .get('/api/v1/resume')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data).toBeNull()
  })

  it('returns resume with signed_url when active resume exists', async () => {
    mockVerifyToken()
    mockStorage()
    const chain = mockFrom()
    chain.single.mockResolvedValue({
      data: { id: 'resume-1', file_url: 'user-abc/uuid-cv.pdf', file_name: 'cv.pdf', parsed_data: null },
      error: null,
    })

    const res = await request(createApp())
      .get('/api/v1/resume')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data.signed_url).toBe('https://signed.url/file.pdf')
  })
})

describe('DELETE /api/v1/resume/:id', () => {
  it('deletes resume record and returns 204', async () => {
    mockVerifyToken()
    mockStorage()
    const chain = mockFrom()
    // First call: fetch the resume to get file_url
    chain.single.mockResolvedValue({
      data: { id: 'resume-1', file_url: 'user-abc/uuid-cv.pdf', user_id: 'user-abc' },
      error: null,
    })
    // Second call: delete
    chain.eq.mockResolvedValue({ error: null })

    const res = await request(createApp())
      .delete('/api/v1/resume/resume-1')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd api && npx jest tests/resume.test.ts --no-coverage
```

Expected: FAIL — module/routing errors.

- [ ] **Step 3: Create `api/src/routes/resume.ts`**

```typescript
import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import { verifyToken, AuthRequest } from '../middleware/auth'
import { supabaseAdmin } from '../config/supabase'
import { success, failure } from '../types'
import { parseResumeAsync } from '../services/resumeParser'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only PDF and DOCX files are allowed'))
    }
  },
})

// POST /resume/upload
router.post(
  '/upload',
  verifyToken,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError || err) {
        res.status(400).json(failure(err.message || 'File upload error'))
        return
      }
      next()
    })
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json(failure('No file uploaded'))
      return
    }

    const { userId } = req as AuthRequest
    const fileExt = req.file.originalname.split('.').pop()?.toLowerCase() ?? ''
    const fileType = fileExt === 'pdf' ? 'pdf' : 'docx'
    const storagePath = `${userId}/${randomUUID()}-${req.file.originalname}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('resumes')
      .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype })

    if (uploadError) {
      res.status(500).json(failure('Failed to upload file to storage'))
      return
    }

    // Deactivate any previous active resumes
    await supabaseAdmin
      .from('resumes')
      .update({ is_active: false })
      .eq('user_id', userId)

    const { data, error } = await supabaseAdmin
      .from('resumes')
      .insert({
        user_id: userId,
        file_name: req.file.originalname,
        file_url: storagePath,
        file_type: fileType,
        is_active: false,
      })
      .select()
      .single()

    if (error) {
      res.status(500).json(failure('Failed to save resume record'))
      return
    }

    // Fire-and-forget: parse async, update DB when done
    parseResumeAsync(data.id, req.file.buffer, fileType as 'pdf' | 'docx', userId).catch(
      console.error
    )

    res.status(201).json(success(data))
  }
)

// GET /resume — returns active resume with a fresh signed URL
router.get('/', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { data: resume, error } = await supabaseAdmin
    .from('resumes')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !resume) {
    res.json(success(null))
    return
  }

  const { data: urlData } = await supabaseAdmin.storage
    .from('resumes')
    .createSignedUrl(resume.file_url, 3600)

  res.json(success({ ...resume, signed_url: urlData?.signedUrl ?? null }))
})

// GET /resume/status/:id — poll for parse completion
router.get('/status/:id', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('resumes')
    .select('id, is_active, parsed_data, parsed_at')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    res.status(404).json(failure('Resume not found'))
    return
  }
  res.json(success(data))
})

// DELETE /resume/:id
router.delete('/:id', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest

  const { data: resume, error: fetchError } = await supabaseAdmin
    .from('resumes')
    .select('id, file_url')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single()

  if (fetchError || !resume) {
    res.status(404).json(failure('Resume not found'))
    return
  }

  await supabaseAdmin.storage.from('resumes').remove([resume.file_url])

  await supabaseAdmin.from('resumes').delete().eq('id', resume.id)

  res.status(204).send()
})

// POST /resume/:id/reparse
router.post('/:id/reparse', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest

  const { data: resume, error } = await supabaseAdmin
    .from('resumes')
    .select('id, file_url, file_type')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single()

  if (error || !resume) {
    res.status(404).json(failure('Resume not found'))
    return
  }

  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from('resumes')
    .download(resume.file_url)

  if (downloadError || !fileData) {
    res.status(500).json(failure('Failed to download resume for reparsing'))
    return
  }

  const buffer = Buffer.from(await (fileData as Blob).arrayBuffer())
  parseResumeAsync(resume.id, buffer, resume.file_type as 'pdf' | 'docx', userId).catch(
    console.error
  )

  res.json(success({ message: 'Reparsing started' }))
})

export default router
```

- [ ] **Step 4: Mount resume router in `api/src/routes/index.ts`**

```typescript
import { Router } from 'express'
import healthRouter from './health'
import profileRouter from './profile'
import skillsRouter from './skills'
import resumeRouter from './resume'

const router = Router()

router.use('/health', healthRouter)
router.use('/profile', profileRouter)
router.use('/skills', skillsRouter)
router.use('/resume', resumeRouter)

export default router
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd api && npx jest tests/resume.test.ts --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 6: Run all tests to confirm nothing regressed**

```bash
cd api && npx jest --no-coverage
```

Expected: All suites PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/routes/resume.ts api/src/routes/index.ts api/tests/resume.test.ts
git commit -m "feat(api): add resume upload, get, delete, reparse routes"
```

---

## Task 4: API — Resume parser service (Claude + pdf-parse + mammoth)

**Files:**
- Create: `api/src/services/resumeParser.ts`
- Create: `api/tests/resumeParser.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// api/tests/resumeParser.test.ts
import { parseResume } from '../src/services/resumeParser'

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn(),
      },
    })),
  }
})

// Mock pdf-parse
jest.mock('pdf-parse', () =>
  jest.fn().mockResolvedValue({ text: 'Alice Johnson\nTypeScript, React, Node.js\n5 years experience' })
)

// Mock mammoth
jest.mock('mammoth', () => ({
  extractRawText: jest.fn().mockResolvedValue({ value: 'Alice Johnson\nTypeScript, React\n3 years' }),
}))

import Anthropic from '@anthropic-ai/sdk'

const MOCK_PARSED: Record<string, unknown> = {
  full_name: 'Alice Johnson',
  email: 'alice@example.com',
  phone: null,
  location: 'Austin, TX',
  skills: ['TypeScript', 'React', 'Node.js'],
  experience: [{ title: 'Engineer', company: 'ACME', duration: '2020–present', description: 'Built stuff' }],
  education: [{ degree: 'BSc Computer Science', institution: 'UT Austin', year: '2019' }],
  certifications: [],
  keywords: ['TypeScript', 'React'],
  years_experience: 5,
  summary: 'Experienced engineer',
}

describe('parseResume', () => {
  beforeEach(() => {
    const instance = (Anthropic as jest.MockedClass<typeof Anthropic>).mock.results[0]?.value
    if (instance) {
      ;(instance.messages.create as jest.Mock).mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(MOCK_PARSED) }],
      })
    }
  })

  it('parses a PDF buffer and returns structured data', async () => {
    const result = await parseResume(Buffer.from('%PDF fake'), 'pdf')
    expect(result.full_name).toBe('Alice Johnson')
    expect(result.skills).toContain('TypeScript')
    expect(result.years_experience).toBe(5)
  })

  it('parses a DOCX buffer using mammoth', async () => {
    const instance = (Anthropic as jest.MockedClass<typeof Anthropic>).mock.results[0]?.value
    ;(instance.messages.create as jest.Mock).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ ...MOCK_PARSED, skills: ['TypeScript', 'React'] }) }],
    })

    const result = await parseResume(Buffer.from('PK fake docx'), 'docx')
    expect(result.skills).toContain('React')
  })

  it('throws when Claude returns invalid JSON', async () => {
    const instance = (Anthropic as jest.MockedClass<typeof Anthropic>).mock.results[0]?.value
    ;(instance.messages.create as jest.Mock).mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json {{' }],
    })

    await expect(parseResume(Buffer.from('%PDF fake'), 'pdf')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd api && npx jest tests/resumeParser.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../src/services/resumeParser'`

- [ ] **Step 3: Create `api/src/services/resumeParser.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import { supabaseAdmin } from '../config/supabase'
import { env } from '../config/env'

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

export interface ParsedResume {
  full_name: string | null
  email: string | null
  phone: string | null
  location: string | null
  skills: string[]
  experience: Array<{ title: string; company: string; duration: string; description: string }>
  education: Array<{ degree: string; institution: string; year: string }>
  certifications: string[]
  keywords: string[]
  years_experience: number | null
  summary: string | null
}

async function extractText(buffer: Buffer, fileType: 'pdf' | 'docx'): Promise<string> {
  if (fileType === 'pdf') {
    const result = await pdfParse(buffer)
    return result.text
  }
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

export async function parseResume(buffer: Buffer, fileType: 'pdf' | 'docx'): Promise<ParsedResume> {
  const text = await extractText(buffer, fileType)

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system:
      'You are a resume parser. Extract structured information from resumes and return valid JSON only. No markdown, no code blocks, no explanation — just the raw JSON object.',
    messages: [
      {
        role: 'user',
        content: `Parse this resume and return a JSON object with exactly these fields:
{
  "full_name": string | null,
  "email": string | null,
  "phone": string | null,
  "location": string | null,
  "skills": string[],
  "experience": [{"title": string, "company": string, "duration": string, "description": string}],
  "education": [{"degree": string, "institution": string, "year": string}],
  "certifications": string[],
  "keywords": string[],
  "years_experience": number | null,
  "summary": string | null
}

Resume text:
${text}`,
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

  return JSON.parse(content.text) as ParsedResume
}

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

    // Sync resume-sourced skills: remove old, insert fresh
    if (parsed.skills.length > 0) {
      await supabaseAdmin.from('skills').delete().eq('user_id', userId).eq('source', 'resume')

      await supabaseAdmin.from('skills').insert(
        parsed.skills.map((name) => ({ user_id: userId, name, source: 'resume' }))
      )
    }
  } catch (err) {
    console.error('[resumeParser] Parsing failed:', err)
    // Non-fatal: the resume record stays in DB; user can trigger reparse
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd api && npx jest tests/resumeParser.test.ts --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Run full test suite**

```bash
cd api && npx jest --no-coverage
```

Expected: All suites PASS.

- [ ] **Step 6: TypeScript check**

```bash
cd api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add api/src/services/resumeParser.ts api/tests/resumeParser.test.ts
git commit -m "feat(api): add Claude resume parser service (pdf-parse + mammoth + haiku)"
```

---

## Task 5: Frontend — API client + app layout onboarding gate + update welcome page

> **UI NOTE:** Invoke `superpowers:frontend-design` skill before writing any component or page code in this and all subsequent frontend tasks.

**Files:**
- Create: `web/lib/api.ts`
- Modify: `web/app/(app)/layout.tsx`
- Modify: `web/app/(onboarding)/welcome/page.tsx`

- [ ] **Step 1: Create `web/lib/api.ts`**

```typescript
import { createClient } from './supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function getToken(): Promise<string | null> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_URL}/api/v1${path}`, { ...options, headers })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'API error')
  return json.data as T
}
```

- [ ] **Step 2: Update `web/app/(app)/layout.tsx` to gate on onboarding_completed**

Replace the file content with:

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_completed) redirect('/onboarding/profile')

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
          <a href="/profile" className="block px-3 py-2 rounded-lg hover:text-slate-300 transition">Profile</a>
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Update `web/app/(onboarding)/welcome/page.tsx`**

Replace the file content with:

```typescript
import Link from 'next/link'

export default function OnboardingWelcomePage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at top, #1a0a2e 0%, #0a0a0f 60%)' }}
    >
      <div
        className="max-w-md w-full rounded-2xl p-10 text-center space-y-6"
        style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.2)' }}
      >
        <div className="text-5xl">🚀</div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100 mb-2">Welcome to JobTrack AI</h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            Let's get you set up in under 2 minutes. We'll collect your profile, parse your
            resume with AI, and build your skills list so we can match you to the right jobs.
          </p>
        </div>
        <div className="space-y-2 text-left text-sm text-slate-500">
          {['Your profile & preferences', 'Upload your resume (AI-parsed)', 'Confirm your skills'].map(
            (step, i) => (
              <div key={i} className="flex items-center gap-3">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}
                >
                  {i + 1}
                </span>
                <span>{step}</span>
              </div>
            )
          )}
        </div>
        <Link
          href="/onboarding/profile"
          className="inline-block w-full py-3 rounded-xl text-white text-sm font-semibold text-center hover:opacity-90 transition"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
        >
          Get started →
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/lib/api.ts web/app/\(app\)/layout.tsx web/app/\(onboarding\)/welcome/page.tsx
git commit -m "feat(web): add API client, onboarding gate in app layout, update welcome page"
```

---

## Task 6: Frontend — Onboarding layout, container, step indicator

> **UI NOTE:** Invoke `superpowers:frontend-design` skill before writing any component or page code.

**Files:**
- Create: `web/app/(onboarding)/layout.tsx`
- Create: `web/components/onboarding/OnboardingContainer.tsx`
- Create: `web/components/onboarding/StepIndicator.tsx`

- [ ] **Step 1: Create `web/components/onboarding/StepIndicator.tsx`**

```typescript
interface Step {
  label: string
}

interface StepIndicatorProps {
  steps: Step[]
  currentStep: number
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((step, i) => {
        const isComplete = i < currentStep
        const isActive = i === currentStep
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200"
                style={{
                  background: isComplete
                    ? 'linear-gradient(135deg, #7c3aed, #a855f7)'
                    : isActive
                    ? 'rgba(139,92,246,0.25)'
                    : 'rgba(255,255,255,0.05)',
                  border: isActive
                    ? '2px solid #a78bfa'
                    : isComplete
                    ? '2px solid transparent'
                    : '2px solid rgba(255,255,255,0.1)',
                  color: isComplete ? '#fff' : isActive ? '#a78bfa' : '#4b5563',
                }}
              >
                {isComplete ? '✓' : i + 1}
              </div>
              <span
                className="text-xs font-medium"
                style={{ color: isActive ? '#a78bfa' : '#4b5563' }}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="w-8 h-px mb-5"
                style={{
                  background: isComplete
                    ? 'linear-gradient(90deg, #7c3aed, #a855f7)'
                    : 'rgba(255,255,255,0.08)',
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Create `web/components/onboarding/OnboardingContainer.tsx`**

```typescript
'use client'

import { usePathname } from 'next/navigation'
import { StepIndicator } from './StepIndicator'

const STEPS = [
  { path: '/onboarding/welcome', label: 'Welcome' },
  { path: '/onboarding/profile', label: 'Profile' },
  { path: '/onboarding/resume', label: 'Resume' },
  { path: '/onboarding/skills', label: 'Skills' },
]

export function OnboardingContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const currentStep = Math.max(
    STEPS.findIndex((s) => pathname.startsWith(s.path)),
    0
  )

  return (
    <div
      className="min-h-screen"
      style={{ background: 'radial-gradient(ellipse at top, #1a0a2e 0%, #0a0a0f 60%)' }}
    >
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-6">
          <h1
            className="text-2xl font-extrabold"
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            JobTrack AI
          </h1>
        </div>
        <StepIndicator steps={STEPS} currentStep={currentStep} />
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `web/app/(onboarding)/layout.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingContainer } from '@/components/onboarding/OnboardingContainer'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return <OnboardingContainer>{children}</OnboardingContainer>
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/app/\(onboarding\)/layout.tsx web/components/onboarding/
git commit -m "feat(web): add onboarding layout, container, and step indicator"
```

---

## Task 7: Frontend — Onboarding step 2: Profile form

> **UI NOTE:** Invoke `superpowers:frontend-design` skill before writing any component or page code.

**Files:**
- Create: `web/components/profile/ProfileForm.tsx`
- Create: `web/app/(onboarding)/profile/page.tsx`

- [ ] **Step 1: Create `web/components/profile/ProfileForm.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'

const profileSchema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  location: z.string().optional(),
  phone: z.string().optional(),
  work_preference: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  years_experience: z.coerce.number().int().min(0).optional(),
  salary_min: z.coerce.number().int().min(0).optional(),
  salary_max: z.coerce.number().int().min(0).optional(),
  desired_titles: z.array(z.object({ value: z.string() })).optional(),
  industries: z.array(z.object({ value: z.string() })).optional(),
})

type FormData = z.infer<typeof profileSchema>

interface ProfileFormProps {
  defaultValues?: Partial<FormData>
  nextPath?: string   // where to navigate after save (default: /onboarding/resume)
  submitLabel?: string
}

const inputClass =
  'w-full px-3 py-2.5 rounded-lg text-sm text-slate-100 placeholder-slate-500 bg-white/5 border border-purple-500/20 focus:outline-none focus:border-purple-500/60 transition'
const labelClass = 'block text-sm font-medium text-slate-300 mb-1'

export function ProfileForm({
  defaultValues,
  nextPath = '/onboarding/resume',
  submitLabel = 'Save & continue',
}: ProfileFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: defaultValues ?? {},
  })

  const { fields: titleFields, append: addTitle, remove: removeTitle } = useFieldArray({
    control,
    name: 'desired_titles',
  })
  const { fields: industryFields, append: addIndustry, remove: removeIndustry } = useFieldArray({
    control,
    name: 'industries',
  })

  async function onSubmit(data: FormData) {
    setIsLoading(true)
    setServerError(null)
    try {
      await apiFetch('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          ...data,
          desired_titles: data.desired_titles?.map((t) => t.value).filter(Boolean) ?? [],
          industries: data.industries?.map((i) => i.value).filter(Boolean) ?? [],
        }),
      })
      router.push(nextPath)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Name */}
      <div>
        <label className={labelClass}>Full name *</label>
        <input {...register('full_name')} placeholder="Alice Johnson" className={inputClass} />
        {errors.full_name && <p className="text-red-400 text-xs mt-1">{errors.full_name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Location */}
        <div>
          <label className={labelClass}>Location</label>
          <input {...register('location')} placeholder="Austin, TX" className={inputClass} />
        </div>
        {/* Phone */}
        <div>
          <label className={labelClass}>Phone</label>
          <input {...register('phone')} placeholder="+1 555-000-0000" className={inputClass} />
        </div>
      </div>

      {/* Work preference */}
      <div>
        <label className={labelClass}>Work preference</label>
        <select
          {...register('work_preference')}
          className={inputClass}
          style={{ appearance: 'none' }}
        >
          <option value="">Select preference</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">On-site</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Years experience */}
        <div>
          <label className={labelClass}>Years exp.</label>
          <input
            {...register('years_experience')}
            type="number"
            min="0"
            placeholder="5"
            className={inputClass}
          />
        </div>
        {/* Salary min */}
        <div>
          <label className={labelClass}>Min salary ($)</label>
          <input
            {...register('salary_min')}
            type="number"
            min="0"
            placeholder="80000"
            className={inputClass}
          />
        </div>
        {/* Salary max */}
        <div>
          <label className={labelClass}>Max salary ($)</label>
          <input
            {...register('salary_max')}
            type="number"
            min="0"
            placeholder="120000"
            className={inputClass}
          />
        </div>
      </div>

      {/* Desired titles */}
      <div>
        <label className={labelClass}>Desired job titles</label>
        <div className="space-y-2">
          {titleFields.map((field, i) => (
            <div key={field.id} className="flex gap-2">
              <input
                {...register(`desired_titles.${i}.value`)}
                placeholder="e.g. Senior Frontend Engineer"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => removeTitle(i)}
                className="px-3 py-2 rounded-lg text-slate-400 hover:text-red-400 transition text-sm"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addTitle({ value: '' })}
            className="text-sm text-purple-400 hover:text-purple-300 transition"
          >
            + Add title
          </button>
        </div>
      </div>

      {/* Industries */}
      <div>
        <label className={labelClass}>Industries</label>
        <div className="space-y-2">
          {industryFields.map((field, i) => (
            <div key={field.id} className="flex gap-2">
              <input
                {...register(`industries.${i}.value`)}
                placeholder="e.g. FinTech"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => removeIndustry(i)}
                className="px-3 py-2 rounded-lg text-slate-400 hover:text-red-400 transition text-sm"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addIndustry({ value: '' })}
            className="text-sm text-purple-400 hover:text-purple-300 transition"
          >
            + Add industry
          </button>
        </div>
      </div>

      {serverError && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {serverError}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-50 hover:opacity-90 transition"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
      >
        {isLoading ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Create `web/app/(onboarding)/profile/page.tsx`**

```typescript
import { ProfileForm } from '@/components/profile/ProfileForm'

export default function OnboardingProfilePage() {
  return (
    <div
      className="rounded-2xl p-8"
      style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.2)' }}
    >
      <h2 className="text-xl font-extrabold text-slate-100 mb-1">Tell us about yourself</h2>
      <p className="text-slate-500 text-sm mb-6">This helps us match you to the right roles.</p>
      <ProfileForm />
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke test**

```bash
cd web && npm run dev
```

Navigate to `http://localhost:3000/onboarding/profile` — confirm form renders with step indicator at step 2.

- [ ] **Step 5: Commit**

```bash
git add web/components/profile/ web/app/\(onboarding\)/profile/
git commit -m "feat(web): add onboarding profile step with ProfileForm"
```

---

## Task 8: Frontend — Onboarding step 3: Resume upload + parse preview

> **UI NOTE:** Invoke `superpowers:frontend-design` skill before writing any component or page code.

**Files:**
- Create: `web/components/resume/ResumeUploader.tsx`
- Create: `web/components/resume/ParsedResumePreview.tsx`
- Create: `web/app/(onboarding)/resume/page.tsx`

- [ ] **Step 1: Create `web/components/resume/ResumeUploader.tsx`**

```typescript
'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ResumeRecord {
  id: string
  file_name: string
  file_type: string
  is_active: boolean
  parsed_data: Record<string, unknown> | null
  parsed_at: string | null
}

interface ResumeUploaderProps {
  onUploaded: (resume: ResumeRecord) => void
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export function ResumeUploader({ onUploaded }: ResumeUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    setIsUploading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`${API_URL}/api/v1/resume/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')

      onUploaded(json.data as ResumeRecord)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className="cursor-pointer rounded-xl p-10 text-center transition-all duration-200"
        style={{
          border: `2px dashed ${isDragging ? 'rgba(139,92,246,0.6)' : 'rgba(139,92,246,0.2)'}`,
          background: isDragging ? 'rgba(139,92,246,0.05)' : 'transparent',
        }}
      >
        {isUploading ? (
          <div className="space-y-3">
            <div
              className="w-10 h-10 rounded-full border-2 border-purple-500/40 border-t-purple-500 animate-spin mx-auto"
            />
            <p className="text-slate-400 text-sm">Uploading…</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-4xl">📄</div>
            <div>
              <p className="text-slate-300 text-sm font-medium">Drop your resume here</p>
              <p className="text-slate-500 text-xs mt-1">PDF or DOCX, up to 10 MB</p>
            </div>
            <span
              className="inline-block px-4 py-2 rounded-lg text-xs font-semibold text-purple-300 transition hover:text-white"
              style={{ border: '1px solid rgba(139,92,246,0.3)' }}
            >
              Browse file
            </span>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleChange}
      />
      {error && (
        <p className="text-red-400 text-sm mt-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `web/components/resume/ParsedResumePreview.tsx`**

```typescript
interface ParsedData {
  full_name?: string | null
  skills?: string[]
  experience?: Array<{ title: string; company: string; duration: string }>
  education?: Array<{ degree: string; institution: string; year: string }>
  years_experience?: number | null
  summary?: string | null
}

interface ParsedResumePreviewProps {
  fileName: string
  parsedData: ParsedData | null
  isParsing: boolean
}

export function ParsedResumePreview({ fileName, parsedData, isParsing }: ParsedResumePreviewProps) {
  return (
    <div
      className="rounded-xl p-5 space-y-4"
      style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.2)' }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">📄</span>
        <div>
          <p className="text-slate-200 text-sm font-medium">{fileName}</p>
          <p className="text-slate-500 text-xs">
            {isParsing ? (
              <span className="text-purple-400 animate-pulse">AI is parsing your resume…</span>
            ) : parsedData ? (
              <span className="text-green-400">✓ Parsed successfully</span>
            ) : (
              <span className="text-slate-500">Awaiting parse</span>
            )}
          </p>
        </div>
      </div>

      {parsedData && (
        <div className="space-y-3 text-sm">
          {parsedData.summary && (
            <p className="text-slate-400 leading-relaxed text-xs">{parsedData.summary}</p>
          )}

          {parsedData.skills && parsedData.skills.length > 0 && (
            <div>
              <p className="text-slate-400 font-medium mb-2 text-xs uppercase tracking-wide">
                Skills detected ({parsedData.skills.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {parsedData.skills.slice(0, 12).map((skill) => (
                  <span
                    key={skill}
                    className="px-2 py-0.5 rounded-md text-xs"
                    style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}
                  >
                    {skill}
                  </span>
                ))}
                {parsedData.skills.length > 12 && (
                  <span className="text-slate-500 text-xs px-1">
                    +{parsedData.skills.length - 12} more
                  </span>
                )}
              </div>
            </div>
          )}

          {parsedData.experience && parsedData.experience.length > 0 && (
            <div>
              <p className="text-slate-400 font-medium mb-2 text-xs uppercase tracking-wide">Experience</p>
              <div className="space-y-1">
                {parsedData.experience.slice(0, 3).map((exp, i) => (
                  <div key={i} className="text-xs text-slate-400">
                    <span className="text-slate-300">{exp.title}</span>
                    {exp.company && <span> at {exp.company}</span>}
                    {exp.duration && <span className="text-slate-500"> · {exp.duration}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `web/app/(onboarding)/resume/page.tsx`**

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ResumeUploader } from '@/components/resume/ResumeUploader'
import { ParsedResumePreview } from '@/components/resume/ParsedResumePreview'
import { apiFetch } from '@/lib/api'

interface ResumeRecord {
  id: string
  file_name: string
  file_type: string
  is_active: boolean
  parsed_data: Record<string, unknown> | null
  parsed_at: string | null
}

export default function OnboardingResumePage() {
  const router = useRouter()
  const [resume, setResume] = useState<ResumeRecord | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => {
    return () => stopPolling()
  }, [])

  function startPolling(resumeId: string) {
    setIsParsing(true)
    pollRef.current = setInterval(async () => {
      try {
        const data = await apiFetch<ResumeRecord>(`/resume/status/${resumeId}`)
        if (data.parsed_data) {
          setResume(data)
          setIsParsing(false)
          stopPolling()
        }
      } catch {
        // polling errors are non-fatal
      }
    }, 2000)
  }

  function handleUploaded(uploaded: ResumeRecord) {
    setResume(uploaded)
    startPolling(uploaded.id)
  }

  return (
    <div
      className="rounded-2xl p-8 space-y-6"
      style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.2)' }}
    >
      <div>
        <h2 className="text-xl font-extrabold text-slate-100 mb-1">Upload your resume</h2>
        <p className="text-slate-500 text-sm">
          We'll use AI to extract your skills and experience automatically.
        </p>
      </div>

      {!resume ? (
        <ResumeUploader onUploaded={handleUploaded} />
      ) : (
        <ParsedResumePreview
          fileName={resume.file_name}
          parsedData={resume.parsed_data as Record<string, unknown> | null}
          isParsing={isParsing}
        />
      )}

      <div className="flex gap-3">
        <button
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-200 transition"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }}
        >
          ← Back
        </button>
        <button
          onClick={() => router.push('/onboarding/skills')}
          disabled={!resume}
          className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-40 hover:opacity-90 transition"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
        >
          {resume ? 'Continue →' : 'Upload resume to continue'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/components/resume/ web/app/\(onboarding\)/resume/
git commit -m "feat(web): add onboarding resume step with upload and parse preview"
```

---

## Task 9: Frontend — Onboarding step 4: Skills manager + complete onboarding

> **UI NOTE:** Invoke `superpowers:frontend-design` skill before writing any component or page code.

**Files:**
- Create: `web/components/skills/SkillsManager.tsx`
- Create: `web/app/(onboarding)/skills/page.tsx`

- [ ] **Step 1: Create `web/components/skills/SkillsManager.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/api'

interface Skill {
  id: string
  name: string
  source: 'resume' | 'manual'
  proficiency: 'beginner' | 'intermediate' | 'expert' | null
}

const PROFICIENCY_COLORS: Record<string, string> = {
  beginner: 'rgba(251,191,36,0.15)',
  intermediate: 'rgba(52,211,153,0.15)',
  expert: 'rgba(139,92,246,0.2)',
}

const PROFICIENCY_TEXT: Record<string, string> = {
  beginner: '#fbbf24',
  intermediate: '#34d399',
  expert: '#a78bfa',
}

interface SkillsManagerProps {
  onReady?: (count: number) => void
}

export function SkillsManager({ onReady }: SkillsManagerProps) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [newSkillName, setNewSkillName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Skill[]>('/skills')
      .then((data) => {
        setSkills(data)
        onReady?.(data.length)
      })
      .catch(() => setError('Failed to load skills'))
      .finally(() => setIsLoading(false))
  }, [])

  async function addSkill() {
    const name = newSkillName.trim()
    if (!name) return
    setIsAdding(true)
    try {
      const skill = await apiFetch<Skill>('/skills', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setSkills((prev) => [...prev, skill])
      setNewSkillName('')
      onReady?.(skills.length + 1)
    } catch {
      setError('Failed to add skill')
    } finally {
      setIsAdding(false)
    }
  }

  async function updateProficiency(id: string, proficiency: Skill['proficiency']) {
    try {
      const updated = await apiFetch<Skill>(`/skills/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ proficiency }),
      })
      setSkills((prev) => prev.map((s) => (s.id === id ? updated : s)))
    } catch {
      setError('Failed to update skill')
    }
  }

  async function removeSkill(id: string) {
    try {
      await apiFetch(`/skills/${id}`, { method: 'DELETE' })
      const next = skills.filter((s) => s.id !== id)
      setSkills(next)
      onReady?.(next.length)
    } catch {
      setError('Failed to remove skill')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
        <div className="w-4 h-4 border-2 border-purple-500/40 border-t-purple-500 rounded-full animate-spin" />
        Loading skills…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Add skill input */}
      <div className="flex gap-2">
        <input
          value={newSkillName}
          onChange={(e) => setNewSkillName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addSkill()}
          placeholder="Add a skill (e.g. TypeScript)"
          className="flex-1 px-3 py-2.5 rounded-lg text-sm text-slate-100 placeholder-slate-500 bg-white/5 border border-purple-500/20 focus:outline-none focus:border-purple-500/60 transition"
        />
        <button
          onClick={addSkill}
          disabled={isAdding || !newSkillName.trim()}
          className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 hover:opacity-90 transition"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
        >
          {isAdding ? '…' : 'Add'}
        </button>
      </div>

      {/* Skills list */}
      {skills.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-4">
          No skills yet. Add some above or upload a resume to auto-detect them.
        </p>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="flex items-center justify-between rounded-lg px-3 py-2.5"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-slate-200 text-sm font-medium truncate">{skill.name}</span>
                {skill.source === 'resume' && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}
                  >
                    resume
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 ml-2">
                <select
                  value={skill.proficiency ?? ''}
                  onChange={(e) =>
                    updateProficiency(skill.id, (e.target.value || null) as Skill['proficiency'])
                  }
                  className="text-xs rounded-md px-2 py-1 border-0 outline-none cursor-pointer"
                  style={{
                    background: skill.proficiency
                      ? PROFICIENCY_COLORS[skill.proficiency]
                      : 'rgba(255,255,255,0.05)',
                    color: skill.proficiency ? PROFICIENCY_TEXT[skill.proficiency] : '#6b7280',
                  }}
                >
                  <option value="">Level</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="expert">Expert</option>
                </select>
                <button
                  onClick={() => removeSkill(skill.id)}
                  className="text-slate-600 hover:text-red-400 transition text-xs px-1"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `web/app/(onboarding)/skills/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SkillsManager } from '@/components/skills/SkillsManager'
import { apiFetch } from '@/lib/api'

export default function OnboardingSkillsPage() {
  const router = useRouter()
  const [skillCount, setSkillCount] = useState(0)
  const [isCompleting, setIsCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function completeOnboarding() {
    setIsCompleting(true)
    setError(null)
    try {
      await apiFetch('/profile/onboarding', { method: 'POST' })
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding')
    } finally {
      setIsCompleting(false)
    }
  }

  return (
    <div
      className="rounded-2xl p-8 space-y-6"
      style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.2)' }}
    >
      <div>
        <h2 className="text-xl font-extrabold text-slate-100 mb-1">Confirm your skills</h2>
        <p className="text-slate-500 text-sm">
          Skills from your resume have been added automatically. Add more or adjust proficiency levels.
        </p>
      </div>

      <SkillsManager onReady={setSkillCount} />

      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-200 transition"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }}
        >
          ← Back
        </button>
        <button
          onClick={completeOnboarding}
          disabled={isCompleting}
          className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-50 hover:opacity-90 transition"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
        >
          {isCompleting
            ? 'Finishing…'
            : skillCount > 0
            ? `Finish setup (${skillCount} skill${skillCount === 1 ? '' : 's'}) →`
            : 'Finish setup →'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/components/skills/ web/app/\(onboarding\)/skills/
git commit -m "feat(web): add onboarding skills step and complete-onboarding flow"
```

---

## Task 10: Frontend — Profile settings page

> **UI NOTE:** Invoke `superpowers:frontend-design` skill before writing any component or page code.

**Files:**
- Create: `web/app/(app)/profile/page.tsx`

- [ ] **Step 1: Create `web/app/(app)/profile/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { ProfilePageClient } from '@/components/profile/ProfilePageClient'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  return <ProfilePageClient profile={profile} userEmail={user!.email!} />
}
```

- [ ] **Step 2: Create `web/components/profile/ProfilePageClient.tsx`**

```typescript
'use client'

import { ProfileForm } from './ProfileForm'
import { ResumeUploader } from '../resume/ResumeUploader'
import { ParsedResumePreview } from '../resume/ParsedResumePreview'
import { SkillsManager } from '../skills/SkillsManager'
import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '@/lib/api'

interface Profile {
  id: string
  full_name: string | null
  location: string | null
  phone: string | null
  work_preference: string | null
  years_experience: number | null
  salary_min: number | null
  salary_max: number | null
  desired_titles: string[]
  industries: string[]
}

interface ResumeRecord {
  id: string
  file_name: string
  parsed_data: Record<string, unknown> | null
  parsed_at: string | null
  is_active: boolean
}

interface ProfilePageClientProps {
  profile: Profile | null
  userEmail: string
}

export function ProfilePageClient({ profile, userEmail }: ProfilePageClientProps) {
  const [resume, setResume] = useState<ResumeRecord | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    apiFetch<ResumeRecord | null>('/resume').then(setResume).catch(() => null)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  function handleUploaded(uploaded: ResumeRecord) {
    setResume(uploaded)
    setIsParsing(true)
    pollRef.current = setInterval(async () => {
      try {
        const data = await apiFetch<ResumeRecord>(`/resume/status/${uploaded.id}`)
        if (data.parsed_data) {
          setResume(data)
          setIsParsing(false)
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch { /* non-fatal */ }
    }, 2000)
  }

  const defaultValues = profile
    ? {
        full_name: profile.full_name ?? '',
        location: profile.location ?? '',
        phone: profile.phone ?? '',
        work_preference: (profile.work_preference as 'remote' | 'hybrid' | 'onsite') ?? undefined,
        years_experience: profile.years_experience ?? undefined,
        salary_min: profile.salary_min ?? undefined,
        salary_max: profile.salary_max ?? undefined,
        desired_titles: (profile.desired_titles ?? []).map((v) => ({ value: v })),
        industries: (profile.industries ?? []).map((v) => ({ value: v })),
      }
    : {}

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-extrabold text-slate-100">Profile</h1>
        <p className="text-slate-500 text-sm mt-1">{userEmail}</p>
      </div>

      {/* Profile details */}
      <section
        className="rounded-2xl p-6"
        style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
      >
        <h2 className="text-base font-bold text-slate-200 mb-5">Personal details</h2>
        <ProfileForm defaultValues={defaultValues} nextPath="/dashboard" submitLabel="Save changes" />
      </section>

      {/* Resume */}
      <section
        className="rounded-2xl p-6 space-y-4"
        style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
      >
        <h2 className="text-base font-bold text-slate-200">Resume</h2>
        {resume ? (
          <ParsedResumePreview
            fileName={resume.file_name}
            parsedData={resume.parsed_data}
            isParsing={isParsing}
          />
        ) : (
          <ResumeUploader onUploaded={handleUploaded} />
        )}
        {resume && (
          <button
            onClick={() => setResume(null)}
            className="text-sm text-purple-400 hover:text-purple-300 transition"
          >
            Replace resume
          </button>
        )}
      </section>

      {/* Skills */}
      <section
        className="rounded-2xl p-6"
        style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
      >
        <h2 className="text-base font-bold text-slate-200 mb-5">Skills</h2>
        <SkillsManager />
      </section>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run full API test suite one final time**

```bash
cd api && npx jest --no-coverage
```

Expected: All suites PASS.

- [ ] **Step 5: End-to-end smoke test**

```bash
# Terminal 1
cd api && npm run dev

# Terminal 2
cd web && npm run dev
```

Walk through the full flow:
1. `http://localhost:3000/register` → register a new account
2. Confirm redirect to `/onboarding/welcome` — step indicator shows step 1
3. Click "Get started" → `/onboarding/profile` — fill form, save
4. `/onboarding/resume` — upload a PDF, watch "AI is parsing…" then "✓ Parsed"
5. `/onboarding/skills` — confirm skills from resume appear, add one manually, click "Finish setup"
6. Confirm redirect to `/dashboard`
7. Navigate to `/profile` — confirm profile form pre-filled, resume shown, skills listed

- [ ] **Step 6: Commit**

```bash
git add web/app/\(app\)/profile/ web/components/profile/ProfilePageClient.tsx
git commit -m "feat(web): add profile settings page"
```

---

## Self-Review Checklist

- [x] **Profile API:** GET, PUT, POST /onboarding — all tested
- [x] **Skills API:** GET, POST, PUT/:id, DELETE/:id — all tested
- [x] **Resume API:** upload (multer + Supabase Storage), GET with signed URL, DELETE, reparse — tested
- [x] **Resume parser:** pdf-parse + mammoth text extraction, Claude haiku JSON output, fire-and-forget async update — tested with mocks
- [x] **Onboarding gate:** `(app)/layout.tsx` redirects to `/onboarding/profile` if `onboarding_completed = false`
- [x] **Onboarding layout:** server auth check + client step indicator via `usePathname`
- [x] **4-step wizard:** Welcome → Profile → Resume upload/parse → Skills → Dashboard
- [x] **onboarding_completed:** set to `true` via `POST /profile/onboarding` in skills step
- [x] **Profile settings page:** reuses ProfileForm, ResumeUploader, ParsedResumePreview, SkillsManager
- [x] **API client helper:** `apiFetch<T>` with Bearer token auto-attached
- [x] **Frontend-design skill:** invoked in each UI task before writing component code
- [x] **No placeholders:** all steps contain actual code
- [x] **TypeScript clean:** both api/ and web/ compile with --noEmit

---

## What's Next

- **Plan 3:** SerpAPI job scraper (node-cron), Phase 1 rule-based scoring, Phase 2 Claude match scoring, p-queue async worker, Supabase Realtime score updates
- **Plan 4:** Frontend — dashboard widgets, jobs list (virtualised), job detail, filters, match score badges
- **Plan 5:** Kanban tracker, notes, analytics charts, notifications, reminders
