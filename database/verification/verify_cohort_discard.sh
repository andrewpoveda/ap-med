#!/bin/sh
# Disposable local database only. No hosted project or provider traffic.
set -eu
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
pg_bin=${PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/acd.XXXXXX")
cleanup() {
  if [ -f "$work_dir/data/postmaster.pid" ]; then
    "$pg_bin/pg_ctl" -D "$work_dir/data" -m fast stop >/dev/null 2>&1 || true
  fi
  case "$work_dir" in "${TMPDIR:-/tmp}"/acd.*) rm -rf -- "$work_dir" ;; esac
}
trap cleanup EXIT INT TERM
"$pg_bin/initdb" -D "$work_dir/data" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$pg_bin/pg_ctl" -D "$work_dir/data" -l "$work_dir/postgres.log" -o "-k $work_dir -p 55459 -c listen_addresses=''" -w start >/dev/null
psql_local() { "$pg_bin/psql" -X -q -v ON_ERROR_STOP=1 -h "$work_dir" -p 55459 -d postgres "$@"; }
psql_local -f "$repo_root/database/baseline/supabase_compatibility_roles.sql"
for migration in "$repo_root"/supabase/migrations/*.sql; do psql_local -f "$migration"; done
psql_local -f "$repo_root/database/baseline/supabase_compatibility_grants.sql"
psql_local -f "$repo_root/database/verification/cohort_discard.sql"

# Two-session race: a child insert waits on the setup cohort row while the
# discard transaction checks for linked records. Once discard commits, the
# waiting insert must see 'discarded' and fail rather than creating an orphan.
cohort_id=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee
actor_id=dddddddd-dddd-4ddd-8ddd-dddddddddddd
psql_local -c "set role service_role; insert into public.cohorts(id,name,org,status) values('$cohort_id','Race cohort','Race owner','setup')"
mkfifo "$work_dir/first.in"
psql_local -t -A < "$work_dir/first.in" > "$work_dir/first.out" 2>&1 &
first_pid=$!
exec 3> "$work_dir/first.in"
printf "set role service_role; begin; select id from public.cohorts where id='%s' for update; select 'LOCKED';\n" "$cohort_id" >&3
ready=0
for _attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if rg -q '^LOCKED$' "$work_dir/first.out"; then ready=1; break; fi
  sleep 0.1
done
test "$ready" -eq 1
psql_local -c "set role service_role; insert into public.admin_cohort_grants(admin_id,cohort_id) values('$actor_id','$cohort_id')" > "$work_dir/second.out" 2>&1 &
second_pid=$!
blocked=0
for _attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  blocked=$(psql_local -t -A -c "select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%insert into public.admin_cohort_grants%'")
  if [ "$blocked" -gt 0 ]; then break; fi
  sleep 0.1
done
test "$blocked" -gt 0
printf "select public.ascenso_set_cohort_discarded('%s','%s',true,'Race cleanup',0); commit;\n" "$cohort_id" "$actor_id" >&3
exec 3>&-
wait "$first_pid"
if wait "$second_pid"; then echo 'Concurrent insert unexpectedly succeeded' >&2; exit 1; fi
rg -q 'Discarded cohorts cannot receive new records' "$work_dir/second.out"
psql_local -c "select 1 from public.cohorts where id='$cohort_id' and status='discarded'" | rg -q '1'
echo 'Reversible setup cohort discard verification passed.'
