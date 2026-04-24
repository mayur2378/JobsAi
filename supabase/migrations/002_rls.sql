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
