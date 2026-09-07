#!/bin/sh
# Only disposable local PostgreSQL; never reads .env or connects to a saved project.
set -eu
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
pg_bin=${PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}
if [ ! -x "$pg_bin/postgres" ]; then
  echo 'Set PG17_BIN to a PostgreSQL 17 bin directory.' >&2
  exit 1
fi
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/ap-med-phase2.XXXXXX")
data_dir=$work_dir/data
socket_dir=$work_dir/socket
mkdir -p "$socket_dir"
cleanup() {
  if [ -f "$data_dir/postmaster.pid" ]; then
    "$pg_bin/pg_ctl" -D "$data_dir" -m fast stop >/dev/null 2>&1 || true
  fi
  case "$work_dir" in
    "${TMPDIR:-/tmp}"/ap-med-phase2.*) rm -rf -- "$work_dir" ;;
  esac
}
trap cleanup EXIT INT TERM
"$pg_bin/initdb" -D "$data_dir" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$pg_bin/pg_ctl" -D "$data_dir" -l "$work_dir/postgres.log" -o "-k $socket_dir -p 55442 -c listen_addresses=''" -w start >/dev/null
psql_local() {
  "$pg_bin/psql" -X -q -v ON_ERROR_STOP=1 -h "$socket_dir" -p 55442 -d postgres "$@"
}
psql_local -f "$repo_root/database/baseline/supabase_compatibility_roles.sql"
psql_local -f "$repo_root/supabase/migrations/20260827014254_production_baseline.sql"
psql_local -f "$repo_root/supabase/migrations/20260827014255_waitlist.sql"
psql_local -f "$repo_root/supabase/migrations/20260829042822_lock_down_mentor_mentee_direct_access.sql"
psql_local -f "$repo_root/supabase/migrations/20260829065258_enforce_atomic_email_budget.sql"
psql_local -f "$repo_root/database/baseline/supabase_compatibility_grants.sql"

psql_local -f "$repo_root/supabase/migrations/20260906152802_exact_member_email_identity.sql"
psql_local -f "$repo_root/supabase/migrations/20260907140501_ascenso_pilot_operations.sql"
psql_local -f "$repo_root/database/verification/phase2_operations.sql"

# Competing selections really run in independent transactions. Exactly one
# wins; unique indexes protect both participant directions and stale tabs.
psql_local <<'SQL' &
begin;
insert into public.cohort_matches(cohort_id,mentor_id,mentee_id,track,status) values('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','55555555-5555-4555-8555-555555555555','test','board_approved');
select pg_sleep(1);
commit;
SQL
first_pid=$!
# A row lock from the first transaction need not be acquired first: either
# candidate may win. Gather both exit codes and assert one committed row.
set +e
psql_local <<'SQL'
insert into public.cohort_matches(cohort_id,mentor_id,mentee_id,track,status) values('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666','test','board_approved');
SQL
second_status=$?
wait "$first_pid"
first_status=$?
set -e
if [ "$first_status" -eq 0 ] && [ "$second_status" -eq 0 ]; then
  echo 'Concurrent conflicting selections both succeeded' >&2; exit 1
fi
psql_local <<'SQL'
do $$ begin
  assert (select count(*) from public.cohort_matches where mentor_id='33333333-3333-4333-8333-333333333333' and status='board_approved')=1;
end $$;
SQL
echo 'Phase 2 PostgreSQL checks passed, including concurrent selections.'
