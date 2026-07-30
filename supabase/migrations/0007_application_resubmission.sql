-- 0007_application_resubmission.sql
-- Two changes with one cause: a single person could end up owning more than one
-- cohort mentee row, and first Google sign-in claims whichever is NEWEST
-- (src/lib/mentee-link.ts) — which is not necessarily theirs.
--
--   1. A partial unique index that makes "one cohort mentee row per email
--      address" a database guarantee rather than a convention.
--   2. Resubmission storage on cohort_applications, so a second application from
--      the same person UPDATES their row in place instead of being refused,
--      without losing what they said the first time.
--
-- Run manually in the Supabase SQL editor BEFORE deploying the code that reads
-- these columns (same run-before-deploy protocol as 0001-0006).
--
-- PREFLIGHT — run this first; it must return zero rows, or the index below will
-- fail and roll the whole transaction back:
--
--   select lower(email), count(*)
--   from mentees
--   where cohort_id is not null
--   group by 1
--   having count(*) > 1;
--
-- If it returns rows, decide which row is the real member (prefer one with
-- auth_user_id set, else the one referenced by cohort_matches) and clear the
-- cohort_id on the others — do NOT delete them; a general-platform row with
-- cohort_id NULL is a legitimate row that this index does not constrain.

begin;

-- 1. One cohort mentee row per email address.
--
-- PARTIAL, and deliberately NOT `alter table mentees add constraint ... unique
-- (email)`. The public mentee funnel (/api/mentees, the mentee-onboarding form)
-- inserts one row per submission, so a student who uses the matcher twice
-- legitimately has several general-platform rows (cohort_id IS NULL) sharing an
-- email. A table-wide unique would start failing that public form on every
-- repeat submission, and would also stop promoteApplicationToMember from ever
-- creating a cohort row for someone who had already used the public matcher.
-- Scoping to cohort rows constrains exactly the ambiguity that matters and
-- leaves the open funnel alone.
--
-- Not scoped per-cohort — `(lower(email))` across all cohort rows, not
-- `(cohort_id, lower(email))` — to stay aligned with mentees_auth_user_id_key
-- (0006), which already allows an auth user to own at most ONE mentee row. If
-- the same person is ever admitted to a second cohort, that pair of constraints
-- means they'd need a deliberate schema decision anyway; failing loudly at
-- approval time (an admin sees a 409) beats silently creating a second row that
-- nobody can ever sign in to.
--
-- lower(email) because every lookup in the app is case-insensitive; letting
-- 'A@x.com' and 'a@x.com' both exist as members would defeat the purpose.
create unique index if not exists mentees_cohort_email_key
  on mentees (lower(email))
  where cohort_id is not null;

-- 2. Resubmission support on cohort_applications.
--
-- cohort_applications_cohort_role_email_key (0006) already allows one
-- application per email per role per cohort. Until now the intake route turned
-- that into a 409 — "you already applied" — which treats a person fixing a typo
-- or improving an answer as a duplicate. The route now updates the existing row
-- instead, and stashes the version it is about to overwrite here.
--
-- A jsonb column rather than an applications_history table, for two reasons.
-- The schema comment on `answers` already sets the precedent ("form responses;
-- schema per cohort, don't over-normalize") — a history table would need its own
-- RLS, its own migration when the answer shape changes, and a join on every
-- read. And only ONE prior version is kept: a second resubmission overwrites
-- this column, so it can never grow. A table would invite an unbounded audit
-- log nobody asked for.
--
-- Shape (written by /api/cohort-applications, read by the admin review page):
--   {
--     "full_name":     text,       -- name/track are snapshotted too, not just
--     "track":         text,       --   answers: both can change between tries
--     "answers":       jsonb,
--     "submitted_at":  timestamptz,-- when the superseded version was sent
--     "superseded_at": timestamptz -- when it was replaced
--   }
alter table cohort_applications
  add column if not exists previous_submission jsonb;

-- When the CURRENT version was submitted. NULL means never resubmitted, so
-- created_at (the original) still stands — which is why this isn't defaulted to
-- now(): a NULL here is meaningful, and backfilling every existing row with a
-- fake update time would be a lie about applications nobody has touched.
alter table cohort_applications
  add column if not exists updated_at timestamptz;

commit;

-- Rollback, if ever needed (the columns are additive; dropping them loses only
-- the stored prior versions):
--   drop index if exists mentees_cohort_email_key;
--   alter table cohort_applications
--     drop column if exists previous_submission,
--     drop column if exists updated_at;
