-- 0005_mentor_availability.sql
-- Self-serve mentee scheduling: mentor bookable hours + magic-link tokens +
-- double-book guard.
--
-- STATUS: ALREADY APPLIED to prod (Andrew, Supabase SQL editor, 2026-07-18) in
-- two batches — the mentor_availability table first, then the mentee_requests
-- columns and both indexes. This file records the combined migration for repo
-- history and is idempotent (safe to re-run).
--
-- Design (scoped 2026-07-13):
--   * mentor_availability — one row per mentor. Weekly recurring windows stored
--     in the mentor's LOCAL time plus an IANA zone (a rule like "Tuesdays
--     16:00–18:00 ET" must survive DST, and only a zone name does that).
--     rules jsonb: [{ "day": 1, "start": "16:00", "end": "18:00" }, …] where
--     day is 0 (Sunday) – 6 (Saturday). Validated by the app at write time
--     (the app is the validation boundary); RLS-on/no-policies like
--     mentor_google_tokens.
--   * mentee_requests.schedule_token_hash — the mentee's booking link is a
--     256-bit random token; only its SHA-256 hash is stored, so a leaked DB row
--     never yields a bookable URL. Minted by /api/notify in the same insert
--     that records the request. UNIQUE for O(1) lookup by presented token.
--   * sessions partial unique index — two mentees passing the freebusy check
--     seconds apart cannot both book the same mentor slot; the second insert
--     violates the index and the API returns "slot taken".

begin;

create table if not exists mentor_availability (
  mentor_id    uuid primary key references mentor(id) on delete cascade,
  timezone     text not null,                -- IANA, e.g. 'America/New_York'
  rules        jsonb not null default '[]',  -- [{ "day": 1, "start": "16:00", "end": "18:00" }, …]
  slot_minutes int not null default 30,
  updated_at   timestamptz not null default now()
);

alter table mentor_availability enable row level security;

alter table mentee_requests
  add column if not exists schedule_token_hash text,
  add column if not exists schedule_token_expires_at timestamptz;

create unique index if not exists mentee_requests_schedule_token_hash_key
  on mentee_requests (schedule_token_hash);

create unique index if not exists sessions_mentor_slot_key
  on sessions (mentor_id, scheduled_at) where status = 'scheduled';

commit;
