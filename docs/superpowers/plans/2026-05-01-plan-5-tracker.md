# Plan 5 — Application Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Application Tracker — a Kanban board at `/tracker` with a slide-in drawer for notes, dates, and reminders, backed by a full `/applications` REST API and a 15-minute notification worker.

**Architecture:** New `api/src/routes/applications.ts` router handles CRUD for applications, notes, and reminders; registered in `routes/index.ts`. A `notificationWorker.ts` cron job creates in-app notifications from due reminders. The `/tracker` page is a Server Component that fetches all non-dismissed applications; `KanbanBoard` is a `'use client'` component with `@hello-pangea/dnd` and optimistic updates. All mutations use `apiFetch`; score display reuses `ScoreRing` from Plan 4.

**Tech Stack:** Express · Zod · Supabase (supabaseAdmin) · node-cron · Next.js 14 App Router · React 18 · @hello-pangea/dnd · Tailwind CSS · Lucide React

---

## File Map

```
supabase/migrations/005_tracker_rls.sql       — RLS policies for job_applications, notes, reminders

api/src/routes/applications.ts                — all applications + notes + reminders routes
api/src/workers/notificationWorker.ts         — 15-min cron: fire due reminders → notifications
api/src/routes/index.ts                       — register applicationsRouter (modify)
api/src/index.ts                              — start notificationWorker on boot (modify)

api/tests/applications.test.ts               — supertest tests for all applications routes
api/tests/notificationWorker.test.ts         — unit tests for processReminders()

web/app/(app)/tracker/page.tsx               — Server Component: fetch apps, render KanbanBoard
web/components/tracker/KanbanBoard.tsx       — 'use client': DragDropContext, columns state, drawer state
web/components/tracker/KanbanColumn.tsx      — Droppable column with header + count badge
web/components/tracker/TrackerCard.tsx       — Draggable card: avatar, title, score ring, dates
web/components/tracker/DrawerPanel.tsx       — 'use client': fixed slide-in panel, Escape/backdrop close
web/components/tracker/AppDateFields.tsx     — applied_at, interview_date, follow_up_date, offer_amount
web/components/tracker/NotesPanel.tsx        — notes list + add-note form
web/components/tracker/ReminderForm.tsx      — reminders list + add-reminder form
```

---

### Task 1: DB migration — RLS policies for tracker tables

**Files:**
- Create: `supabase/migrations/005_tracker_rls.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/005_tracker_rls.sql

-- job_applications
alter table job_applications enable row level security;

create policy "job_applications: users manage own"
  on job_applications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- notes (access derived via job_application owner)
alter table notes enable row level security;

create policy "notes: users manage own"
  on notes for all
  using (
    auth.uid() = (
      select user_id from job_applications
      where id = notes.job_application_id
    )
  );

-- reminders (access derived via job_application owner)
alter table reminders enable row level security;

create policy "reminders: users manage own"
  on reminders for all
  using (
    auth.uid() = (
      select user_id from job_applications
      where id = reminders.job_application_id
    )
  );

-- notifications (worker inserts via service role key; users read own)
alter table notifications enable row level security;

create policy "notifications: users read own"
  on notifications for select
  using (auth.uid() = user_id);

create policy "notifications: service role insert"
  on notifications for insert
  with check (true);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/005_tracker_rls.sql
git commit -m "feat: add RLS policies for tracker tables"
```

---

### Task 2: Applications CRUD API

**Files:**
- Create: `api/src/routes/applications.ts`
- Create: `api/tests/applications.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// api/tests/applications.test.ts
import request from 'supertest'
import { createApp } from '../src/app'
import { supabaseAdmin } from '../src/config/supabase'

jest.mock('../src/config/supabase', () => ({
  supabaseAdmin: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}))

const mockSbFrom = supabaseAdmin.from as jest.Mock
const mockGetUser = supabaseAdmin.auth.getUser as jest.Mock

function makeChain(result: { data: unknown; error: unknown; count?: number | null }) {
  const t: any = {}
  ;['select', 'eq', 'neq', 'gte', 'lte', 'not', 'limit', 'update', 'upsert',
    'insert', 'delete', 'order', 'in'].forEach((m) => { t[m] = jest.fn(() => t) })
  t.single = jest.fn(() => Promise.resolve(result))
  t.range = jest.fn(() => Promise.resolve(result))
  t.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return t
}

function authAs(userId: string) {
  mockGetUser.mockResolvedValueOnce({
    data: { user: { id: userId, email: 'test@example.com' } },
    error: null,
  })
}

let app: ReturnType<typeof createApp>
beforeAll(() => { app = createApp() })

describe('GET /api/v1/applications', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/applications')
    expect(res.status).toBe(401)
  })

  it('returns 200 with applications array', async () => {
    authAs('user-1')
    // First mock: job_applications query
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: [{
          id: 'app-1', user_id: 'user-1', job_id: 'job-1',
          status: 'applied', applied_at: null, interview_date: null,
          follow_up_date: null, offer_amount: null,
          created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z',
          jobs: { id: 'job-1', title: 'SWE', company: 'Acme', location: 'NYC',
                  is_remote: false, salary_min: 120000, salary_max: 150000, apply_url: null },
        }],
        error: null,
      })
    )
    // Second mock: job_matches query
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: [{ job_id: 'job-1', match_score: 82, match_label: 'excellent',
                 refined_score: 85, ai_refined: true }],
        error: null,
      })
    )

    const res = await request(app)
      .get('/api/v1/applications')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].status).toBe('applied')
    expect(res.body.data[0].jobs.title).toBe('SWE')
    expect(res.body.data[0].match.match_score).toBe(82)
  })
})

describe('POST /api/v1/applications', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/applications').send({ job_id: 'j1', status: 'saved' })
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing job_id', async () => {
    authAs('user-1')
    const res = await request(app)
      .post('/api/v1/applications')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'saved' })
    expect(res.status).toBe(400)
  })

  it('returns 201 on successful upsert', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(
      makeChain({ data: { id: 'app-1', job_id: 'job-1', status: 'saved' }, error: null })
    )
    const res = await request(app)
      .post('/api/v1/applications')
      .set('Authorization', 'Bearer valid-token')
      .send({ job_id: 'job-1', status: 'saved' })
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('saved')
  })
})

describe('PUT /api/v1/applications/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).put('/api/v1/applications/app-1').send({ status: 'applied' })
    expect(res.status).toBe(401)
  })

  it('returns 404 when application not found', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(makeChain({ data: null, error: { message: 'No rows' } }))
    const res = await request(app)
      .put('/api/v1/applications/nonexistent')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'applied' })
    expect(res.status).toBe(404)
  })

  it('returns 200 with updated application', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(
      makeChain({ data: { id: 'app-1', status: 'applied' }, error: null })
    )
    const res = await request(app)
      .put('/api/v1/applications/app-1')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'applied' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('applied')
  })
})

describe('DELETE /api/v1/applications/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).delete('/api/v1/applications/app-1')
    expect(res.status).toBe(401)
  })

  it('returns 204 on successful delete', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(makeChain({ data: [{ id: 'app-1' }], error: null }))
    const res = await request(app)
      .delete('/api/v1/applications/app-1')
      .set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(204)
  })

  it('returns 404 when not found', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(makeChain({ data: [], error: null }))
    const res = await request(app)
      .delete('/api/v1/applications/nonexistent')
      .set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd api
npx jest tests/applications.test.ts --no-coverage
```

Expected: FAIL — `Cannot GET /api/v1/applications` (route not registered yet)

- [ ] **Step 3: Create the applications router with CRUD**

```typescript
// api/src/routes/applications.ts
import { Router } from 'express'
import { z } from 'zod'
import { verifyToken, AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { supabaseAdmin } from '../config/supabase'
import { success, failure } from '../types'

const router = Router()

const APP_STATUS = ['saved', 'dismissed', 'applied', 'interviewing', 'offer', 'rejected'] as const
type AppStatus = typeof APP_STATUS[number]

const createAppSchema = z.object({
  job_id: z.string().uuid(),
  status: z.enum(APP_STATUS).default('saved'),
})

const updateAppSchema = z.object({
  status: z.enum(APP_STATUS).optional(),
  applied_at: z.string().datetime({ offset: true }).nullable().optional(),
  interview_date: z.string().datetime({ offset: true }).nullable().optional(),
  follow_up_date: z.string().datetime({ offset: true }).nullable().optional(),
  offer_amount: z.number().int().nullable().optional(),
})

// GET /applications — all non-dismissed apps with job details + match scores
router.get('/', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest

  const { data: apps, error: appsError } = await supabaseAdmin
    .from('job_applications')
    .select(
      `id, user_id, job_id, status, applied_at, interview_date, follow_up_date,
       offer_amount, created_at, updated_at,
       jobs!inner(id, title, company, location, is_remote, salary_min, salary_max, apply_url)`
    )
    .eq('user_id', userId)
    .neq('status', 'dismissed')
    .order('updated_at', { ascending: false })

  if (appsError) {
    res.status(500).json(failure('Failed to fetch applications'))
    return
  }

  const appsData = (apps ?? []) as any[]
  const jobIds = appsData.map((a) => a.job_id)

  let matchMap = new Map<string, any>()
  if (jobIds.length > 0) {
    const { data: matches } = await supabaseAdmin
      .from('job_matches')
      .select('job_id, match_score, match_label, refined_score, ai_refined')
      .eq('user_id', userId)
      .in('job_id', jobIds)
    for (const m of matches ?? []) matchMap.set(m.job_id, m)
  }

  const result = appsData.map((a) => ({
    ...a,
    match: matchMap.get(a.job_id) ?? null,
  }))

  res.json(success(result))
})

// POST /applications — upsert application record
router.post('/', verifyToken, validate(createAppSchema), async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('job_applications')
    .upsert(
      { user_id: userId, ...req.body, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,job_id' }
    )
    .select()
    .single()

  if (error) {
    res.status(500).json(failure('Failed to create application'))
    return
  }
  res.status(201).json(success(data))
})

// PUT /applications/:id — update status / date fields
router.put('/:id', verifyToken, validate(updateAppSchema), async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('job_applications')
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error || !data) {
    res.status(404).json(failure('Application not found'))
    return
  }
  res.json(success(data))
})

// DELETE /applications/:id
router.delete('/:id', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('job_applications')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()

  if (error) {
    res.status(500).json(failure('Failed to delete application'))
    return
  }
  if (!data || (data as any[]).length === 0) {
    res.status(404).json(failure('Application not found'))
    return
  }
  res.status(204).send()
})

export default router
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd api
npx jest tests/applications.test.ts --no-coverage
```

Expected: PASS — all 10 tests green

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/applications.ts api/tests/applications.test.ts
git commit -m "feat: add applications CRUD routes and tests"
```

---

### Task 3: Notes API routes

**Files:**
- Modify: `api/src/routes/applications.ts` (append notes routes)
- Modify: `api/tests/applications.test.ts` (append notes tests)

- [ ] **Step 1: Append failing notes tests to `api/tests/applications.test.ts`**

Add these `describe` blocks at the end of the file (before the closing):

```typescript
describe('GET /api/v1/applications/:id/notes', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/applications/app-1/notes')
    expect(res.status).toBe(401)
  })

  it('returns 200 with notes array', async () => {
    authAs('user-1')
    // First mock: ownership check
    mockSbFrom.mockReturnValueOnce(
      makeChain({ data: { id: 'app-1', user_id: 'user-1' }, error: null })
    )
    // Second mock: notes query
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: [{ id: 'note-1', content: 'Great interview', created_at: '2026-05-01T00:00:00Z' }],
        error: null,
      })
    )
    const res = await request(app)
      .get('/api/v1/applications/app-1/notes')
      .set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].content).toBe('Great interview')
  })
})

describe('POST /api/v1/applications/:id/notes', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/applications/app-1/notes').send({ content: 'hi' })
    expect(res.status).toBe(401)
  })

  it('returns 400 for empty content', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(makeChain({ data: { id: 'app-1', user_id: 'user-1' }, error: null }))
    const res = await request(app)
      .post('/api/v1/applications/app-1/notes')
      .set('Authorization', 'Bearer valid-token')
      .send({ content: '' })
    expect(res.status).toBe(400)
  })

  it('returns 201 with created note', async () => {
    authAs('user-1')
    // Ownership check
    mockSbFrom.mockReturnValueOnce(makeChain({ data: { id: 'app-1', user_id: 'user-1' }, error: null }))
    // Insert note
    mockSbFrom.mockReturnValueOnce(
      makeChain({ data: { id: 'note-1', content: 'Prep system design', created_at: '2026-05-01T00:00:00Z' }, error: null })
    )
    const res = await request(app)
      .post('/api/v1/applications/app-1/notes')
      .set('Authorization', 'Bearer valid-token')
      .send({ content: 'Prep system design' })
    expect(res.status).toBe(201)
    expect(res.body.data.content).toBe('Prep system design')
  })
})

describe('DELETE /api/v1/notes/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).delete('/api/v1/notes/note-1')
    expect(res.status).toBe(401)
  })

  it('returns 204 on success', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(makeChain({ data: [{ id: 'note-1' }], error: null }))
    const res = await request(app)
      .delete('/api/v1/notes/note-1')
      .set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run tests — verify notes tests fail**

```bash
cd api
npx jest tests/applications.test.ts --no-coverage
```

Expected: notes tests FAIL (`Cannot GET /api/v1/applications/app-1/notes`)

- [ ] **Step 3: Append notes routes to `api/src/routes/applications.ts`**

Add after the `DELETE /applications/:id` route and before `export default router`:

```typescript
const noteSchema = z.object({ content: z.string().min(1) })

// Ownership guard helper
async function ownsApplication(applicationId: string, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('job_applications')
    .select('id')
    .eq('id', applicationId)
    .eq('user_id', userId)
    .single()
  return !!data
}

// GET /applications/:id/notes
router.get('/:id/notes', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  if (!(await ownsApplication(req.params.id, userId))) {
    res.status(404).json(failure('Application not found'))
    return
  }

  const { data, error } = await supabaseAdmin
    .from('notes')
    .select('id, content, created_at, updated_at')
    .eq('job_application_id', req.params.id)
    .order('created_at', { ascending: true })

  if (error) {
    res.status(500).json(failure('Failed to fetch notes'))
    return
  }
  res.json(success(data))
})

// POST /applications/:id/notes
router.post('/:id/notes', verifyToken, validate(noteSchema), async (req, res) => {
  const { userId } = req as AuthRequest
  if (!(await ownsApplication(req.params.id, userId))) {
    res.status(404).json(failure('Application not found'))
    return
  }

  const { data, error } = await supabaseAdmin
    .from('notes')
    .insert({
      user_id: userId,
      job_application_id: req.params.id,
      content: req.body.content,
    })
    .select()
    .single()

  if (error) {
    res.status(500).json(failure('Failed to create note'))
    return
  }
  res.status(201).json(success(data))
})

// DELETE /notes/:noteId  (flat path for simplicity)
router.delete('/notes/:noteId', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('notes')
    .delete()
    .eq('id', req.params.noteId)
    .eq('user_id', userId)
    .select()

  if (error) {
    res.status(500).json(failure('Failed to delete note'))
    return
  }
  if (!data || (data as any[]).length === 0) {
    res.status(404).json(failure('Note not found'))
    return
  }
  res.status(204).send()
})
```

**Note on routing:** `DELETE /notes/:noteId` is mounted at `/api/v1/applications` so the full path becomes `/api/v1/applications/notes/:noteId`. The test and frontend must use this path. Update the `DELETE /api/v1/notes/:id` test's path to `/api/v1/applications/notes/note-1`.

- [ ] **Step 4: Update the test path for DELETE notes**

In `api/tests/applications.test.ts`, find:
```typescript
    const res = await request(app)
      .delete('/api/v1/notes/note-1')
      .set('Authorization', 'Bearer valid-token')
```
Change to:
```typescript
    const res = await request(app)
      .delete('/api/v1/applications/notes/note-1')
      .set('Authorization', 'Bearer valid-token')
```
And update the 401 test similarly:
```typescript
    const res = await request(app).delete('/api/v1/applications/notes/note-1')
```

- [ ] **Step 5: Run tests — verify all pass**

```bash
cd api
npx jest tests/applications.test.ts --no-coverage
```

Expected: PASS — all tests including notes tests green

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/applications.ts api/tests/applications.test.ts
git commit -m "feat: add notes routes to applications router"
```

---

### Task 4: Reminders API routes

**Files:**
- Modify: `api/src/routes/applications.ts` (append reminders routes)
- Modify: `api/tests/applications.test.ts` (append reminders tests)

- [ ] **Step 1: Append failing reminders tests to `api/tests/applications.test.ts`**

```typescript
describe('GET /api/v1/applications/reminders', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/applications/reminders?application_id=app-1')
    expect(res.status).toBe(401)
  })

  it('returns 200 with reminders array', async () => {
    authAs('user-1')
    // Ownership check
    mockSbFrom.mockReturnValueOnce(makeChain({ data: { id: 'app-1' }, error: null }))
    // Reminders query
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: [{
          id: 'rem-1', reminder_type: 'interview',
          remind_at: '2026-05-05T14:00:00Z', message: 'Prep system design', is_sent: false,
        }],
        error: null,
      })
    )
    const res = await request(app)
      .get('/api/v1/applications/reminders?application_id=app-1')
      .set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].reminder_type).toBe('interview')
  })
})

describe('POST /api/v1/applications/reminders', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/applications/reminders')
      .send({ job_application_id: 'app-1', reminder_type: 'interview', remind_at: '2026-05-05T14:00:00Z' })
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing remind_at', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(makeChain({ data: { id: 'app-1' }, error: null }))
    const res = await request(app)
      .post('/api/v1/applications/reminders')
      .set('Authorization', 'Bearer valid-token')
      .send({ job_application_id: 'app-1', reminder_type: 'interview' })
    expect(res.status).toBe(400)
  })

  it('returns 201 with created reminder', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(makeChain({ data: { id: 'app-1' }, error: null }))
    mockSbFrom.mockReturnValueOnce(
      makeChain({
        data: { id: 'rem-1', reminder_type: 'interview', remind_at: '2026-05-05T14:00:00Z', is_sent: false },
        error: null,
      })
    )
    const res = await request(app)
      .post('/api/v1/applications/reminders')
      .set('Authorization', 'Bearer valid-token')
      .send({ job_application_id: 'app-1', reminder_type: 'interview', remind_at: '2026-05-05T14:00:00Z', message: 'Prep' })
    expect(res.status).toBe(201)
    expect(res.body.data.reminder_type).toBe('interview')
  })
})

describe('DELETE /api/v1/applications/reminders/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).delete('/api/v1/applications/reminders/rem-1')
    expect(res.status).toBe(401)
  })

  it('returns 204 on success', async () => {
    authAs('user-1')
    mockSbFrom.mockReturnValueOnce(makeChain({ data: [{ id: 'rem-1' }], error: null }))
    const res = await request(app)
      .delete('/api/v1/applications/reminders/rem-1')
      .set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run tests — verify reminders tests fail**

```bash
cd api
npx jest tests/applications.test.ts --no-coverage
```

Expected: reminders tests FAIL (routes not yet added)

- [ ] **Step 3: Append reminders routes to `api/src/routes/applications.ts`**

Add after the notes routes, before `export default router`:

```typescript
const REMINDER_TYPES = ['interview', 'followup', 'deadline', 'custom'] as const

const createReminderSchema = z.object({
  job_application_id: z.string().uuid(),
  reminder_type: z.enum(REMINDER_TYPES),
  remind_at: z.string().datetime({ offset: true }),
  message: z.string().optional(),
})

const updateReminderSchema = z.object({
  remind_at: z.string().datetime({ offset: true }).optional(),
  message: z.string().optional(),
})

// GET /reminders?application_id=:id
router.get('/reminders', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const applicationId = req.query.application_id as string | undefined

  if (!applicationId) {
    res.status(400).json(failure('application_id query param required'))
    return
  }

  if (!(await ownsApplication(applicationId, userId))) {
    res.status(404).json(failure('Application not found'))
    return
  }

  const { data, error } = await supabaseAdmin
    .from('reminders')
    .select('id, reminder_type, remind_at, message, is_sent, created_at')
    .eq('job_application_id', applicationId)
    .order('remind_at', { ascending: true })

  if (error) {
    res.status(500).json(failure('Failed to fetch reminders'))
    return
  }
  res.json(success(data))
})

// POST /reminders
router.post('/reminders', verifyToken, validate(createReminderSchema), async (req, res) => {
  const { userId } = req as AuthRequest
  if (!(await ownsApplication(req.body.job_application_id, userId))) {
    res.status(404).json(failure('Application not found'))
    return
  }

  const { data, error } = await supabaseAdmin
    .from('reminders')
    .insert({ user_id: userId, ...req.body })
    .select()
    .single()

  if (error) {
    res.status(500).json(failure('Failed to create reminder'))
    return
  }
  res.status(201).json(success(data))
})

// PUT /reminders/:id
router.put('/reminders/:reminderId', verifyToken, validate(updateReminderSchema), async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('reminders')
    .update(req.body)
    .eq('id', req.params.reminderId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error || !data) {
    res.status(404).json(failure('Reminder not found'))
    return
  }
  res.json(success(data))
})

// DELETE /reminders/:id
router.delete('/reminders/:reminderId', verifyToken, async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('reminders')
    .delete()
    .eq('id', req.params.reminderId)
    .eq('user_id', userId)
    .select()

  if (error) {
    res.status(500).json(failure('Failed to delete reminder'))
    return
  }
  if (!data || (data as any[]).length === 0) {
    res.status(404).json(failure('Reminder not found'))
    return
  }
  res.status(204).send()
})
```

- [ ] **Step 4: Run full test suite — verify all pass**

```bash
cd api
npx jest tests/applications.test.ts --no-coverage
```

Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/applications.ts api/tests/applications.test.ts
git commit -m "feat: add reminders routes to applications router"
```

---

### Task 5: Register router + notification worker

**Files:**
- Modify: `api/src/routes/index.ts`
- Create: `api/src/workers/notificationWorker.ts`
- Create: `api/tests/notificationWorker.test.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: Register the applications router**

Edit `api/src/routes/index.ts`:

```typescript
import { Router } from 'express'
import healthRouter from './health'
import profileRouter from './profile'
import skillsRouter from './skills'
import resumeRouter from './resume'
import jobsRouter from './jobs'
import applicationsRouter from './applications'

const router = Router()

router.use('/health', healthRouter)
router.use('/profile', profileRouter)
router.use('/skills', skillsRouter)
router.use('/resume', resumeRouter)
router.use('/jobs', jobsRouter)
router.use('/applications', applicationsRouter)

export default router
```

- [ ] **Step 2: Write the failing notification worker test**

```typescript
// api/tests/notificationWorker.test.ts
import { supabaseAdmin } from '../src/config/supabase'
import { processReminders } from '../src/workers/notificationWorker'

jest.mock('../src/config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}))

const mockSbFrom = supabaseAdmin.from as jest.Mock

function makeChain(result: { data: unknown; error: unknown }) {
  const t: any = {}
  ;['select', 'eq', 'neq', 'gte', 'lte', 'update', 'insert', 'in', 'order', 'limit'].forEach(
    (m) => { t[m] = jest.fn(() => t) }
  )
  t.single = jest.fn(() => Promise.resolve(result))
  t.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return t
}

describe('processReminders', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('does nothing when no reminders are due', async () => {
    mockSbFrom.mockReturnValueOnce(makeChain({ data: [], error: null }))
    await processReminders()
    expect(mockSbFrom).toHaveBeenCalledTimes(1)
  })

  it('creates notifications and marks reminders sent', async () => {
    const reminder = {
      id: 'rem-1',
      user_id: 'user-1',
      reminder_type: 'interview',
      message: 'Prep now',
      job_applications: {
        jobs: { title: 'SWE', id: 'job-1' },
        id: 'app-1',
      },
    }
    // First call: fetch due reminders
    mockSbFrom.mockReturnValueOnce(makeChain({ data: [reminder], error: null }))
    // Second call: insert notifications
    mockSbFrom.mockReturnValueOnce(makeChain({ data: null, error: null }))
    // Third call: mark is_sent = true
    mockSbFrom.mockReturnValueOnce(makeChain({ data: null, error: null }))

    await processReminders()

    expect(mockSbFrom).toHaveBeenCalledTimes(3)
    const insertCall = mockSbFrom.mock.calls[1][0]
    expect(insertCall).toBe('notifications')
  })

  it('maps reminder_type to notification_type correctly', async () => {
    const cases: Array<{ input: string; expected: string }> = [
      { input: 'interview', expected: 'interview_reminder' },
      { input: 'followup', expected: 'followup' },
      { input: 'deadline', expected: 'system' },
      { input: 'custom', expected: 'system' },
    ]

    for (const { input, expected } of cases) {
      const reminder = {
        id: `rem-${input}`, user_id: 'u1', reminder_type: input, message: null,
        job_applications: { jobs: { title: 'SWE', id: 'job-1' }, id: 'app-1' },
      }
      mockSbFrom.mockReturnValueOnce(makeChain({ data: [reminder], error: null }))
      mockSbFrom.mockReturnValueOnce(makeChain({ data: null, error: null }))
      mockSbFrom.mockReturnValueOnce(makeChain({ data: null, error: null }))

      // Capture the insert payload
      let insertedData: any = null
      const origFrom = mockSbFrom.getMockImplementation()
      const insertChain = makeChain({ data: null, error: null })
      insertChain.insert = jest.fn((payload: any) => {
        insertedData = payload
        return insertChain
      })
      mockSbFrom.mockReset()
      mockSbFrom.mockReturnValueOnce(makeChain({ data: [reminder], error: null }))
      mockSbFrom.mockReturnValueOnce(insertChain)
      mockSbFrom.mockReturnValueOnce(makeChain({ data: null, error: null }))

      await processReminders()

      const row = Array.isArray(insertedData) ? insertedData[0] : insertedData
      expect(row?.type).toBe(expected)
    }
  })
})
```

- [ ] **Step 3: Run the test — verify it fails**

```bash
cd api
npx jest tests/notificationWorker.test.ts --no-coverage
```

Expected: FAIL — `processReminders is not a function`

- [ ] **Step 4: Create the notification worker**

```typescript
// api/src/workers/notificationWorker.ts
import cron from 'node-cron'
import { supabaseAdmin } from '../config/supabase'

type ReminderType = 'interview' | 'followup' | 'deadline' | 'custom'
type NotificationType = 'interview_reminder' | 'followup' | 'system'

function mapReminderType(t: ReminderType): NotificationType {
  if (t === 'interview') return 'interview_reminder'
  if (t === 'followup') return 'followup'
  return 'system'
}

export async function processReminders(): Promise<void> {
  const { data: reminders, error } = await supabaseAdmin
    .from('reminders')
    .select(
      `id, user_id, reminder_type, message,
       job_applications!inner(id, jobs!inner(id, title))`
    )
    .lte('remind_at', new Date().toISOString())
    .eq('is_sent', false)
    .order('remind_at', { ascending: true })
    .limit(50)

  if (error) {
    console.error('[notificationWorker] Failed to fetch reminders:', error)
    return
  }

  const rows = (reminders ?? []) as any[]
  if (rows.length === 0) return

  const notifications = rows.map((r) => ({
    user_id: r.user_id,
    type: mapReminderType(r.reminder_type as ReminderType),
    title: r.job_applications.jobs.title,
    message: r.message ?? '',
    metadata: {
      job_id: r.job_applications.jobs.id,
      application_id: r.job_applications.id,
    },
  }))

  const { error: insertError } = await supabaseAdmin
    .from('notifications')
    .insert(notifications)

  if (insertError) {
    console.error('[notificationWorker] Failed to insert notifications:', insertError)
    return
  }

  const ids = rows.map((r) => r.id)
  await supabaseAdmin
    .from('reminders')
    .update({ is_sent: true })
    .in('id', ids)

  console.log(`[notificationWorker] Processed ${rows.length} reminders`)
}

let workerTask: ReturnType<typeof cron.schedule> | null = null

export function startNotificationWorker(): void {
  if (workerTask) return
  workerTask = cron.schedule('*/15 * * * *', () => {
    processReminders().catch(console.error)
  })
  console.log('[notificationWorker] Reminder worker scheduled (every 15 min)')
}

export function stopNotificationWorker(): void {
  workerTask?.stop()
  workerTask = null
}
```

- [ ] **Step 5: Run the test — verify it passes**

```bash
cd api
npx jest tests/notificationWorker.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 6: Start the worker on boot — edit `api/src/index.ts`**

```typescript
import 'dotenv/config'
import { createApp } from './app'
import { env } from './config/env'
import { startScheduler } from './workers/scheduler'
import { startNotificationWorker } from './workers/notificationWorker'

const app = createApp()

const port = parseInt(env.PORT, 10)
app.listen(port, () => {
  console.log(`🚀 API running on port ${port} [${env.NODE_ENV}]`)
  if (env.NODE_ENV !== 'test') {
    startScheduler()
    startNotificationWorker()
  }
})
```

- [ ] **Step 7: Run full API test suite to confirm nothing broke**

```bash
cd api
npx jest --no-coverage
```

Expected: all existing tests pass

- [ ] **Step 8: Commit**

```bash
git add api/src/routes/index.ts api/src/index.ts \
        api/src/workers/notificationWorker.ts \
        api/tests/notificationWorker.test.ts
git commit -m "feat: register applications router and add notification worker"
```

---

### Task 6: Install @hello-pangea/dnd + tracker page

**Files:**
- Modify: `web/package.json` (add `@hello-pangea/dnd`)
- Create: `web/app/(app)/tracker/page.tsx`

- [ ] **Step 1: Install the dependency**

```bash
cd web
npm install @hello-pangea/dnd
```

Expected: `@hello-pangea/dnd` appears in `web/package.json` dependencies

- [ ] **Step 2: Create the tracker page**

```typescript
// web/app/(app)/tracker/page.tsx
import { serverFetch } from '@/lib/api'
import { KanbanBoard } from '@/components/tracker/KanbanBoard'

export interface TrackerJob {
  id: string
  title: string
  company: string
  location: string | null
  is_remote: boolean
  salary_min: number | null
  salary_max: number | null
  apply_url: string | null
}

export interface TrackerMatch {
  match_score: number
  match_label: string
  refined_score: number | null
  ai_refined: boolean
}

export interface TrackerApplication {
  id: string
  user_id: string
  job_id: string
  status: 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected'
  applied_at: string | null
  interview_date: string | null
  follow_up_date: string | null
  offer_amount: number | null
  created_at: string
  updated_at: string
  jobs: TrackerJob
  match: TrackerMatch | null
}

export default async function TrackerPage() {
  let applications: TrackerApplication[] = []

  try {
    applications = await serverFetch<TrackerApplication[]>('/applications')
  } catch {
    // render board with empty state on error
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="font-mono text-lg font-bold tracking-wide"
            style={{ color: '#e2e8f0' }}
          >
            TRACKER
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
            {applications.length} active application{applications.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <KanbanBoard initialApplications={applications} />
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd web
npx tsc --noEmit
```

Expected: errors only about missing `KanbanBoard` — that's expected, we build it next

- [ ] **Step 4: Commit**

```bash
cd ..
git add web/package.json web/package-lock.json web/app/\(app\)/tracker/page.tsx
git commit -m "feat: add tracker page and install @hello-pangea/dnd"
```

---

### Task 7: KanbanBoard + KanbanColumn

**Files:**
- Create: `web/components/tracker/KanbanBoard.tsx`
- Create: `web/components/tracker/KanbanColumn.tsx`

- [ ] **Step 1: Create KanbanColumn**

```typescript
// web/components/tracker/KanbanColumn.tsx
import { Droppable } from '@hello-pangea/dnd'
import type { TrackerApplication } from '@/app/(app)/tracker/page'
import { TrackerCard } from './TrackerCard'

export type KanbanStatus = 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected'

const COLUMN_CONFIG: Record<KanbanStatus, { label: string; color: string; countBg: string; countColor: string }> = {
  saved:        { label: 'SAVED',        color: 'rgba(139,92,246,0.35)', countBg: 'rgba(139,92,246,0.15)', countColor: '#a78bfa' },
  applied:      { label: 'APPLIED',      color: 'rgba(59,130,246,0.35)', countBg: 'rgba(59,130,246,0.1)', countColor: '#60a5fa' },
  interviewing: { label: 'INTERVIEWING', color: 'rgba(251,191,36,0.35)', countBg: 'rgba(251,191,36,0.1)', countColor: '#fbbf24' },
  offer:        { label: 'OFFER',        color: 'rgba(52,211,153,0.35)', countBg: 'rgba(52,211,153,0.1)', countColor: '#34d399' },
  rejected:     { label: 'REJECTED',     color: 'rgba(248,113,113,0.35)', countBg: 'rgba(248,113,113,0.1)', countColor: '#f87171' },
}

interface KanbanColumnProps {
  status: KanbanStatus
  applications: TrackerApplication[]
  onCardClick: (app: TrackerApplication) => void
  selectedId: string | null
}

export function KanbanColumn({ status, applications, onCardClick, selectedId }: KanbanColumnProps) {
  const cfg = COLUMN_CONFIG[status]

  return (
    <div
      className="flex flex-col flex-shrink-0 rounded-xl"
      style={{
        width: 220,
        background: '#0f0c1a',
        border: `1px solid ${cfg.color}`,
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ borderBottom: `1px solid rgba(139,92,246,0.1)` }}
      >
        <span
          className="font-mono text-xs font-semibold tracking-widest"
          style={{ color: cfg.countColor }}
        >
          {cfg.label}
        </span>
        <span
          className="text-xs font-mono rounded-full px-2 py-0.5"
          style={{ background: cfg.countBg, color: cfg.countColor }}
        >
          {applications.length}
        </span>
      </div>

      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex flex-col gap-2 p-2 flex-1 min-h-16 overflow-y-auto"
            style={{
              background: snapshot.isDraggingOver ? 'rgba(139,92,246,0.04)' : 'transparent',
              transition: 'background 150ms ease',
              maxHeight: 'calc(100vh - 200px)',
            }}
          >
            {applications.map((app, index) => (
              <TrackerCard
                key={app.id}
                application={app}
                index={index}
                isSelected={app.id === selectedId}
                onClick={() => onCardClick(app)}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}
```

- [ ] **Step 2: Create KanbanBoard**

```typescript
// web/components/tracker/KanbanBoard.tsx
'use client'

import { useState, useCallback } from 'react'
import { DragDropContext, DropResult } from '@hello-pangea/dnd'
import type { TrackerApplication } from '@/app/(app)/tracker/page'
import { apiFetch } from '@/lib/api'
import { KanbanColumn, KanbanStatus } from './KanbanColumn'
import { DrawerPanel } from './DrawerPanel'

const KANBAN_STATUSES: KanbanStatus[] = ['saved', 'applied', 'interviewing', 'offer', 'rejected']

type Columns = Record<KanbanStatus, TrackerApplication[]>

function buildColumns(apps: TrackerApplication[]): Columns {
  const cols: Columns = { saved: [], applied: [], interviewing: [], offer: [], rejected: [] }
  for (const app of apps) {
    if (app.status in cols) cols[app.status as KanbanStatus].push(app)
  }
  return cols
}

interface KanbanBoardProps {
  initialApplications: TrackerApplication[]
}

export function KanbanBoard({ initialApplications }: KanbanBoardProps) {
  const [columns, setColumns] = useState<Columns>(() => buildColumns(initialApplications))
  const [selectedApp, setSelectedApp] = useState<TrackerApplication | null>(null)

  const onDragEnd = useCallback(async (result: DropResult) => {
    const { draggableId, source, destination } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const fromStatus = source.droppableId as KanbanStatus
    const toStatus = destination.droppableId as KanbanStatus

    // Snapshot for rollback
    const snapshot = { ...columns, [fromStatus]: [...columns[fromStatus]], [toStatus]: [...columns[toStatus]] }

    // Optimistic update
    setColumns((prev) => {
      const fromCol = [...prev[fromStatus]]
      const toCol = fromStatus === toStatus ? fromCol : [...prev[toStatus]]
      const [moved] = fromCol.splice(source.index, 1)
      const updatedCard = { ...moved, status: toStatus }
      toCol.splice(destination.index, 0, updatedCard)
      if (fromStatus === toStatus) return { ...prev, [fromStatus]: toCol }
      return { ...prev, [fromStatus]: fromCol, [toStatus]: toCol }
    })

    // If the moved card is the selected one, update it in drawer too
    if (selectedApp?.id === draggableId) {
      setSelectedApp((prev) => prev ? { ...prev, status: toStatus } : null)
    }

    try {
      await apiFetch(`/applications/${draggableId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: toStatus }),
      })
    } catch {
      // Revert to snapshot
      setColumns(snapshot)
    }
  }, [columns, selectedApp])

  const handleCardClick = useCallback((app: TrackerApplication) => {
    setSelectedApp(app)
  }, [])

  const handleDrawerClose = useCallback(() => {
    setSelectedApp(null)
  }, [])

  const handleApplicationUpdate = useCallback((updated: Partial<TrackerApplication>) => {
    if (!selectedApp) return
    const merged = { ...selectedApp, ...updated }
    setSelectedApp(merged)
    setColumns((prev) => {
      const status = merged.status as KanbanStatus
      return {
        ...prev,
        [status]: prev[status].map((a) => a.id === merged.id ? merged : a),
      }
    })
  }, [selectedApp])

  return (
    <div className="flex gap-3 flex-1 overflow-x-auto pb-4">
      <DragDropContext onDragEnd={onDragEnd}>
        {KANBAN_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            applications={columns[status]}
            onCardClick={handleCardClick}
            selectedId={selectedApp?.id ?? null}
          />
        ))}
      </DragDropContext>

      <DrawerPanel
        application={selectedApp}
        onClose={handleDrawerClose}
        onUpdate={handleApplicationUpdate}
      />
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd web
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: errors only about missing `TrackerCard` and `DrawerPanel` — expected, building next

- [ ] **Step 4: Commit**

```bash
cd ..
git add web/components/tracker/KanbanBoard.tsx web/components/tracker/KanbanColumn.tsx
git commit -m "feat: add KanbanBoard and KanbanColumn components"
```

---

### Task 8: TrackerCard

**Files:**
- Create: `web/components/tracker/TrackerCard.tsx`

- [ ] **Step 1: Create TrackerCard**

```typescript
// web/components/tracker/TrackerCard.tsx
import { Draggable } from '@hello-pangea/dnd'
import type { TrackerApplication } from '@/app/(app)/tracker/page'
import { ScoreRing } from '@/components/jobs/ScoreRing'

interface TrackerCardProps {
  application: TrackerApplication
  index: number
  isSelected: boolean
  onClick: () => void
}

function companyInitials(company: string): string {
  return company
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

const AVATAR_COLORS = [
  '#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706',
  '#dc2626', '#9333ea', '#0284c7',
]

function avatarColor(company: string): string {
  let hash = 0
  for (let i = 0; i < company.length; i++) hash = company.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function TrackerCard({ application, index, isSelected, onClick }: TrackerCardProps) {
  const { jobs, match } = application
  const initials = companyInitials(jobs.company)
  const bgColor = avatarColor(jobs.company)
  const score = match?.refined_score ?? match?.match_score ?? 0
  const label = match?.match_label ?? 'low'

  const interviewDate = application.interview_date
    ? new Date(application.interview_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <Draggable draggableId={application.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className="rounded-lg p-2.5 cursor-pointer transition-all duration-150"
          style={{
            background: isSelected ? '#1a1730' : '#13101f',
            border: isSelected
              ? '1px solid rgba(139,92,246,0.45)'
              : '1px solid rgba(139,92,246,0.12)',
            boxShadow: snapshot.isDragging ? '0 8px 24px rgba(0,0,0,0.4)' : 'none',
            opacity: snapshot.isDragging ? 0.9 : 1,
          }}
        >
          <div className="flex items-start gap-2">
            {/* Company avatar */}
            <div
              className="flex-shrink-0 rounded-md flex items-center justify-center font-mono font-bold text-white"
              style={{ width: 28, height: 28, background: bgColor, fontSize: 11 }}
            >
              {initials}
            </div>

            {/* Job info */}
            <div className="flex-1 min-w-0">
              <div
                className="text-xs font-medium leading-tight truncate"
                style={{ color: '#e2e8f0' }}
              >
                {jobs.title}
              </div>
              <div className="text-xs mt-0.5 truncate" style={{ color: '#6b7280' }}>
                {jobs.company}
                {jobs.is_remote && (
                  <span className="ml-1.5" style={{ color: '#34d399' }}>· Remote</span>
                )}
              </div>
            </div>

            {/* Score ring */}
            {match && (
              <ScoreRing score={score} label={label} size="sm" showLabel={false} />
            )}
          </div>

          {/* Interview date badge */}
          {interviewDate && (
            <div
              className="mt-2 text-xs font-mono rounded px-1.5 py-0.5 inline-flex items-center gap-1"
              style={{
                background: 'rgba(251,191,36,0.1)',
                border: '1px solid rgba(251,191,36,0.2)',
                color: '#fbbf24',
              }}
            >
              Interview {interviewDate}
            </div>
          )}
        </div>
      )}
    </Draggable>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd web
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: errors only about missing `DrawerPanel` — expected

- [ ] **Step 3: Commit**

```bash
cd ..
git add web/components/tracker/TrackerCard.tsx
git commit -m "feat: add TrackerCard draggable component"
```

---

### Task 9: DrawerPanel

**Files:**
- Create: `web/components/tracker/DrawerPanel.tsx`

- [ ] **Step 1: Create DrawerPanel**

```typescript
// web/components/tracker/DrawerPanel.tsx
'use client'

import { useEffect, useRef } from 'react'
import { X, ExternalLink } from 'lucide-react'
import type { TrackerApplication } from '@/app/(app)/tracker/page'
import { ScoreRing } from '@/components/jobs/ScoreRing'
import { AppDateFields } from './AppDateFields'
import { NotesPanel } from './NotesPanel'
import { ReminderForm } from './ReminderForm'

interface DrawerPanelProps {
  application: TrackerApplication | null
  onClose: () => void
  onUpdate: (updated: Partial<TrackerApplication>) => void
}

const STATUS_LABELS: Record<string, string> = {
  saved: 'Saved', applied: 'Applied', interviewing: 'Interviewing',
  offer: 'Offer', rejected: 'Rejected',
}

const STATUS_COLORS: Record<string, string> = {
  saved: '#a78bfa', applied: '#60a5fa', interviewing: '#fbbf24',
  offer: '#34d399', rejected: '#f87171',
}

export function DrawerPanel({ application, onClose, onUpdate }: DrawerPanelProps) {
  const isOpen = application !== null
  const drawerRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const score = application
    ? (application.match?.refined_score ?? application.match?.match_score ?? 0)
    : 0
  const label = application?.match?.match_label ?? 'low'
  const statusColor = application ? (STATUS_COLORS[application.status] ?? '#a78bfa') : '#a78bfa'

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 h-full z-50 flex flex-col overflow-hidden"
        style={{
          width: 320,
          background: '#0f0c1a',
          borderLeft: '1px solid rgba(139,92,246,0.2)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 200ms ease-out',
        }}
      >
        {application && (
          <>
            {/* Header */}
            <div
              className="flex items-start justify-between p-4"
              style={{ borderBottom: '1px solid rgba(139,92,246,0.12)' }}
            >
              <div className="flex-1 min-w-0 mr-3">
                <div
                  className="font-semibold text-sm leading-tight truncate"
                  style={{ color: '#e2e8f0' }}
                >
                  {application.jobs.title}
                </div>
                <div className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                  {application.jobs.company}
                  {application.jobs.location ? ` · ${application.jobs.location}` : ''}
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {application.match && (
                    <ScoreRing score={score} label={label} size="sm" showLabel={true} />
                  )}
                  <span
                    className="text-xs font-mono rounded px-2 py-0.5"
                    style={{
                      background: `${statusColor}18`,
                      border: `1px solid ${statusColor}40`,
                      color: statusColor,
                    }}
                  >
                    {STATUS_LABELS[application.status] ?? application.status}
                  </span>
                  {application.jobs.apply_url && (
                    <a
                      href={application.jobs.apply_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs"
                      style={{ color: '#8b5cf6' }}
                    >
                      Apply <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 rounded-lg p-1 transition-colors"
                style={{ color: '#4b5563' }}
                aria-label="Close drawer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              <AppDateFields application={application} onUpdate={onUpdate} />
              <div style={{ borderTop: '1px solid rgba(139,92,246,0.1)' }} />
              <ReminderForm applicationId={application.id} />
              <div style={{ borderTop: '1px solid rgba(139,92,246,0.1)' }} />
              <NotesPanel applicationId={application.id} />
            </div>
          </>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd web
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: errors only about missing `AppDateFields`, `NotesPanel`, `ReminderForm`

- [ ] **Step 3: Commit**

```bash
cd ..
git add web/components/tracker/DrawerPanel.tsx
git commit -m "feat: add DrawerPanel slide-in component"
```

---

### Task 10: AppDateFields

**Files:**
- Create: `web/components/tracker/AppDateFields.tsx`

- [ ] **Step 1: Create AppDateFields**

```typescript
// web/components/tracker/AppDateFields.tsx
'use client'

import { useState } from 'react'
import { apiFetch } from '@/lib/api'
import type { TrackerApplication } from '@/app/(app)/tracker/page'

interface AppDateFieldsProps {
  application: TrackerApplication
  onUpdate: (updated: Partial<TrackerApplication>) => void
}

interface DateField {
  key: keyof Pick<TrackerApplication, 'applied_at' | 'interview_date' | 'follow_up_date'>
  label: string
}

const DATE_FIELDS: DateField[] = [
  { key: 'applied_at', label: 'Applied' },
  { key: 'interview_date', label: 'Interview' },
  { key: 'follow_up_date', label: 'Follow-up' },
]

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  // datetime-local inputs want YYYY-MM-DDTHH:mm
  return iso.slice(0, 16)
}

function toIsoString(local: string): string | null {
  if (!local) return null
  return new Date(local).toISOString()
}

export function AppDateFields({ application, onUpdate }: AppDateFieldsProps) {
  const [saving, setSaving] = useState<string | null>(null)

  async function handleBlur(key: DateField['key'], value: string) {
    const isoValue = toIsoString(value)
    if (isoValue === application[key]) return
    setSaving(key)
    try {
      await apiFetch(`/applications/${application.id}`, {
        method: 'PUT',
        body: JSON.stringify({ [key]: isoValue }),
      })
      onUpdate({ [key]: isoValue })
    } catch {
      // silently ignore — field reverts to original on re-render
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="px-4 py-3">
      <div
        className="font-mono text-xs font-semibold tracking-widest mb-3"
        style={{ color: '#6b7280' }}
      >
        DATES
      </div>
      <div className="flex flex-col gap-2.5">
        {DATE_FIELDS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: '#94a3b8', width: 64 }}>
              {label}
            </span>
            <input
              type="datetime-local"
              defaultValue={toDatetimeLocal(application[key])}
              onBlur={(e) => handleBlur(key, e.target.value)}
              disabled={saving === key}
              className="flex-1 text-xs rounded-md px-2 py-1 outline-none transition-all duration-150"
              style={{
                background: '#13101f',
                border: '1px solid rgba(139,92,246,0.2)',
                color: saving === key ? '#4b5563' : '#e2e8f0',
                colorScheme: 'dark',
              }}
            />
          </div>
        ))}

        {/* Offer amount */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs flex-shrink-0" style={{ color: '#94a3b8', width: 64 }}>
            Offer $
          </span>
          <input
            type="number"
            defaultValue={application.offer_amount ?? ''}
            placeholder="amount"
            onBlur={async (e) => {
              const val = e.target.value ? parseInt(e.target.value, 10) : null
              if (val === application.offer_amount) return
              try {
                await apiFetch(`/applications/${application.id}`, {
                  method: 'PUT',
                  body: JSON.stringify({ offer_amount: val }),
                })
                onUpdate({ offer_amount: val })
              } catch {
                // silently ignore
              }
            }}
            className="flex-1 text-xs rounded-md px-2 py-1 outline-none"
            style={{
              background: '#13101f',
              border: '1px solid rgba(139,92,246,0.2)',
              color: '#e2e8f0',
            }}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd web
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: errors only about missing `NotesPanel`, `ReminderForm`

- [ ] **Step 3: Commit**

```bash
cd ..
git add web/components/tracker/AppDateFields.tsx
git commit -m "feat: add AppDateFields component"
```

---

### Task 11: NotesPanel

**Files:**
- Create: `web/components/tracker/NotesPanel.tsx`

- [ ] **Step 1: Create NotesPanel**

```typescript
// web/components/tracker/NotesPanel.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'

interface Note {
  id: string
  content: string
  created_at: string
}

interface NotesPanelProps {
  applicationId: string
}

export function NotesPanel({ applicationId }: NotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setLoading(true)
    apiFetch<Note[]>(`/applications/${applicationId}/notes`)
      .then(setNotes)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [applicationId])

  async function handleAdd() {
    const trimmed = content.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const note = await apiFetch<Note>(`/applications/${applicationId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content: trimmed }),
      })
      setNotes((prev) => [...prev, note])
      setContent('')
      textareaRef.current?.focus()
    } catch {
      // fail silently
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(noteId: string) {
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
    try {
      await apiFetch(`/applications/notes/${noteId}`, { method: 'DELETE' })
    } catch {
      // fail silently — note already removed from UI
    }
  }

  return (
    <div className="px-4 py-3">
      <div
        className="font-mono text-xs font-semibold tracking-widest mb-3"
        style={{ color: '#6b7280' }}
      >
        NOTES
      </div>

      {loading ? (
        <div className="text-xs" style={{ color: '#4b5563' }}>Loading…</div>
      ) : (
        <div className="flex flex-col gap-2 mb-3">
          {notes.length === 0 && (
            <div className="text-xs" style={{ color: '#4b5563' }}>No notes yet.</div>
          )}
          {notes.map((note) => (
            <div
              key={note.id}
              className="group relative rounded-lg px-3 py-2 text-xs"
              style={{
                background: '#13101f',
                border: '1px solid rgba(139,92,246,0.12)',
                color: '#94a3b8',
                lineHeight: 1.5,
              }}
            >
              {note.content}
              <button
                onClick={() => handleDelete(note.id)}
                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                style={{ color: '#4b5563' }}
                aria-label="Delete note"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add note */}
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd()
          }}
          placeholder="Add a note… (⌘↵ to save)"
          rows={2}
          disabled={saving}
          className="flex-1 text-xs rounded-lg px-2.5 py-2 outline-none resize-none"
          style={{
            background: '#13101f',
            border: '1px solid rgba(139,92,246,0.2)',
            color: '#e2e8f0',
          }}
        />
        <button
          onClick={handleAdd}
          disabled={saving || !content.trim()}
          className="text-xs font-mono rounded-lg px-3 py-2 transition-all duration-150"
          style={{
            background: saving || !content.trim() ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.2)',
            border: '1px solid rgba(139,92,246,0.3)',
            color: saving || !content.trim() ? '#4b5563' : '#a78bfa',
          }}
        >
          Add
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd web
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: error only about missing `ReminderForm`

- [ ] **Step 3: Commit**

```bash
cd ..
git add web/components/tracker/NotesPanel.tsx
git commit -m "feat: add NotesPanel component"
```

---

### Task 12: ReminderForm

**Files:**
- Create: `web/components/tracker/ReminderForm.tsx`

- [ ] **Step 1: Create ReminderForm**

```typescript
// web/components/tracker/ReminderForm.tsx
'use client'

import { useState, useEffect } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { apiFetch } from '@/lib/api'

type ReminderType = 'interview' | 'followup' | 'deadline' | 'custom'

interface Reminder {
  id: string
  reminder_type: ReminderType
  remind_at: string
  message: string | null
  is_sent: boolean
}

const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  interview: 'Interview',
  followup:  'Follow-up',
  deadline:  'Deadline',
  custom:    'Custom',
}

interface ReminderFormProps {
  applicationId: string
}

function toDatetimeLocal(iso: string): string {
  return iso.slice(0, 16)
}

export function ReminderForm({ applicationId }: ReminderFormProps) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<{
    reminder_type: ReminderType
    remind_at: string
    message: string
  }>({ reminder_type: 'interview', remind_at: '', message: '' })

  useEffect(() => {
    setLoading(true)
    apiFetch<Reminder[]>(`/applications/reminders?application_id=${applicationId}`)
      .then(setReminders)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [applicationId])

  async function handleAdd() {
    if (!form.remind_at) return
    setSaving(true)
    try {
      const reminder = await apiFetch<Reminder>('/applications/reminders', {
        method: 'POST',
        body: JSON.stringify({
          job_application_id: applicationId,
          reminder_type: form.reminder_type,
          remind_at: new Date(form.remind_at).toISOString(),
          message: form.message || undefined,
        }),
      })
      setReminders((prev) => [...prev, reminder])
      setForm({ reminder_type: 'interview', remind_at: '', message: '' })
      setShowForm(false)
    } catch {
      // fail silently
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(reminderId: string) {
    setReminders((prev) => prev.filter((r) => r.id !== reminderId))
    try {
      await apiFetch(`/applications/reminders/${reminderId}`, { method: 'DELETE' })
    } catch {
      // fail silently
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <div
          className="font-mono text-xs font-semibold tracking-widest"
          style={{ color: '#6b7280' }}
        >
          REMINDERS
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 text-xs transition-colors"
          style={{ color: '#8b5cf6' }}
        >
          <Plus size={12} />
          add
        </button>
      </div>

      {loading ? (
        <div className="text-xs" style={{ color: '#4b5563' }}>Loading…</div>
      ) : (
        <div className="flex flex-col gap-2 mb-2">
          {reminders.length === 0 && !showForm && (
            <div className="text-xs" style={{ color: '#4b5563' }}>No reminders set.</div>
          )}
          {reminders.map((r) => (
            <div
              key={r.id}
              className="group flex items-start justify-between gap-2 rounded-lg px-3 py-2"
              style={{
                background: r.is_sent ? '#0f0c1a' : '#13101f',
                border: r.is_sent
                  ? '1px solid rgba(139,92,246,0.08)'
                  : '1px solid rgba(251,191,36,0.2)',
              }}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="text-xs font-mono"
                  style={{ color: r.is_sent ? '#4b5563' : '#fbbf24' }}
                >
                  {REMINDER_TYPE_LABELS[r.reminder_type]}
                  {r.is_sent && ' · sent'}
                </div>
                <div className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                  {new Date(r.remind_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </div>
                {r.message && (
                  <div className="text-xs mt-0.5 truncate" style={{ color: '#94a3b8' }}>
                    {r.message}
                  </div>
                )}
              </div>
              {!r.is_sent && (
                <button
                  onClick={() => handleDelete(r.id)}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                  style={{ color: '#4b5563' }}
                  aria-label="Delete reminder"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div
          className="rounded-lg p-3 flex flex-col gap-2.5"
          style={{ background: '#13101f', border: '1px solid rgba(139,92,246,0.2)' }}
        >
          <select
            value={form.reminder_type}
            onChange={(e) => setForm((f) => ({ ...f, reminder_type: e.target.value as ReminderType }))}
            className="text-xs rounded-md px-2 py-1.5 outline-none"
            style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.2)', color: '#e2e8f0', colorScheme: 'dark' }}
          >
            {(Object.keys(REMINDER_TYPE_LABELS) as ReminderType[]).map((t) => (
              <option key={t} value={t}>{REMINDER_TYPE_LABELS[t]}</option>
            ))}
          </select>

          <input
            type="datetime-local"
            value={form.remind_at}
            onChange={(e) => setForm((f) => ({ ...f, remind_at: e.target.value }))}
            className="text-xs rounded-md px-2 py-1.5 outline-none"
            style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.2)', color: '#e2e8f0', colorScheme: 'dark' }}
          />

          <input
            type="text"
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            placeholder="Message (optional)"
            className="text-xs rounded-md px-2 py-1.5 outline-none"
            style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.2)', color: '#e2e8f0' }}
          />

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="text-xs px-3 py-1 rounded-md transition-colors"
              style={{ color: '#6b7280' }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !form.remind_at}
              className="text-xs px-3 py-1 rounded-md font-mono transition-all duration-150"
              style={{
                background: saving || !form.remind_at ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.2)',
                border: '1px solid rgba(139,92,246,0.3)',
                color: saving || !form.remind_at ? '#4b5563' : '#a78bfa',
              }}
            >
              {saving ? 'Saving…' : 'Set Reminder'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check — all errors should be resolved**

```bash
cd web
npx tsc --noEmit
```

Expected: no errors (clean)

- [ ] **Step 3: Run full API test suite to confirm nothing regressed**

```bash
cd ../api
npx jest --no-coverage
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
cd ..
git add web/components/tracker/ReminderForm.tsx
git commit -m "feat: add ReminderForm component"
```

---

### Task 13: Wire up and final validation

**Files:**
- Verify: `web/app/(app)/tracker/page.tsx` — already uses KanbanBoard
- Verify: `web/components/tracker/KanbanBoard.tsx` — already uses DrawerPanel
- Verify: `web/components/tracker/DrawerPanel.tsx` — already uses AppDateFields, NotesPanel, ReminderForm

- [ ] **Step 1: Run final TypeScript check**

```bash
cd web
npx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 2: Run full API test suite**

```bash
cd ../api
npx jest --no-coverage
```

Expected: all tests pass

- [ ] **Step 3: Commit final state**

```bash
cd ..
git add -A
git status   # should show nothing untracked
git commit --allow-empty -m "feat: Plan 5 Application Tracker complete"
```

If `git status` shows no changes, skip the commit (everything was committed task by task — nothing to add).

---

## Route Path Summary

The applications router is mounted at `/api/v1/applications`. Full paths:

| Route | Full path |
|-------|-----------|
| GET applications | `GET /api/v1/applications` |
| POST application | `POST /api/v1/applications` |
| PUT application | `PUT /api/v1/applications/:id` |
| DELETE application | `DELETE /api/v1/applications/:id` |
| GET notes | `GET /api/v1/applications/:id/notes` |
| POST note | `POST /api/v1/applications/:id/notes` |
| DELETE note | `DELETE /api/v1/applications/notes/:noteId` |
| GET reminders | `GET /api/v1/applications/reminders?application_id=:id` |
| POST reminder | `POST /api/v1/applications/reminders` |
| PUT reminder | `PUT /api/v1/applications/reminders/:id` |
| DELETE reminder | `DELETE /api/v1/applications/reminders/:id` |

The frontend `apiFetch` and `serverFetch` calls use these paths exactly (without the `/api/v1` prefix, which is prepended by the helpers).
