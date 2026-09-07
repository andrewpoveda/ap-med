#!/bin/sh
# Disposable local database only. No .env, hosted project or provider traffic.
set -eu
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
pg_bin=${PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/ap-med-phase3.XXXXXX")
mkdir -p "$work_dir/socket"
cleanup() {
  if [ -f "$work_dir/data/postmaster.pid" ]; then
    "$pg_bin/pg_ctl" -D "$work_dir/data" -m fast stop >/dev/null 2>&1 || true
  fi
  case "$work_dir" in "${TMPDIR:-/tmp}"/ap-med-phase3.*) rm -rf -- "$work_dir" ;; esac
}
trap cleanup EXIT INT TERM
"$pg_bin/initdb" -D "$work_dir/data" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$pg_bin/pg_ctl" -D "$work_dir/data" -l "$work_dir/postgres.log" -o "-k $work_dir/socket -p 55443 -c listen_addresses=''" -w start >/dev/null
psql_local() { "$pg_bin/psql" -X -q -v ON_ERROR_STOP=1 -h "$work_dir/socket" -p 55443 -d postgres "$@"; }
psql_local -f "$repo_root/database/baseline/supabase_compatibility_roles.sql"
for migration in "$repo_root"/supabase/migrations/*.sql; do
  psql_local -f "$migration"
done
psql_local -f "$repo_root/database/baseline/supabase_compatibility_grants.sql"
psql_local -f "$repo_root/database/verification/phase2_operations.sql"
psql_local <<'SQL'
do $$ declare pair uuid; booked uuid; c uuid:='11111111-1111-4111-8111-111111111111'; begin
  insert into public.cohort_matches(cohort_id,mentor_id,mentee_id,track,status)
    values(c,'33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666','test','active') returning id into pair;
  insert into public.sessions(mentor_id,mentee_id,scheduled_at,status)
    values('33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666',now()-interval '1 day','scheduled') returning id into booked;
  insert into public.meeting_logs(cohort_id,match_id,session_id,logged_by_type,logged_by_id,met_at)
    values(c,pair,booked,'mentee','66666666-6666-4666-8666-666666666666',current_date);
  assert (select status from public.sessions where id=booked)='completed';
  begin
    insert into public.meeting_logs(cohort_id,match_id,session_id,logged_by_type,logged_by_id,met_at)
      values(c,pair,booked,'mentor','33333333-3333-4333-8333-333333333333',current_date);
    raise exception 'Expected session deduplication';
  exception when unique_violation then null; end;
  update public.sessions set status='cancelled' where id=booked;
  begin
    insert into public.meeting_logs(cohort_id,match_id,session_id,logged_by_type,logged_by_id,met_at)
      values(c,pair,booked,'mentor','33333333-3333-4333-8333-333333333333',current_date);
    raise exception 'Expected cancelled-session denial';
  exception when check_violation then null; end;
  update public.sessions set status='scheduled',scheduled_at=now()+interval '1 day' where id=booked;
  begin
    insert into public.meeting_logs(cohort_id,match_id,session_id,logged_by_type,logged_by_id,met_at)
      values(c,pair,booked,'mentor','33333333-3333-4333-8333-333333333333',current_date);
    raise exception 'Expected future-session denial';
  exception when check_violation then null; end;
  perform public.ascenso_update_support(c,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"name":"Program","email":"help@example.org","instructions":"Contact us"}');
  assert (select config->'support'->>'email' from public.cohorts where id=c)='help@example.org';
  assert not has_function_privilege('authenticated','public.ascenso_update_support(uuid,uuid,jsonb)','EXECUTE');
end $$;
SQL
echo 'Phase 3 local PostgreSQL verification passed.'
