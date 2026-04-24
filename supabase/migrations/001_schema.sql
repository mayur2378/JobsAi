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
