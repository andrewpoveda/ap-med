#!/bin/sh
# Disposable local database only. No .env, hosted project or provider traffic.
set -eu
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
pg_bin=${PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/ap-med-phase5.XXXXXX")
mkdir -p "$work_dir/socket"
cleanup() {
  if [ -f "$work_dir/data/postmaster.pid" ]; then
    "$pg_bin/pg_ctl" -D "$work_dir/data" -m fast stop >/dev/null 2>&1 || true
  fi
  case "$work_dir" in "${TMPDIR:-/tmp}"/ap-med-phase5.*) rm -rf -- "$work_dir" ;; esac
}
trap cleanup EXIT INT TERM
"$pg_bin/initdb" -D "$work_dir/data" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$pg_bin/pg_ctl" -D "$work_dir/data" -l "$work_dir/postgres.log" -o "-k $work_dir/socket -p 55445 -c listen_addresses=''" -w start >/dev/null
psql_local() { "$pg_bin/psql" -X -q -v ON_ERROR_STOP=1 -h "$work_dir/socket" -p 55445 -d postgres "$@"; }
psql_local -f "$repo_root/database/baseline/supabase_compatibility_roles.sql"
for migration in "$repo_root"/supabase/migrations/*.sql; do
  # Backfill fixtures must be created before this migration and its successors.
  case "$migration" in *20260907235236_ascenso_truthful_reporting.sql) break ;; esac
  psql_local -f "$migration"
done
psql_local -f "$repo_root/database/baseline/supabase_compatibility_grants.sql"
psql_local -f "$repo_root/database/verification/phase2_operations.sql"
psql_local <<'SQL'
insert into public.cohort_matches(id,cohort_id,mentor_id,mentee_id,track,status,approved_at)
values('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666','test','active','2026-01-01');
SQL
psql_local -f "$repo_root/supabase/migrations/20260907235236_ascenso_truthful_reporting.sql"
psql_local <<'SQL'
do $$ declare pair uuid; begin
  assert (select activated_at is null from public.cohort_matches where id='77777777-7777-4777-8777-777777777777');
  insert into public.cohort_matches(cohort_id,mentor_id,mentee_id,track,status,approved_at)
    values('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','test','board_approved','2026-01-02') returning id into pair;
  assert (select activated_at is null from public.cohort_matches where id=pair);
  perform public.ascenso_match_action(pair,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','activate');
  assert (select activated_at>=now()-interval '1 minute' and approved_at='2026-01-02'::timestamptz from public.cohort_matches where id=pair);
  assert not exists(select 1 from public.cohort_matches m join public.cohort_operation_events e on e.target_id=m.id and e.action='match_activate' where m.activated_at is null);
  assert (select approved_at from public.cohort_matches where id='77777777-7777-4777-8777-777777777777')='2026-01-01'::timestamptz;
  update public.cohort_matches set activated_at=now() where id='77777777-7777-4777-8777-777777777777';
  assert (select activated_at is null from public.cohort_matches where id='77777777-7777-4777-8777-777777777777');
end $$;
SQL
echo 'Phase 5 local PostgreSQL verification passed.'
