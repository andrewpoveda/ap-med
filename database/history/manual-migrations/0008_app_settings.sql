-- 0008_app_settings.sql
-- A single-row settings table for runtime feature flags — values that must be
-- flippable from the Supabase Table Editor and take effect on the NEXT page
-- load, with no rebuild and no redeploy.
--
-- Why it exists: Ascenso's visibility used to live in the ASCENSO_PUBLIC env
-- var, read in three places. Vercel only applies an env change on a redeploy,
-- and `/` + `/sitemap.xml` baked the value in at build time, so "hide/show
-- Ascenso" was a deploy, not a switch. This table is the single source of
-- truth that replaces it.
--
-- Run manually in the Supabase SQL editor BEFORE deploying the code that reads
-- it (same run-before-deploy protocol as 0001-0007). Safe to run against a live
-- DB: it creates one table and one row, and touches nothing else.
--
-- IMPORTANT: this table is read by public marketing surfaces. Put only
-- public-safe values here — never a secret, a key, or anything whose mere
-- existence is sensitive.

create table if not exists app_settings (
  -- Singleton: the check constraint makes a second settings row impossible, so
  -- callers can hard-code `.eq('id', 1)` and never worry about which row wins.
  id              smallint primary key,
  ascenso_visible boolean not null default false,
  updated_at      timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

-- Same posture as every other table in this schema: RLS on, no policies. The
-- anon key can neither read nor write it; the app reads it with the
-- service-role client, and flips happen in the dashboard or via SQL below.
alter table app_settings enable row level security;

-- Default false: nothing changes for visitors until this is flipped by hand.
insert into app_settings (id, ascenso_visible)
values (1, false)
on conflict (id) do nothing;

-- Keep updated_at honest so the table doubles as a record of when the switch
-- was last thrown.
create or replace function app_settings_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_settings_set_updated_at on app_settings;
create trigger app_settings_set_updated_at
  before update on app_settings
  for each row execute function app_settings_touch_updated_at();

-- ---------------------------------------------------------------------------
-- THE SWITCH lives on /admin — an "Ascenso visibility" card at the top of the
-- cohorts page, super admins only, writing through PATCH /api/admin/app-settings.
-- That is the intended way to flip this; SQL is the fallback for when the admin
-- area itself is the thing that is broken. Either way it takes effect on the
-- next page load — no rebuild, no redeploy.
--
--   Show Ascenso:  update app_settings set ascenso_visible = true  where id = 1;
--   Hide Ascenso:  update app_settings set ascenso_visible = false where id = 1;
--   Check state:   select ascenso_visible, updated_at from app_settings;
--
-- Note this controls DISCOVERABILITY only (the homepage panel, /ascenso,
-- /ascenso/apply, the sitemap entries). It does NOT open or close applications
-- — that is still cohorts.status ('applications_open' vs anything else) — and
-- it never touches /ascenso/dashboard, /login, or /admin, which stay reachable
-- for existing members and the board in both states.
-- ---------------------------------------------------------------------------
