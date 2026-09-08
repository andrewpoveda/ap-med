#!/bin/sh
# Disposable local database only. No .env, hosted project or provider traffic.
set -eu
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
pg_bin=${PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/ap-med-phase7.XXXXXX")
mkdir -p "$work_dir/socket"
cleanup() {
  if [ -f "$work_dir/data/postmaster.pid" ]; then
    "$pg_bin/pg_ctl" -D "$work_dir/data" -m fast stop >/dev/null 2>&1 || true
  fi
  case "$work_dir" in "${TMPDIR:-/tmp}"/ap-med-phase7.*) rm -rf -- "$work_dir" ;; esac
}
trap cleanup EXIT INT TERM
"$pg_bin/initdb" -D "$work_dir/data" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$pg_bin/pg_ctl" -D "$work_dir/data" -l "$work_dir/postgres.log" -o "-k $work_dir/socket -p 55447 -c listen_addresses=''" -w start >/dev/null
psql_local() { "$pg_bin/psql" -X -q -v ON_ERROR_STOP=1 -h "$work_dir/socket" -p 55447 -d postgres "$@"; }
psql_local -f "$repo_root/database/baseline/supabase_compatibility_roles.sql"
for migration in "$repo_root"/supabase/migrations/*.sql; do
  # Preserve the pre-migration fixture boundary when later phases add migrations.
  case "$migration" in *20260908001057_ascenso_person_participations.sql) break ;; esac
  psql_local -f "$migration"
done
psql_local -f "$repo_root/database/baseline/supabase_compatibility_grants.sql"
psql_local -f "$repo_root/database/verification/phase2_operations.sql"
psql_local <<'SQL'
insert into public.cohort_matches(id,cohort_id,mentor_id,mentee_id,track,status)
values('71717171-7171-4171-8171-717171717171','11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','66666666-6666-4666-8666-666666666666','legacy','active');
insert into public.sessions(id,mentor_id,mentee_id,scheduled_at,status) values
('72727272-7272-4272-8272-727272727272','44444444-4444-4444-8444-444444444444','66666666-6666-4666-8666-666666666666',now()-interval '1 day','completed'),
('73737373-7373-4373-8373-737373737373','44444444-4444-4444-8444-444444444444','66666666-6666-4666-8666-666666666666',now(),'completed'),
('74747474-7474-4474-8474-747474747474','44444444-4444-4444-8444-444444444444','66666666-6666-4666-8666-666666666666',now()-interval '2 days','completed');
insert into public.meeting_logs(cohort_id,match_id,session_id,logged_by_type,logged_by_id,met_at)
values('11111111-1111-4111-8111-111111111111','71717171-7171-4171-8171-717171717171','74747474-7474-4474-8474-747474747474','mentor','44444444-4444-4444-8444-444444444444',current_date-2);
select public.ascenso_match_action('71717171-7171-4171-8171-717171717171','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','end','Legacy program completed');
SQL
psql_local <<'SQL'
insert into public.mentor(id,first_name,last_name,"current_role",institution,bio,current_stage,email,cohort_id)
values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Duplicate','Identity','','','','',' MENTOR@example.org ','11111111-1111-4111-8111-111111111111');
SQL
if psql_local -f "$repo_root/supabase/migrations/20260908001057_ascenso_person_participations.sql" >"$work_dir/expected-failure.log" 2>&1; then
  echo 'Expected ambiguous legacy identity migration failure' >&2
  exit 1
fi
psql_local <<'SQL'
do $$ begin
  assert to_regclass('public.people') is null;
  assert (select email from public.mentor where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')=' MENTOR@example.org ';
end $$;
delete from public.mentor where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
SQL
psql_local -f "$repo_root/supabase/migrations/20260908001057_ascenso_person_participations.sql"
psql_local <<'SQL'
do $$ begin
  assert (select match_id is null and cohort_id is null from public.sessions where id='72727272-7272-4272-8272-727272727272');
  assert (select match_id='71717171-7171-4171-8171-717171717171' from public.sessions where id='73737373-7373-4373-8373-737373737373');
  assert (select match_id='71717171-7171-4171-8171-717171717171' from public.sessions where id='74747474-7474-4474-8474-747474747474');
end $$;
SQL
psql_local -f "$repo_root/database/verification/phase7_participation.sql"
echo 'Phase 7 local PostgreSQL verification passed.'
