-- 0010_general_mentee_submission_id.sql
-- Give each browser form session a durable idempotency key. A network timeout
-- after the database insert can otherwise make a careful applicant click again
-- and create a second mentee row. Email cannot be the key because the general
-- matcher intentionally allows the same person to return and run it again.
--
-- Run manually in the Supabase SQL editor BEFORE deploying the client/API code.

begin;

alter table public.mentees
  add column if not exists submission_id uuid;

create unique index if not exists mentees_general_submission_id_key
  on public.mentees (submission_id)
  where cohort_id is null and submission_id is not null;

commit;

-- Rollback, if ever needed (dropping the column also drops its index):
--   alter table public.mentees drop column if exists submission_id;
