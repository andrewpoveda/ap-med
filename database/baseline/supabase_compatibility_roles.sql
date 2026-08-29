-- Optional compatibility roles for a clean standard PostgreSQL instance.
-- Run as a role with CREATEROLE. Do not run this on hosted Supabase: the
-- platform already owns and manages roles with these names.
--
-- These roles reproduce the database-facing role attributes used by the
-- current application. They do not reproduce Supabase Auth, PostgREST JWT role
-- switching, the authenticator login role, or any hosted platform service.

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin inherit nobypassrls;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin inherit nobypassrls;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin inherit bypassrls;
  end if;
end
$roles$;
