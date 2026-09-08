#!/bin/sh
# Synthetic local database only; no hosted services or environment credentials.
set -eu
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
pg_bin=${PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/ap-med-phase11.XXXXXX")
mkdir -p "$work_dir/socket"
cleanup() {
  if [ -f "$work_dir/data/postmaster.pid" ]; then
    "$pg_bin/pg_ctl" -D "$work_dir/data" -m fast stop >/dev/null 2>&1 || true
  fi
  case "$work_dir" in "${TMPDIR:-/tmp}"/ap-med-phase11.*) rm -rf -- "$work_dir" ;; esac
}
trap cleanup EXIT INT TERM
"$pg_bin/initdb" -D "$work_dir/data" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$pg_bin/pg_ctl" -D "$work_dir/data" -l "$work_dir/postgres.log" -o "-k $work_dir/socket -p 55451 -c listen_addresses=''" -w start >/dev/null
psql_local() { "$pg_bin/psql" -X -q -v ON_ERROR_STOP=1 -h "$work_dir/socket" -p 55451 -d postgres "$@"; }
psql_local -f "$repo_root/database/baseline/supabase_compatibility_roles.sql"
for migration in "$repo_root"/supabase/migrations/*.sql; do psql_local -f "$migration"; done
psql_local -f "$repo_root/database/baseline/supabase_compatibility_grants.sql"
psql_local -f "$repo_root/database/verification/phase2_operations.sql"
psql_local -f "$repo_root/database/verification/phase8_history.sql"
"$pg_bin/pg_dump" -h "$work_dir/socket" -p 55451 -d postgres -Fc -f "$work_dir/synthetic.dump"
"$pg_bin/createdb" -h "$work_dir/socket" -p 55451 restored
"$pg_bin/pg_restore" -h "$work_dir/socket" -p 55451 -d restored --exit-on-error "$work_dir/synthetic.dump"
for table in people mentor mentees cohorts cohort_matches cohort_operation_events cohort_delivery; do
  original=$(psql_local -Atc "select count(*) from public.$table")
  restored=$("$pg_bin/psql" -X -q -At -h "$work_dir/socket" -p 55451 -d restored -c "select count(*) from public.$table")
  test "$original" = "$restored"
done
"$pg_bin/psql" -X -q -v ON_ERROR_STOP=1 -h "$work_dir/socket" -p 55451 -d restored <<'SQL'
do $$ begin
  assert not exists(select 1 from pg_constraint where connamespace='public'::regnamespace and not convalidated);
  assert not has_table_privilege('authenticated','public.people','SELECT');
  assert exists(select 1 from public.cohort_operation_events where action='match_reassigned');
  assert exists(select 1 from public.cohort_delivery);
end $$;
SQL
echo 'Phase 11 local PostgreSQL verification passed.'
