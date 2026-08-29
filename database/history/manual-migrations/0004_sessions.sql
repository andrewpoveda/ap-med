-- 0004_sessions.sql
-- Mentor authentication linkage + Google Calendar/Meet session scheduling schema.
--
-- Lands the full schema for two shipping efforts:
--   * feature/mentor-auth (PR 1): `mentor.auth_user_id` links a Supabase auth
--     user to their existing mentor row (claimed on first Google sign-in by
--     matching the verified email).
--   * feature/mentor-calendar-sync (PR 2): `mentor_google_tokens` stores each
--     mentor's encrypted Google refresh token; `sessions` records scheduled
--     mentor↔mentee meetings with their Google event + Meet link.
--
-- Both new tables follow the mentee_requests posture: RLS enabled with NO
-- policies, so the public anon key is fully locked out and only the service-role
-- API routes (which bypass RLS) can touch them.
--
-- Run manually in the Supabase SQL editor BEFORE deploying either branch — the
-- dashboard/session code reads these objects, so they must exist first (same
-- run-before-deploy protocol as 0001 / 0002 / 0003).

begin;

-- 1. Link a mentor row to its Supabase auth user. Nullable: existing mentors are
--    unlinked until they first sign in. UNIQUE so one auth user maps to at most
--    one mentor (Postgres allows many NULLs, so unclaimed rows are unconstrained).
alter table mentor
  add column if not exists auth_user_id uuid;

create unique index if not exists mentor_auth_user_id_key
  on mentor (auth_user_id);

-- 2. Per-mentor Google OAuth refresh token (encrypted at rest by the app before
--    insert — the DB never sees plaintext). One row per mentor.
create table if not exists mentor_google_tokens (
  mentor_id uuid primary key references mentor(id) on delete cascade,
  refresh_token_encrypted text not null,
  google_email text,
  connected_at timestamptz not null default now()
);

alter table mentor_google_tokens enable row level security;

-- 3. Scheduled mentorship sessions. google_event_id / meet_link are populated
--    once the Calendar event is created. status is constrained to the lifecycle
--    the app manages.
create table if not exists sessions (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  mentor_id uuid not null references mentor(id) on delete cascade,
  mentee_id uuid not null references mentees(id) on delete cascade,
  scheduled_at timestamptz not null,
  google_event_id text,
  meet_link text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  notes text
);

-- Upcoming-sessions dashboard query is by mentor, ordered by time.
create index if not exists sessions_mentor_scheduled_idx
  on sessions (mentor_id, scheduled_at);

alter table sessions enable row level security;

commit;
