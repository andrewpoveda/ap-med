-- 0003_mentor_approved.sql
-- Moderation gate for self-service mentor submissions.
--
-- POST /api/mentor is a public, CAPTCHA-only endpoint, and GET /api/mentor feeds
-- the public directory directly. Without a gate, any submission is live (and its
-- public fields rendered) the instant it is inserted — contradicting the "Andrew
-- will review your submission … once your profile is live" copy. This adds an
-- `approved` flag: new rows default to FALSE and are hidden from the directory
-- and the matcher until manually set TRUE.
--
-- Run manually in the Supabase SQL editor BEFORE deploying the matching code
-- change (GET /api/mentor filters on `approved`, so the column must exist first
-- — same run-before-deploy protocol as 0001 / 0002).

begin;

alter table mentor
  add column if not exists approved boolean not null default false;

-- Backfill: the existing directory mentors are already vetted — keep them live.
-- (At migration time every existing row is one of the known-good mentors.)
update mentor set approved = true where approved = false;

commit;

-- To approve a new submission later:
--   update mentor set approved = true where id = '<mentor-uuid>';
