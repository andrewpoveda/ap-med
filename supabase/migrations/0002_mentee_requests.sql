-- 0002_mentee_requests.sql
-- One row per mentorship request (the results-page "Request →" click).
--
-- UNIQUE (mentee_id, mentor_id) is the server-side guarantee that a mentee can
-- email a given mentor at most once: /api/notify inserts here BEFORE sending
-- and treats a unique-violation as "already requested" (409, no email sent).
-- If the mentor email fails to send, the route deletes the row so a retry works.
--
-- Run manually in the Supabase SQL editor (same procedure as 0001).

begin;

create table if not exists mentee_requests (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  mentee_id uuid not null references mentees(id) on delete cascade,
  mentor_id uuid not null references mentor(id) on delete cascade,
  unique (mentee_id, mentor_id)
);

-- Only the API routes touch this table, via the service role (which bypasses
-- RLS). Enabling RLS with no policies locks out the public anon key entirely.
alter table mentee_requests enable row level security;

commit;
