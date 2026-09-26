#!/bin/sh
# Disposable local database only. No hosted project or provider traffic.
set -eu
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
pg_bin=${PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/ap-med-survey-lock.XXXXXX")
cleanup() {
  if [ -f "$work_dir/data/postmaster.pid" ]; then
    "$pg_bin/pg_ctl" -D "$work_dir/data" -m fast stop >/dev/null 2>&1 || true
  fi
  case "$work_dir" in "${TMPDIR:-/tmp}"/ap-med-survey-lock.*) rm -rf -- "$work_dir" ;; esac
}
trap cleanup EXIT INT TERM
"$pg_bin/initdb" -D "$work_dir/data" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$pg_bin/pg_ctl" -D "$work_dir/data" -l "$work_dir/postgres.log" -o "-k $work_dir -p 55461 -c listen_addresses=''" -w start >/dev/null
psql_local() { "$pg_bin/psql" -X -q -v ON_ERROR_STOP=1 -h "$work_dir" -p 55461 -d postgres "$@"; }
psql_local -f "$repo_root/database/baseline/supabase_compatibility_roles.sql"
for migration in "$repo_root"/supabase/migrations/*.sql; do psql_local -f "$migration"; done
psql_local -f "$repo_root/database/baseline/supabase_compatibility_grants.sql"
psql_local -f "$repo_root/database/verification/survey_mutation_lock.sql"

# Hold the cohort lock while the survey RPC starts. It must wait without
# locking the survey row, allowing closeout's survey-closing trigger to run.
cohort_id=33333333-3333-4333-8333-333333333333
survey_id=44444444-4444-4444-8444-444444444444
psql_local -c "set role service_role; insert into public.cohorts(id,name,org,status) values('$cohort_id','Race cohort','Verification','active'); insert into public.surveys(id,cohort_id,wave,title,questions,status) values('$survey_id','$cohort_id','mid_year','Race survey','[]','open')"
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
psql_local -c "set role service_role; set lock_timeout='5s'; select public.ascenso_mutate_survey('$survey_id','$cohort_id','99999999-9999-4999-8999-999999999999','close','open')" > "$work_dir/second.out" 2>&1 &
second_pid=$!
blocked=0
for _attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  blocked=$(psql_local -t -A -c "select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%select public.ascenso_mutate_survey%' and pid<>pg_backend_pid()")
  if [ "$blocked" -gt 0 ]; then break; fi
  sleep 0.1
done
test "$blocked" -gt 0
printf "update public.cohorts set status='closed' where id='%s'; commit;\n" "$cohort_id" >&3
exec 3>&-
wait "$first_pid"
if wait "$second_pid"; then echo 'Survey mutation unexpectedly succeeded after closeout' >&2; exit 1; fi
rg -q 'Closed cohorts cannot change surveys' "$work_dir/second.out"
psql_local -t -A -c "select status from public.cohorts where id='$cohort_id'" | rg -q '^closed$'
psql_local -t -A -c "select status from public.surveys where id='$survey_id'" | rg -q '^closed$'
echo 'Survey mutation lock-order verification passed.'
