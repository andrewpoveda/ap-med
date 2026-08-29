-- 0009_general_mentor_email_unique.sql
-- Make public mentor onboarding retries idempotent at the database boundary.
-- The route checks for an existing general-platform row before insert, but two
-- requests can still race between that lookup and the write. This partial
-- unique index closes that gap without affecting Ascenso/cohort mentor rows.
--
-- Run manually in the Supabase SQL editor BEFORE deploying the route change.
--
-- PREFLIGHT — this must return zero rows, or the index will fail and roll the
-- transaction back:
--
--   select lower(email), count(*)
--   from mentor
--   where cohort_id is null
--   group by 1
--   having count(*) > 1;

begin;

create unique index if not exists mentor_general_email_key
  on mentor (lower(email))
  where cohort_id is null;

commit;

-- Rollback, if ever needed:
--   drop index if exists mentor_general_email_key;
