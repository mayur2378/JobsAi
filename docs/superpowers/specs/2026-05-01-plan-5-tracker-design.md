# Plan 5 — Application Tracker Design

## Goal

Build the Application Tracker: a Kanban board at `/tracker` where users manage their job applications through a five-stage pipeline (Saved → Applied → Interviewing → Offer → Rejected), with a slide-in detail drawer for notes, date tracking, and reminders. Backed by a new `/applications` API and a notification worker.

No Profile/Settings, no AI features — those are Plan 6.

---

## Architecture

**Backend:** New `api/src/routes/applications.ts` router registered in `api/src/routes/index.ts`. Handles full CRUD for applications, notes per application, and reminders. A new `api/src/workers/notificationWorker.ts` runs every 15 minutes via node-cron: queries `reminders` for due, unsent entries, creates in-app `notifications` records, and marks `is_sent = true`. Started on API boot alongside existing workers.

**Database:** `job_applications`, `notes`, and `reminders` tables already exist from Plan 1's schema. Migration `005_tracker_rls.sql` adds RLS policies for all three tables. No new tables needed.

**Frontend:** `/tracker` is a Server Component that fetches all non-dismissed applications via `serverFetch`, then renders `<KanbanBoard initialData={...} />` — a `'use client'` component that owns all board state, drag-and-drop (via `@hello-pangea/dnd`), and the slide-in drawer. All mutations use `apiFetch` with optimistic updates. `ScoreRing` is reused from `web/components/jobs/ScoreRing.tsx`.

**Dismissed applications** are excluded from the board entirely. The Kanban shows exactly five columns: Saved, Applied, Interviewing, Offer, Rejected.

---

## API Routes

All routes require `Authorization: Bearer <supabase_jwt>`. User identity comes from `verifyToken(req)` — all queries filter by `user_id`.

```
# Applications
GET    /api/v1/applications              ?status&page&limit
POST   /api/v1/applications             { job_id, status }
PUT    /api/v1/applications/:id         { status, applied_at, interview_date,
                                          follow_up_date, offer_amount }
DELETE /api/v1/applications/:id

# Notes
GET    /api/v1/applications/:id/notes
POST   /api/v1/applications/:id/notes   { content }
PUT    /api/v1/notes/:id                { content }
DELETE /api/v1/notes/:id

# Reminders
GET    /api/v1/reminders?application_id=:id
POST   /api/v1/reminders                { job_application_id, reminder_type,
                                          remind_at, message }
PUT    /api/v1/reminders/:id            { remind_at, message }
DELETE /api/v1/reminders/:id
```

`GET /applications` joins `job_applications → jobs → job_matches` (for score/label) and returns all fields needed to populate Kanban cards — no per-card round-trip.

`POST /applications` upserts into `job_applications` (same table as `PATCH /jobs/:id/status`). Both entry points coexist without conflict.

---

## Database Migration (`005_tracker_rls.sql`)

Add RLS policies for the three tracker tables (currently unprotected):

```sql
-- job_applications
alter table job_applications enable row level security;
create policy "job_applications: users manage own"
  on job_applications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- notes
alter table notes enable row level security;
create policy "notes: users manage own"
  on notes for all
  using (
    auth.uid() = (
      select user_id from job_applications
      where id = notes.job_application_id
    )
  );

-- reminders
alter table reminders enable row level security;
create policy "reminders: users manage own"
  on reminders for all
  using (
    auth.uid() = (
      select user_id from job_applications
      where id = reminders.job_application_id
    )
  );
```

---

## Notification Worker

**File:** `api/src/workers/notificationWorker.ts`  
**Schedule:** `*/15 * * * *` (every 15 minutes)  
**Started:** in `api/src/index.ts` on boot, alongside `matchEngine` scheduler

**Logic per tick:**
1. Query `reminders JOIN job_applications JOIN jobs` where `remind_at <= now() AND is_sent = false`, limit 50
2. For each reminder: `INSERT` into `notifications` with `{ user_id, type: <mapped>, title: job title, message: reminder.message, metadata: { job_id, application_id } }` where `reminder_type` maps to `notification_type_enum` as: `interview → interview_reminder`, `followup → followup`, `deadline → system`, `custom → system`
3. `UPDATE reminders SET is_sent = true` for processed IDs

No email in Plan 5 — Resend email delivery is Plan 6.

No notifications bell/page UI in Plan 5 — the `notifications` table is populated but the `/notifications` page is Phase 2.

---

## Frontend Component Map

**New files:**

```
web/app/(app)/tracker/page.tsx              — Server Component: serverFetch all
                                              applications (status != 'dismissed'),
                                              render <KanbanBoard initialData={...} />

web/components/tracker/KanbanBoard.tsx      — 'use client': DragDropContext from
                                              @hello-pangea/dnd, column state,
                                              optimistic status update on drag,
                                              drawer open/close state

web/components/tracker/KanbanColumn.tsx     — Droppable: column header with status
                                              label + count badge, drop zone styling

web/components/tracker/TrackerCard.tsx      — Draggable: company avatar (initials),
                                              job title, company, ScoreRing (sm),
                                              interview_date badge when set

web/components/tracker/DrawerPanel.tsx      — 'use client': fixed right panel,
                                              slides in/out with CSS transition,
                                              closes on Escape key or backdrop click

web/components/tracker/AppDateFields.tsx    — applied_at, interview_date,
                                              follow_up_date (datetime-local inputs),
                                              offer_amount (number input) —
                                              PUT /applications/:id on blur

web/components/tracker/NotesPanel.tsx       — ordered list of notes (newest last),
                                              plain textarea + submit button,
                                              DELETE per note

web/components/tracker/ReminderForm.tsx     — reminder_type select
                                              (interview/followup/deadline/custom),
                                              datetime-local input, message textarea,
                                              POST on submit; list of existing
                                              reminders with DELETE
```

**Modified files:**

```
web/app/(app)/layout.tsx                    — activate /tracker sidebar link
                                              (remove any placeholder/disabled state)
api/src/routes/index.ts                     — import and register applicationsRouter
api/src/index.ts                            — import and start notificationWorker
```

---

## Drawer Panel Detail

The drawer opens when a TrackerCard is clicked. It renders in a fixed right panel (width: 320px on desktop, full-width on mobile) with a dark overlay on the board behind it.

**Sections (top to bottom):**
1. **Header** — company avatar, job title, company + location, score badge, status badge, "View job →" link, close button
2. **Dates** — applied_at, interview_date, follow_up_date, offer_amount; each saves on blur via `PUT /applications/:id`
3. **Reminders** — list of existing reminders + "Add reminder" form (type, datetime, message)
4. **Notes** — chronological list of plain-text notes + add-note textarea

---

## Kanban Columns

| Column | Status value | Header color |
|--------|-------------|-------------|
| Saved | `saved` | purple |
| Applied | `applied` | blue |
| Interviewing | `interviewing` | amber |
| Offer | `offer` | green |
| Rejected | `rejected` | red |

Drag-and-drop between columns calls `PUT /applications/:id { status: newColumn }` with optimistic update — card moves instantly, reverts on API error with a toast.

---

## Optimistic Update Strategy

On drag-end:
1. Update local `columns` state immediately (card moves to new column)
2. Fire `PUT /applications/:id` in background
3. On success: no-op (state already correct)
4. On error: revert card to original column, show error toast

On note add:
1. Append optimistic note with temp ID to local state
2. Fire `POST /applications/:id/notes`
3. On success: replace temp ID with real ID from response
4. On error: remove optimistic note, show error toast

---

## Design System

Follows Plan 4's established tokens:

| Token | Value |
|-------|-------|
| Background base | `#0a0a0f` |
| Background surface | `#0f0c1a` |
| Background raised | `#13101f` |
| Border default | `rgba(139,92,246,0.15)` |
| Border strong | `rgba(139,92,246,0.35)` |
| Fonts | Fira Code (labels/mono) · Fira Sans (body) |
| Icons | Lucide React |

Column accent colors match status: purple (saved), blue (applied), amber (interviewing), green (offer), red (rejected).

---

## Known Constraints

- **No email notifications** — Resend delivery is Plan 6. Worker creates `notifications` records only.
- **No notifications UI** — `/notifications` page is Phase 2. Notifications table is populated silently.
- **No `/tracker` on mobile** — Kanban scrolls horizontally on small screens; no dedicated mobile layout in Plan 5.
- **`dismissed` status excluded** — Dismissed applications are not shown in the Kanban. Users can dismiss from the job detail page (`/jobs/[id]`) via StatusSelector (Plan 4).
- **`@hello-pangea/dnd` must be added** — not yet in `web/package.json`.
