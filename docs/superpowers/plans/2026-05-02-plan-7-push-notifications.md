# Push Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send push notifications via Firebase Cloud Messaging (FCM) when a new job match scores ≥ 60 or a job application moves to the interviewing stage.

**Architecture:** Firebase Admin SDK in the Express API handles server-side FCM dispatch. The web frontend uses the Firebase JS SDK to register tokens; the Android Capacitor app uses `@capacitor/push-notifications`. Both platforms store FCM tokens in a new `push_tokens` Supabase table. A `firebase-messaging-sw.js` route handler in Next.js generates the Firebase background message handler with injected env vars (avoiding hardcoded secrets in static files).

**Tech Stack:** `firebase-admin` (API), `firebase` JS SDK (web), `@capacitor/push-notifications` (Android), Supabase migration

**Prerequisite:** Plan 6 must be complete (`web/android/` exists, service worker is registered).

---

### Firebase project setup (manual — do this before running any tasks)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create project: `jobtrack-ai`
3. Add an **Android app**: package name `com.jobtrack.ai`
4. Download `google-services.json` → place at `web/android/app/google-services.json`
5. Add a **Web app**: nickname `jobtrack-web`
6. Copy the Firebase config object shown (you'll need `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`)
7. In Firebase Console → Project Settings → Cloud Messaging → **Web Push certificates**: click **Generate key pair**. Copy the VAPID public key.
8. In Firebase Console → Project Settings → Service accounts → **Generate new private key** → download JSON file

**Environment variables to add:**

In `web/.env.local`:
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_VAPID_KEY=...
```

In `api/.env`:
```
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"...",...}
```
(Paste the entire service account JSON as a single-line string with escaped quotes)

---

### File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/007_push_tokens.sql` | Create | push_tokens table + RLS policy |
| `api/src/config/env.ts` | Modify | Add FIREBASE_SERVICE_ACCOUNT_JSON env var |
| `api/src/services/push.ts` | Create | sendPush() — FCM dispatch via firebase-admin |
| `api/src/routes/notifications.ts` | Create | POST /notifications/register endpoint |
| `api/src/routes/index.ts` | Modify | Mount notifications router |
| `api/src/workers/matchEngine.ts` | Modify | Trigger sendPush after Phase 1 (no resume) + Phase 2 (score ≥ 60) |
| `api/src/routes/applications.ts` | Modify | Trigger sendPush when status → 'interviewing' |
| `api/tests/push.test.ts` | Create | Unit tests for sendPush |
| `api/tests/notifications.test.ts` | Create | Integration test for POST /notifications/register |
| `web/app/firebase-messaging-sw.js/route.ts` | Create | Next.js route handler serving firebase-messaging-sw.js with injected config |
| `web/components/push/PushSetup.tsx` | Create | Client component: request permission + register FCM token |
| `web/app/(app)/layout.tsx` | Modify | Mount PushSetup inside authenticated routes |

---

### Task 1: Database migration — push_tokens table

**Files:**
- Create: `supabase/migrations/007_push_tokens.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/007_push_tokens.sql`:

```sql
CREATE TABLE IF NOT EXISTS push_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    TEXT NOT NULL CHECK (platform IN ('android', 'web')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own push tokens"
  ON push_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX push_tokens_user_id_idx ON push_tokens (user_id);
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the Supabase MCP tool `apply_migration` with the SQL above. Confirm the table is created.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_push_tokens.sql
git commit -m "feat: add push_tokens table with RLS"
```

---

### Task 2: Add Firebase env var + create push service

**Files:**
- Modify: `api/src/config/env.ts`
- Create: `api/src/services/push.ts`

- [ ] **Step 1: Write failing test for sendPush**

Create `api/tests/push.test.ts`:

```typescript
import { sendPush } from '../src/services/push'

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(() => ({})),
  getApps: jest.fn(() => []),
  cert: jest.fn((json) => json),
}))

const mockSend = jest.fn()
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ send: mockSend })),
}))

jest.mock('../src/config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}))

jest.mock('../src/config/env', () => ({
  env: { FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"test"}' },
}))

import { supabaseAdmin } from '../src/config/supabase'

describe('sendPush', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('sends FCM message to all tokens for a user', async () => {
    const mockTokens = [
      { id: 'tok-1', token: 'fcm-token-abc', platform: 'android' },
      { id: 'tok-2', token: 'fcm-token-def', platform: 'web' },
    ]
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: mockTokens, error: null }),
    })
    mockSend.mockResolvedValue('message-id-1')

    await sendPush('user-123', 'New match!', 'Frontend Engineer at Acme — 82%')

    expect(mockSend).toHaveBeenCalledTimes(2)
    const firstCall = mockSend.mock.calls[0][0]
    expect(firstCall.token).toBe('fcm-token-abc')
    expect(firstCall.notification.title).toBe('New match!')
    expect(firstCall.notification.body).toBe('Frontend Engineer at Acme — 82%')
  })

  it('deletes invalid tokens when FCM rejects them', async () => {
    const mockTokens = [{ id: 'tok-bad', token: 'invalid-token', platform: 'web' }]
    const mockDelete = jest.fn().mockReturnThis()
    const mockIn = jest.fn().mockResolvedValue({ error: null })
    ;(supabaseAdmin.from as jest.Mock)
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: mockTokens, error: null }),
      })
      .mockReturnValueOnce({ delete: mockDelete })
    mockDelete.mockReturnValue({ in: mockIn })

    const err = new Error('invalid token') as any
    err.code = 'messaging/registration-token-not-registered'
    mockSend.mockRejectedValue(err)

    await sendPush('user-123', 'Test', 'Body')

    expect(mockIn).toHaveBeenCalledWith('id', ['tok-bad'])
  })

  it('does nothing when the user has no tokens', async () => {
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    })

    await sendPush('user-no-tokens', 'Test', 'Body')

    expect(mockSend).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test — confirm it fails**

```bash
cd api && npm test -- --testPathPattern=push.test --no-coverage
```

Expected: FAIL — `Cannot find module '../src/services/push'`

- [ ] **Step 3: Add FIREBASE_SERVICE_ACCOUNT_JSON to env schema**

In `api/src/config/env.ts`, add one line inside `envSchema`:

```typescript
FIREBASE_SERVICE_ACCOUNT_JSON: z.string().default(''),
```

The updated schema block should look like:

```typescript
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
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().default(''),
})
```

- [ ] **Step 4: Install firebase-admin**

```bash
cd api && npm install firebase-admin
```

- [ ] **Step 5: Create api/src/services/push.ts**

```typescript
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { supabaseAdmin } from '../config/supabase'
import { env } from '../config/env'

function adminApp() {
  if (getApps().length > 0) return getApps()[0]
  return initializeApp({ credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON)) })
}

export async function sendPush(
  userId: string,
  title: string,
  body: string,
  url?: string
): Promise<void> {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) return

  const { data: tokens } = await supabaseAdmin
    .from('push_tokens')
    .select('id, token, platform')
    .eq('user_id', userId)

  if (!tokens || tokens.length === 0) return

  const messaging = getMessaging(adminApp())
  const invalidIds: string[] = []

  await Promise.all(
    tokens.map(async ({ id, token }: { id: string; token: string; platform: string }) => {
      try {
        await messaging.send({
          token,
          notification: { title, body },
          ...(url ? { webpush: { fcmOptions: { link: url } }, data: { url } } : {}),
        })
      } catch (err: any) {
        if (
          err.code === 'messaging/registration-token-not-registered' ||
          err.code === 'messaging/invalid-registration-token'
        ) {
          invalidIds.push(id)
        } else {
          console.error('[push] FCM send error for token', id, err?.message)
        }
      }
    })
  )

  if (invalidIds.length > 0) {
    await supabaseAdmin.from('push_tokens').delete().in('id', invalidIds)
  }
}
```

- [ ] **Step 6: Run the tests — confirm they pass**

```bash
cd api && npm test -- --testPathPattern=push.test --no-coverage
```

Expected: 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add api/src/config/env.ts api/src/services/push.ts api/tests/push.test.ts api/package.json api/package-lock.json
git commit -m "feat: add firebase-admin push service"
```

---

### Task 3: Add POST /notifications/register endpoint

**Files:**
- Create: `api/src/routes/notifications.ts`
- Modify: `api/src/routes/index.ts`

- [ ] **Step 1: Write the failing test**

Create `api/tests/notifications.test.ts`:

```typescript
import request from 'supertest'
import express from 'express'
import notificationsRouter from '../src/routes/notifications'
import { verifyToken } from '../src/middleware/auth'
import { supabaseAdmin } from '../src/config/supabase'

jest.mock('../src/middleware/auth', () => ({
  verifyToken: jest.fn((req: any, _res: any, next: any) => {
    req.userId = 'user-abc'
    next()
  }),
}))

jest.mock('../src/config/supabase', () => ({
  supabaseAdmin: { from: jest.fn() },
}))

const app = express()
app.use(express.json())
app.use('/notifications', notificationsRouter)

describe('POST /notifications/register', () => {
  beforeEach(() => jest.clearAllMocks())

  it('upserts the token and returns { registered: true }', async () => {
    ;(supabaseAdmin.from as jest.Mock).mockReturnValue({
      upsert: jest.fn().mockResolvedValue({ error: null }),
    })

    const res = await request(app)
      .post('/notifications/register')
      .send({ token: 'fcm-abc', platform: 'android' })

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ registered: true })
  })

  it('returns 400 for missing token', async () => {
    const res = await request(app)
      .post('/notifications/register')
      .send({ platform: 'android' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid platform', async () => {
    const res = await request(app)
      .post('/notifications/register')
      .send({ token: 'abc', platform: 'ios' })

    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run — confirm it fails**

```bash
cd api && npm test -- --testPathPattern=notifications.test --no-coverage
```

Expected: FAIL — `Cannot find module '../src/routes/notifications'`

- [ ] **Step 3: Create api/src/routes/notifications.ts**

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { verifyToken, AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { supabaseAdmin } from '../config/supabase'
import { success, failure } from '../types'

const router = Router()

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['android', 'web']),
})

router.post('/register', verifyToken, validate(registerSchema), async (req, res) => {
  const { userId } = req as AuthRequest
  const { token, platform } = req.body as { token: string; platform: 'android' | 'web' }

  const { error } = await supabaseAdmin
    .from('push_tokens')
    .upsert(
      { user_id: userId, token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' }
    )

  if (error) {
    res.status(500).json(failure('Failed to register token'))
    return
  }

  res.json(success({ registered: true }))
})

export default router
```

- [ ] **Step 4: Mount the router in api/src/routes/index.ts**

Add two lines to `api/src/routes/index.ts`:

```typescript
import notificationsRouter from './notifications'
// ... add after applicationsRouter line:
router.use('/notifications', notificationsRouter)
```

Full updated file:

```typescript
import { Router } from 'express'
import healthRouter from './health'
import profileRouter from './profile'
import skillsRouter from './skills'
import resumeRouter from './resume'
import jobsRouter from './jobs'
import applicationsRouter from './applications'
import notificationsRouter from './notifications'

const router = Router()

router.use('/health', healthRouter)
router.use('/profile', profileRouter)
router.use('/skills', skillsRouter)
router.use('/resume', resumeRouter)
router.use('/jobs', jobsRouter)
router.use('/applications', applicationsRouter)
router.use('/notifications', notificationsRouter)

export default router
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
cd api && npm test -- --testPathPattern=notifications.test --no-coverage
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/notifications.ts api/src/routes/index.ts api/tests/notifications.test.ts
git commit -m "feat: add POST /notifications/register endpoint"
```

---

### Task 4: Trigger push notification from matchEngine on new match ≥ 60

**Files:**
- Modify: `api/src/workers/matchEngine.ts`

The rule:
- If Phase 2 will run (score ≥ 40 AND parsedResume exists): send notification from Phase 2 when refined_score ≥ 60
- If Phase 2 will NOT run (no parsedResume): send notification from Phase 1 if score ≥ 60

To send from Phase 2, `runPhase2ForMatch` needs `userId` and the job info. Add `userId` as a parameter.

- [ ] **Step 1: Add userId parameter to runPhase2ForMatch signature**

In `api/src/workers/matchEngine.ts`, find the `runPhase2ForMatch` function signature at line ~228:

```typescript
export async function runPhase2ForMatch(
  matchId: string,
  job: JobForPhase2,
  parsedResume: Record<string, unknown>
): Promise<void> {
```

Change it to:

```typescript
export async function runPhase2ForMatch(
  matchId: string,
  job: JobForPhase2,
  parsedResume: Record<string, unknown>,
  userId: string
): Promise<void> {
```

- [ ] **Step 2: Import sendPush at the top of matchEngine.ts**

Add this import after the existing imports:

```typescript
import { sendPush } from '../services/push'
```

- [ ] **Step 3: Add the Phase 2 notification trigger**

Inside `runPhase2ForMatch`, find the block that updates `match_score` in Supabase (the `supabaseAdmin.from('job_matches').update(...)` call after `if (output) {`). Add the push call immediately after the update:

```typescript
if (output) {
  // ... existing DB update code (don't change it) ...

  if (output.refined_score >= 60) {
    sendPush(
      userId,
      `New match: ${job.title}`,
      `${job.company ?? 'Unknown'} — ${output.refined_score}% match`,
      `/jobs/${job.id}`
    ).catch(() => {})
  }
} else {
  // ... existing fallback code ...
}
```

- [ ] **Step 4: Add Phase 1 notification trigger for when Phase 2 won't run**

In `runPipelineForJobs`, find the `phase2JobsRaw` mapping. The current logic returns `{ matchId, job }` when `phase1.score >= 40 && parsedResume`. Add a push trigger for when parsedResume is null and score ≥ 60:

Find this block (around line 398):

```typescript
if (matchRow && phase1.score >= 40 && parsedResume) {
  return { matchId: matchRow.id, job: job as JobForPhase2 }
}
return null
```

Change it to:

```typescript
if (matchRow && phase1.score >= 40 && parsedResume) {
  return { matchId: matchRow.id, job: job as JobForPhase2 }
}
// No Phase 2 will run — send notification now if score qualifies
if (matchRow && phase1.score >= 60 && !parsedResume) {
  sendPush(
    userId,
    `New match: ${job.title}`,
    `${job.company ?? 'Unknown'} — ${phase1.score}% match`,
    `/jobs/${job.id}`
  ).catch(() => {})
}
return null
```

- [ ] **Step 5: Update the phase2Queue call to pass userId**

Find the loop near the bottom of `runPipelineForJobs`:

```typescript
for (const { matchId, job } of phase2Jobs) {
  phase2Queue.add(() => runPhase2ForMatch(matchId, job, parsedResume as Record<string, unknown>))
}
```

Change it to:

```typescript
for (const { matchId, job } of phase2Jobs) {
  phase2Queue.add(() => runPhase2ForMatch(matchId, job, parsedResume as Record<string, unknown>, userId))
}
```

- [ ] **Step 6: Update the runPhase2ForMatch test to pass userId**

In `api/tests/matchEngine.test.ts`, find the two `runPhase2ForMatch` calls in the test suite:

```typescript
await runPhase2ForMatch(mockMatchId, mockJob as any, mockParsedResume as any)
```

Change both to:

```typescript
await runPhase2ForMatch(mockMatchId, mockJob as any, mockParsedResume as any, 'user-test-id')
```

- [ ] **Step 7: Run all API tests — confirm they still pass**

```bash
cd api && npm test --no-coverage
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add api/src/workers/matchEngine.ts api/tests/matchEngine.test.ts
git commit -m "feat: trigger push notification for new matches with score >= 60"
```

---

### Task 5: Trigger push notification when application moves to interviewing

**Files:**
- Modify: `api/src/routes/applications.ts`

- [ ] **Step 1: Import sendPush in applications.ts**

Add this import near the top of `api/src/routes/applications.ts`, after the existing imports:

```typescript
import { sendPush } from '../services/push'
```

- [ ] **Step 2: Add the notification trigger inside PUT /:id**

Find the `PUT /:id` handler (around line 275). After the successful response (`res.json(success(data))`), add the push trigger. The full updated handler:

```typescript
router.put('/:id', verifyToken, validate(updateAppSchema), async (req, res) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('job_applications')
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select('id, job_id, status, jobs!inner(title, company)')
    .single()

  if (error || !data) {
    res.status(404).json(failure('Application not found'))
    return
  }

  res.json(success(data))

  // Fire-and-forget push for interview stage
  if (req.body.status === 'interviewing') {
    const job = (data as any).jobs
    const title = job?.title ?? 'Job'
    const company = job?.company ?? 'Unknown'
    sendPush(
      userId,
      '📅 Interview stage!',
      `${title} at ${company} — time to prepare!`,
      `/tracker`
    ).catch(() => {})
  }
})
```

Note: the `.select()` query was updated to join `jobs!inner(title, company)` so we have the job name for the notification message.

- [ ] **Step 3: Run all API tests**

```bash
cd api && npm test --no-coverage
```

Expected: all tests pass. (The applications tests mock supabaseAdmin so the new join in select doesn't break them.)

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/applications.ts
git commit -m "feat: send push notification when application moves to interviewing"
```

---

### Task 6: Create the Firebase messaging service worker via a Next.js route handler

**Files:**
- Create: `web/app/firebase-messaging-sw.js/route.ts`

Firebase Web SDK requires a service worker at `/firebase-messaging-sw.js` to handle background push messages. A Next.js route handler at this path serves the JS file with Firebase config injected from environment variables — avoiding hardcoded secrets in a static file.

- [ ] **Step 1: Create the directory and route handler**

Create `web/app/firebase-messaging-sw.js/route.ts`:

```typescript
import { NextResponse } from 'next/server'

export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  }

  const body = `
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(config)});
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'JobTrack AI';
  const body = payload.notification?.body ?? '';
  const icon = '/icons/icon-192.svg';
  self.registration.showNotification(title, { body, icon });
});
`.trim()

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    },
  })
}
```

- [ ] **Step 2: Verify the route is reachable**

Start the dev server (`npm run dev` in `web/`) and navigate to `http://localhost:3000/firebase-messaging-sw.js`. You should see the JavaScript content with your Firebase config values injected.

- [ ] **Step 3: Commit**

```bash
git add "web/app/firebase-messaging-sw.js/route.ts"
git commit -m "feat: serve firebase-messaging-sw.js via route handler with injected config"
```

---

### Task 7: Create the PushSetup frontend component

**Files:**
- Create: `web/components/push/PushSetup.tsx`

- [ ] **Step 1: Install Firebase JS SDK**

```bash
cd web && npm install firebase
```

- [ ] **Step 2: Install @capacitor/push-notifications**

```bash
cd web && npm install @capacitor/push-notifications && npx cap sync android
```

- [ ] **Step 3: Create the component**

Create `web/components/push/PushSetup.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

async function registerAndroid(): Promise<void> {
  const { PushNotifications } = await import('@capacitor/push-notifications')
  const { state } = await PushNotifications.checkPermissions()
  if (state !== 'granted') {
    const result = await PushNotifications.requestPermissions()
    if (result.receive !== 'granted') return
  }
  await PushNotifications.register()
  PushNotifications.addListener('registration', async ({ value: token }) => {
    await apiFetch('/notifications/register', {
      method: 'POST',
      body: JSON.stringify({ token, platform: 'android' }),
    }).catch(() => {})
  })
}

async function registerWeb(): Promise<void> {
  const { initializeApp, getApps } = await import('firebase/app')
  const { getMessaging, getToken } = await import('firebase/messaging')

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  }

  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  const messaging = getMessaging(app)

  // Register firebase-messaging-sw.js explicitly so it can be used alongside our own sw.js
  const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')

  const token = await getToken(messaging, {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: swRegistration,
  })

  if (token) {
    await apiFetch('/notifications/register', {
      method: 'POST',
      body: JSON.stringify({ token, platform: 'web' }),
    }).catch(() => {})
  }
}

export function PushSetup() {
  const [shown, setShown] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') setShown(true)
  }, [])

  async function enable() {
    setShown(false)
    if (Notification.permission !== 'granted') {
      const result = await Notification.requestPermission()
      if (result !== 'granted') return
    }
    try {
      const { Capacitor } = await import('@capacitor/core')
      if (Capacitor.isNativePlatform()) {
        await registerAndroid()
      } else {
        await registerWeb()
      }
    } catch (err) {
      console.error('[PushSetup] Registration error:', err)
    }
  }

  if (!shown || dismissed) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 rounded-xl px-4 py-3 flex items-center gap-3 text-sm font-mono shadow-xl"
      style={{ background: '#1a1425', border: '1px solid rgba(139,92,246,0.3)', color: '#e2e8f0', maxWidth: 320 }}
    >
      <span style={{ color: '#a78bfa', fontSize: 16 }}>🔔</span>
      <span className="flex-1" style={{ color: '#cbd5e1' }}>Enable job alerts?</span>
      <button
        onClick={enable}
        className="px-3 py-1 rounded-lg text-xs font-semibold shrink-0"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff' }}
      >
        Allow
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-xs shrink-0"
        style={{ color: '#64748b' }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Build to verify no TypeScript errors**

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/components/push/PushSetup.tsx web/package.json web/package-lock.json
git commit -m "feat: add PushSetup component for FCM token registration"
```

---

### Task 8: Mount PushSetup in the authenticated app layout

**Files:**
- Modify: `web/app/(app)/layout.tsx`

- [ ] **Step 1: Read the current app layout**

Read `web/app/(app)/layout.tsx` — it currently renders `<SidebarNav />` and `{children}`.

- [ ] **Step 2: Add PushSetup import and render**

Add the import at the top of `web/app/(app)/layout.tsx`:

```typescript
import { PushSetup } from '@/components/push/PushSetup'
```

Add `<PushSetup />` inside the returned JSX, just before the closing `</div>` of the outermost element:

```tsx
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // ... existing auth + onboarding checks ...

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <aside
        className="w-52 flex-shrink-0 flex flex-col py-4"
        style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border-default)' }}
      >
        <div
          className="px-4 pb-4 font-mono text-sm font-bold"
          style={{
            background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            borderBottom: '1px solid rgba(139,92,246,0.12)',
            marginBottom: '8px',
          }}
        >
          JobTrack AI
        </div>
        <SidebarNav />
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
      <PushSetup />
    </div>
  )
}
```

- [ ] **Step 3: Build**

```bash
cd web && npm run build
```

Expected: build succeeds, no errors.

- [ ] **Step 4: Commit**

```bash
git add web/app/(app)/layout.tsx
git commit -m "feat: mount PushSetup in authenticated app layout"
```

---

### Manual verification

1. Start dev server: `cd web && npm run dev`
2. Log in and navigate to any app page
3. The "Enable job alerts?" banner should appear in the bottom-right corner
4. Click **Allow** — browser permission dialog appears
5. After granting, check Supabase `push_tokens` table — a new row should appear for your user
6. To test a notification end-to-end: trigger a job refresh via the dashboard → any new match ≥ 60 should send a push (requires Firebase service account JSON to be set in `api/.env`)
