-- AP MED Mentors portable PostgreSQL baseline.
--
-- Logical cutoff: immediately before production migration
-- 20260827014255_waitlist. This file contains application-owned schema only.
-- It deliberately excludes Supabase Auth, Storage, Realtime, Vault, platform
-- roles, platform default privileges, and production data.
--
-- PostgreSQL target: 17
-- Required contributed extension: uuid-ossp

begin;

create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  org text not null,
  status text not null default 'setup',
  config jsonb not null default '{}'::jsonb
);

create table public.mentor (
  id uuid primary key default extensions.uuid_generate_v4(),
  created_at timestamptz not null default now(),
  first_name text not null,
  last_name text not null,
  credentials text,
  "current_role" text not null,
  institution text not null,
  linkedin_url text,
  episode_url text,
  bio text not null,
  identity text[],
  current_stage text not null,
  specialty text[],
  can_help_with text[],
  mentee_capacity text not null default ''::text,
  contact_method text[],
  scheduling_url text default ''::text,
  open_to_podcast boolean not null default false,
  email text not null,
  notes text,
  photo_url text,
  approved boolean not null default false,
  auth_user_id uuid,
  cohort_id uuid references public.cohorts(id)
);

create table public.mentees (
  id uuid primary key default extensions.uuid_generate_v4(),
  created_at timestamptz default now(),
  full_name text not null default ''::text,
  email text not null default ''::text,
  school text not null default ''::text,
  identity text[],
  interests text[],
  preferred_identity text[],
  notes text default ''::text,
  linkedin_url text,
  current_stage text,
  help_with text[] default '{}'::text[],
  cohort_id uuid references public.cohorts(id),
  auth_user_id uuid,
  submission_id uuid
);

create table public.mentee_requests (
  id uuid primary key default extensions.uuid_generate_v4(),
  created_at timestamptz not null default now(),
  mentee_id uuid not null references public.mentees(id) on delete cascade,
  mentor_id uuid not null references public.mentor(id) on delete cascade,
  schedule_token_hash text,
  schedule_token_expires_at timestamptz,
  unique (mentee_id, mentor_id)
);

create table public.mentor_google_tokens (
  mentor_id uuid primary key references public.mentor(id) on delete cascade,
  refresh_token_encrypted text not null,
  google_email text,
  connected_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default extensions.uuid_generate_v4(),
  created_at timestamptz not null default now(),
  mentor_id uuid not null references public.mentor(id) on delete cascade,
  mentee_id uuid not null references public.mentees(id) on delete cascade,
  scheduled_at timestamptz not null,
  google_event_id text,
  meet_link text,
  status text not null default 'scheduled'::text
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  notes text
);

create table public.mentor_availability (
  mentor_id uuid primary key references public.mentor(id) on delete cascade,
  timezone text not null,
  rules jsonb not null default '[]'::jsonb,
  slot_minutes integer not null default 30,
  updated_at timestamptz not null default now()
);

create table public.cohort_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references public.cohorts(id),
  role text not null,
  track text not null,
  full_name text not null,
  email text not null,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'submitted'::text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  member_id uuid,
  previous_submission jsonb,
  updated_at timestamptz
);

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  role text not null default 'cohort_admin'::text,
  cohort_id uuid references public.cohorts(id)
);

create table public.cohort_matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references public.cohorts(id),
  mentor_id uuid not null,
  mentee_id uuid not null,
  track text not null,
  score numeric,
  status text not null default 'proposed'::text,
  approved_by uuid,
  approved_at timestamptz,
  unique (cohort_id, mentor_id, mentee_id)
);

create table public.member_milestones (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id),
  member_type text not null,
  member_id uuid not null,
  milestone text not null,
  completed_at timestamptz not null default now(),
  marked_by uuid not null,
  unique (cohort_id, member_type, member_id, milestone)
);

create table public.meeting_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references public.cohorts(id),
  match_id uuid not null references public.cohort_matches(id),
  session_id uuid references public.sessions(id),
  logged_by_type text not null,
  logged_by_id uuid not null,
  met_at date not null,
  duration_minutes integer,
  mode text,
  notes text
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references public.cohorts(id),
  match_id uuid not null references public.cohort_matches(id),
  title text not null,
  status text not null default 'active'::text,
  target_date date,
  updated_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references public.cohorts(id),
  subject text not null,
  body text not null,
  audience text not null default 'all'::text,
  sent_at timestamptz,
  sent_by uuid not null,
  recipient_count integer
);

create table public.surveys (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references public.cohorts(id),
  wave text not null,
  title text not null,
  questions jsonb not null,
  status text not null default 'draft'::text,
  opens_at timestamptz,
  closes_at timestamptz,
  unique (cohort_id, wave)
);

create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  survey_id uuid not null references public.surveys(id),
  cohort_id uuid not null references public.cohorts(id),
  member_type text not null,
  member_id uuid not null,
  answers jsonb not null,
  unique (survey_id, member_id)
);

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  cohort_id uuid,
  kind text not null,
  recipient_email text not null,
  ref_id uuid
);

create table public.app_settings (
  id smallint primary key,
  ascenso_visible boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

create unique index cohort_applications_cohort_role_email_key
  on public.cohort_applications (cohort_id, role, lower(email));

create unique index mentee_requests_schedule_token_hash_key
  on public.mentee_requests (schedule_token_hash);

create unique index mentees_auth_user_id_key
  on public.mentees (auth_user_id);

create unique index mentees_cohort_email_key
  on public.mentees (lower(email))
  where cohort_id is not null;

create unique index mentees_general_submission_id_key
  on public.mentees (submission_id)
  where cohort_id is null and submission_id is not null;

create unique index mentor_auth_user_id_key
  on public.mentor (auth_user_id);

create unique index mentor_general_email_key
  on public.mentor (lower(email))
  where cohort_id is null;

create index sessions_mentor_scheduled_idx
  on public.sessions (mentor_id, scheduled_at);

create unique index sessions_mentor_slot_key
  on public.sessions (mentor_id, scheduled_at)
  where status = 'scheduled'::text;

create or replace function public.app_settings_touch_updated_at()
returns trigger
language plpgsql
security invoker
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.app_settings_touch_updated_at();

alter table public.admin_users enable row level security;
alter table public.announcements enable row level security;
alter table public.app_settings enable row level security;
alter table public.cohort_applications enable row level security;
alter table public.cohort_matches enable row level security;
alter table public.cohorts enable row level security;
alter table public.email_log enable row level security;
alter table public.goals enable row level security;
alter table public.meeting_logs enable row level security;
alter table public.member_milestones enable row level security;
alter table public.mentee_requests enable row level security;
alter table public.mentees enable row level security;
alter table public.mentor enable row level security;
alter table public.mentor_availability enable row level security;
alter table public.mentor_google_tokens enable row level security;
alter table public.sessions enable row level security;
alter table public.survey_responses enable row level security;
alter table public.surveys enable row level security;

-- These policies intentionally mirror production, including the separately
-- reported public-access concern. Baselining is not a security-policy change.
create policy "allow insert for all"
  on public.mentees
  as permissive
  for insert
  to public
  with check (true);

create policy "Public can read mentors"
  on public.mentor
  as permissive
  for select
  to public
  using (true);

create policy "allow insert for all"
  on public.mentor
  as permissive
  for insert
  to public
  with check (true);

commit;
