#!/bin/sh
# Only disposable local PostgreSQL; never reads .env or connects to a saved project.
set -eu
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
pg_bin=${PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}
if [ ! -x "$pg_bin/postgres" ]; then
  echo 'Set PG17_BIN to a PostgreSQL 17 bin directory.' >&2
  exit 1
fi
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/ap-med-phase1.XXXXXX")
data_dir=$work_dir/data
socket_dir=$work_dir/socket
mkdir -p "$socket_dir"
cleanup() {
  if [ -f "$data_dir/postmaster.pid" ]; then
    "$pg_bin/pg_ctl" -D "$data_dir" -m fast stop >/dev/null 2>&1 || true
  fi
  case "$work_dir" in
    "${TMPDIR:-/tmp}"/ap-med-phase1.*) rm -rf -- "$work_dir" ;;
  esac
}
trap cleanup EXIT INT TERM
"$pg_bin/initdb" -D "$data_dir" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$pg_bin/pg_ctl" -D "$data_dir" -l "$work_dir/postgres.log" -o "-k $socket_dir -p 55441 -c listen_addresses=''" -w start >/dev/null
psql_local() {
  "$pg_bin/psql" -X -q -v ON_ERROR_STOP=1 -h "$socket_dir" -p 55441 -d postgres "$@"
}
psql_local -f "$repo_root/database/baseline/supabase_compatibility_roles.sql"
psql_local -f "$repo_root/supabase/migrations/20260827014254_production_baseline.sql"
psql_local -f "$repo_root/supabase/migrations/20260827014255_waitlist.sql"
psql_local -f "$repo_root/supabase/migrations/20260829042822_lock_down_mentor_mentee_direct_access.sql"
psql_local -f "$repo_root/supabase/migrations/20260829065258_enforce_atomic_email_budget.sql"
psql_local -f "$repo_root/database/baseline/supabase_compatibility_grants.sql"

# Populate legacy rows BEFORE adding generated columns, including identities
# that trim to the same value. The additive migration must not merge them.
psql_local <<'SQL'
insert into public.cohorts (id, name, org) values ('11111111-1111-4111-8111-111111111111', 'Test', 'Test');
insert into public.mentor (first_name, last_name, "current_role", institution, bio, current_stage, email)
select 'Test', 'Member', 'Student', 'School', '', '', address from unnest(array[
  'alex.smith@example.org', E' \tAlEx_SmItH@Example.org\n', 'alex%smith@example.org',
  'alex*smith@example.org', 'same@example.org', ' SAME@example.org ', U&'\00A0unicode@example.org\FEFF'
]) address;
insert into public.mentees (email, cohort_id)
select email, '11111111-1111-4111-8111-111111111111'::uuid from public.mentor;
SQL
psql_local -f "$repo_root/supabase/migrations/20260906152802_exact_member_email_identity.sql"
psql_local <<'SQL'
do $$
declare tbl text; n integer; original text; role_name text;
begin
  assert current_setting('server_version_num')::int between 170000 and 179999;
  foreach tbl in array array['mentor', 'mentees'] loop
    execute format('select count(*) from public.%I', tbl) into n;
    assert n = 7, 'Migration changed row count';
    execute format('select count(*) from public.%I where normalized_email = $1', tbl) into n using 'alex_smith@example.org';
    assert n = 1, 'Underscore was interpreted as a wildcard';
    execute format('select email from public.%I where normalized_email = $1', tbl) into original using 'alex_smith@example.org';
    assert original = E' \tAlEx_SmItH@Example.org\n', 'Legacy email was rewritten';
    execute format('select count(*) from public.%I where normalized_email = $1', tbl) into n using 'alex%smith@example.org';
    assert n = 1, 'Percent was interpreted as a wildcard';
    execute format('select count(*) from public.%I where normalized_email = $1', tbl) into n using 'alex*smith@example.org';
    assert n = 1, 'Star was interpreted as a wildcard';
    execute format('select count(*) from public.%I where normalized_email = $1', tbl) into n using 'same@example.org';
    assert n = 2, 'Ambiguous legacy identities were silently merged';
    execute format('select count(*) from public.%I where normalized_email = $1', tbl) into n using 'unicode@example.org';
    assert n = 1, 'Unicode edge whitespace was not normalized';
    execute format('update public.%I set email = $1 where normalized_email = $2', tbl) using ' NEW@example.org ', 'alex*smith@example.org';
    execute format('select count(*) from public.%I where normalized_email = $1', tbl) into n using 'new@example.org';
    assert n = 1, 'Generated identity did not track email change';
    assert (select relrowsecurity from pg_class where oid = ('public.' || tbl)::regclass);
    foreach role_name in array array['anon', 'authenticated'] loop
      assert not has_column_privilege(role_name, 'public.' || tbl, 'normalized_email', 'SELECT'), 'Client can read normalized email';
    end loop;
    assert has_column_privilege('service_role', 'public.' || tbl, 'normalized_email', 'SELECT');
  end loop;
end $$;
SQL
echo 'Phase 1 PostgreSQL checks passed: legacy preservation, literal equality, generated updates, ambiguity, RLS/grants.'
