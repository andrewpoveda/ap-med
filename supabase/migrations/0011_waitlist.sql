-- 0011_waitlist.sql
-- Email-only early-access list for AP MED Mentors. Public visitors submit
-- through /api/waitlist; the browser never talks to this table directly.
--
-- Run before deploying the route and homepage form.

begin;

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  created_at timestamptz not null default now(),
  constraint waitlist_email_length check (length(btrim(email)) between 3 and 200)
);

-- Case-insensitive uniqueness keeps retries and differently-cased submissions
-- from creating duplicate people even if a future caller forgets to normalize.
create unique index if not exists waitlist_email_key
  on public.waitlist (lower(email));

-- Server-mediated posture: no public policies and no anon/authenticated grants.
-- Only the service-role API/admin surfaces can insert, view, export, or clean up.
alter table public.waitlist enable row level security;
revoke all on table public.waitlist from anon, authenticated;
grant select, insert, delete on table public.waitlist to service_role;

commit;

-- Rollback, if ever needed:
--   drop table if exists public.waitlist;
