-- 0006_ascenso_cohorts.sql
-- Ascenso cohort system schema (ascenso-prm.md §4) — the full data model for
-- the LMSA-NE 30-pair pilot: cohorts, applications, admin users, board-approved
-- matches, milestones, and the tracking layer (meeting logs, goals,
-- announcements, surveys, email log).
--
-- Also extends the existing member tables: nullable `cohort_id` on mentor and
-- mentees (cohort membership marker), and `auth_user_id` on mentees (mirrors
-- mentor's PR #5 column — cohort mentees get Google OAuth accounts via the same
-- claim-by-email pattern).
--
-- Isolation posture (PRM §6): every new table has RLS enabled with NO policies,
-- so the public anon key is fully locked out and only service-role API routes
-- can touch them (same as mentee_requests / mentor_google_tokens / sessions).
-- Cohort members are excluded from the public directory, matcher, and request
-- flow by `cohort_id is null` filters in app code — `cohort_id` is NOT in
-- PUBLIC_MENTOR_COLUMNS and must never be.
--
-- NOTE: 0005 is reserved for the scheduling/availability migration
-- (mentor_availability + schedule tokens, designed 2026-07-13, not yet built).
-- Ascenso is numbered 0006 per the PRM so the two land independently.
--
-- Run manually in the Supabase SQL editor BEFORE deploying the matching code
-- change — the public routes filter on mentor.cohort_id / mentees.cohort_id, so
-- the columns must exist first or the directory and matcher 500 (same
-- run-before-deploy protocol as 0001–0004).

begin;

-- 1. Cohorts — one row per program instance ('Ascenso 2026–27').
create table if not exists cohorts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,                 -- 'Ascenso 2026–27'
  org text not null,                  -- 'LMSA-NE'
  status text not null default 'setup',
    -- setup | applications_open | matching | active | closed
  config jsonb not null default '{}'  -- track quotas, survey links, orientation date
);

alter table cohorts enable row level security;

-- 2. Cohort membership markers on the existing member tables. Nullable: NULL =
--    general-platform member (public funnel), non-NULL = cohort member (never
--    public). Public-facing queries filter `cohort_id is null`.
alter table mentor
  add column if not exists cohort_id uuid references cohorts(id);

alter table mentees
  add column if not exists cohort_id uuid references cohorts(id);

-- 3. Auth linkage for cohort mentees, mirroring mentor.auth_user_id (0004).
--    Nullable: rows are unlinked until first Google sign-in claims them by
--    verified email. UNIQUE so one auth user maps to at most one mentee row
--    (many NULLs allowed, so unclaimed rows are unconstrained).
alter table mentees
  add column if not exists auth_user_id uuid;

create unique index if not exists mentees_auth_user_id_key
  on mentees (auth_user_id);

-- 4. Applications — the one public-facing cohort surface, and even it only
--    lands through a Turnstile-verified server route (never direct insert).
create table if not exists cohort_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references cohorts(id),
  role text not null,                 -- 'mentor' | 'mentee'
  track text not null,                -- 'ms_premed' | 'resident_ms' | 'attending_ms' | 'attending_resident'
  full_name text not null,
  email text not null,
  answers jsonb not null default '{}',-- form responses; schema per cohort, don't over-normalize
  status text not null default 'submitted',
    -- submitted | approved | rejected | waitlisted
  reviewed_by uuid,                   -- admin_users.id
  reviewed_at timestamptz,
  review_notes text,
  member_id uuid                      -- set on approval: the mentor/mentees row created
);

-- One application per email per role per cohort (duplicate → 409 at the route).
create unique index if not exists cohort_applications_cohort_role_email_key
  on cohort_applications (cohort_id, role, lower(email));

alter table cohort_applications enable row level security;

-- 5. Admin allowlist — session email (Google-verified, PR #5 pattern) must
--    match a row here to reach any /admin route.
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,         -- matched against Google-verified session email
  display_name text,
  role text not null default 'cohort_admin',  -- 'super' | 'cohort_admin'
  cohort_id uuid references cohorts(id)       -- null for super
);

alter table admin_users enable row level security;

-- 6. Matches — proposed by the scoped matcher, activated only after explicit
--    board approval (no auto-matching goes live).
create table if not exists cohort_matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references cohorts(id),
  mentor_id uuid not null,            -- mentor.id
  mentee_id uuid not null,            -- mentees.id
  track text not null,
  score numeric,                      -- from existing deterministic matcher
  status text not null default 'proposed',
    -- proposed | board_approved | active | ended
  approved_by uuid,
  approved_at timestamptz,
  unique (cohort_id, mentor_id, mentee_id)
);

alter table cohort_matches enable row level security;

-- 7. Milestones — attendance/completion checkboxes marked by an admin
--    (orientation, mentor_training, mentee_training). member_id is polymorphic
--    over mentor/mentees via member_type, so no FK is possible.
create table if not exists member_milestones (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references cohorts(id),
  member_type text not null,          -- 'mentor' | 'mentee'
  member_id uuid not null,
  milestone text not null,            -- 'orientation' | 'mentor_training' | 'mentee_training'
  completed_at timestamptz not null default now(),
  marked_by uuid not null,            -- admin_users.id
  unique (cohort_id, member_type, member_id, milestone)
);

alter table member_milestones enable row level security;

-- 8. Meeting logs — the core accountability feature. Two sources: sessions
--    booked on-platform (session_id set = marks that session as held) and
--    manual entries for off-platform meetings (session_id null).
create table if not exists meeting_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references cohorts(id),
  match_id uuid not null references cohort_matches(id),
  session_id uuid references sessions(id),  -- null = off-platform meeting; set = marks a booked session as held
  logged_by_type text not null,       -- 'mentor' | 'mentee' | 'admin'
  logged_by_id uuid not null,
  met_at date not null,
  duration_minutes int,
  mode text,                          -- 'zoom' | 'phone' | 'in_person' | 'async'
  notes text
);

alter table meeting_logs enable row level security;

-- 9. Goals — per-match, both sides edit from their dashboards.
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references cohorts(id),
  match_id uuid not null references cohort_matches(id),
  title text not null,
  status text not null default 'active',  -- active | done | dropped
  target_date date,
  updated_at timestamptz not null default now()
);

alter table goals enable row level security;

-- 10. Announcements — admin-composed cohort emails (subject to the
--     one-full-cohort-send-per-day rule enforced at the route).
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references cohorts(id),
  subject text not null,
  body text not null,
  audience text not null default 'all',   -- all | mentors | mentees
  sent_at timestamptz,
  sent_by uuid not null,
  recipient_count int
);

alter table announcements enable row level security;

-- 11. Surveys — native, authed submission from member dashboards; completion is
--     derived from survey_responses (no manual marking).
create table if not exists surveys (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references cohorts(id),
  wave text not null,                 -- 'mid_year' | 'end_year'
  title text not null,
  questions jsonb not null,           -- ordered array: {id, prompt, type: 'text'|'scale'|'select', options?}
  status text not null default 'draft',  -- draft | open | closed
  opens_at timestamptz,
  closes_at timestamptz,
  unique (cohort_id, wave)
);

alter table surveys enable row level security;

create table if not exists survey_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  survey_id uuid not null references surveys(id),
  cohort_id uuid not null references cohorts(id),
  member_type text not null,          -- resolved server-side from email
  member_id uuid not null,
  answers jsonb not null,
  unique (survey_id, member_id)
);

alter table survey_responses enable row level security;

-- 12. Email log — every cohort send writes here; send routes refuse past the
--     90/day soft cap (Resend free tier is 100/day).
create table if not exists email_log (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  cohort_id uuid,
  kind text not null,                 -- 'announcement' | 'digest' | 'match_notify' | ...
  recipient_email text not null,
  ref_id uuid                         -- announcement id, match id, etc.
);

alter table email_log enable row level security;

commit;
