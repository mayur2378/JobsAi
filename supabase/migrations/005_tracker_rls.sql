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
