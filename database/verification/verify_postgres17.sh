#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
pg_bin=${PG17_BIN:-}

if [ -z "$pg_bin" ]; then
  for candidate in /opt/homebrew/opt/postgresql@17/bin /usr/local/opt/postgresql@17/bin; do
    if [ -x "$candidate/postgres" ]; then
      pg_bin=$candidate
      break
    fi
  done
fi

if [ -z "$pg_bin" ] || [ ! -x "$pg_bin/postgres" ]; then
  echo "PostgreSQL 17 was not found. Set PG17_BIN to its bin directory." >&2
  exit 1
fi

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/ap-med-pg17.XXXXXX")
data_dir=$work_dir/data
socket_dir=$work_dir/socket
mkdir -p "$socket_dir"

cleanup() {
  if [ -f "$data_dir/postmaster.pid" ]; then
    "$pg_bin/pg_ctl" -D "$data_dir" -m fast stop >/dev/null 2>&1 || true
  fi
  case "$work_dir" in
    "${TMPDIR:-/tmp}"/ap-med-pg17.*|/tmp/ap-med-pg17.*) rm -rf -- "$work_dir" ;;
    *) echo "Refusing to remove unexpected temporary path: $work_dir" >&2 ;;
  esac
}
trap cleanup EXIT INT TERM

"$pg_bin/initdb" -D "$data_dir" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$pg_bin/pg_ctl" -D "$data_dir" -o "-k $socket_dir -p 55439" -w start >/dev/null

psql_cmd="$pg_bin/psql -X -q -v ON_ERROR_STOP=1 -h $socket_dir -p 55439 -d postgres"

$psql_cmd -Atc "select current_setting('server_version_num')::int between 170000 and 179999" \
  | grep -qx t

$psql_cmd -f "$repo_root/database/baseline/supabase_compatibility_roles.sql" >/dev/null
$psql_cmd -f "$repo_root/supabase/migrations/20260827014254_production_baseline.sql" >/dev/null
$psql_cmd -f "$repo_root/database/baseline/bootstrap_data.sql" >/dev/null
$psql_cmd -f "$repo_root/supabase/migrations/20260827014255_waitlist.sql" >/dev/null
$psql_cmd -f "$repo_root/supabase/migrations/20260829042822_lock_down_mentor_mentee_direct_access.sql" >/dev/null
$psql_cmd -f "$repo_root/supabase/migrations/20260829065258_enforce_atomic_email_budget.sql" >/dev/null
$psql_cmd -f "$repo_root/database/baseline/supabase_compatibility_grants.sql" >/dev/null

$psql_cmd -AtF '|' -f "$repo_root/database/verification/catalog_signature.sql" \
  > "$work_dir/local_catalog_signature.txt"

if ! diff -u \
  "$repo_root/database/verification/production_catalog_signature.txt" \
  "$work_dir/local_catalog_signature.txt"; then
  echo "Local UUID defaults:" >&2
  $psql_cmd -AtF '|' -c "
    set search_path=public,extensions,pg_catalog;
    select c.relname,a.attname,pg_get_expr(ad.adbin,ad.adrelid,true)
    from pg_attrdef ad
    join pg_attribute a on a.attrelid=ad.adrelid and a.attnum=ad.adnum
    join pg_class c on c.oid=ad.adrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and a.attname='id'
    order by c.relname;
  " >&2
  exit 1
fi

[ "$($psql_cmd -Atc "select count(*) from public.app_settings where id = 1 and ascenso_visible = false")" = "1" ]
[ "$($psql_cmd -Atc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")" = "20" ]

[ "$($psql_cmd -Atc "set role anon; select count(*) from public.app_settings")" = "0" ]
[ "$($psql_cmd -Atc "set role service_role; select count(*) from public.app_settings")" = "1" ]

[ "$($psql_cmd -Atc "select relrowsecurity from pg_class where oid = 'public.mentor'::regclass")" = "t" ]
[ "$($psql_cmd -Atc "select relrowsecurity from pg_class where oid = 'public.mentees'::regclass")" = "t" ]
[ "$($psql_cmd -Atc "select count(*) from pg_policies where schemaname = 'public' and tablename in ('mentor', 'mentees')")" = "0" ]

for database_role in anon authenticated; do
  [ "$($psql_cmd -Atc "select has_table_privilege('$database_role', 'public.mentor', 'select,insert,update,delete')")" = "f" ]
  [ "$($psql_cmd -Atc "select has_table_privilege('$database_role', 'public.mentees', 'select,insert,update,delete')")" = "f" ]
done

[ "$($psql_cmd -Atc "select has_table_privilege('service_role', 'public.mentor', 'select,insert,update,delete')")" = "t" ]
[ "$($psql_cmd -Atc "select has_table_privilege('service_role', 'public.mentees', 'select,insert,update,delete')")" = "t" ]
[ "$($psql_cmd -Atc "select has_table_privilege('anon', 'public.email_budget_reservations', 'select,insert,update,delete')")" = "f" ]
[ "$($psql_cmd -Atc "select has_table_privilege('authenticated', 'public.email_budget_reservations', 'select,insert,update,delete')")" = "f" ]
[ "$($psql_cmd -Atc "select has_table_privilege('service_role', 'public.email_budget_reservations', 'select,insert,update,delete')")" = "t" ]
[ "$($psql_cmd -Atc "select has_function_privilege('anon', 'public.reserve_email_budget(integer)', 'execute')")" = "f" ]
[ "$($psql_cmd -Atc "select has_function_privilege('authenticated', 'public.reserve_email_budget(integer)', 'execute')")" = "f" ]
[ "$($psql_cmd -Atc "select has_function_privilege('service_role', 'public.reserve_email_budget(integer)', 'execute')")" = "t" ]

if $psql_cmd -c "set role anon; select count(*) from public.mentor" >/dev/null 2>&1; then
  echo "Expected anon mentor SELECT to be denied." >&2
  exit 1
fi

if $psql_cmd -c "set role anon; insert into public.mentees (full_name, email, school) values ('Blocked', 'blocked@example.test', 'Blocked')" >/dev/null 2>&1; then
  echo "Expected anon mentees INSERT to be denied." >&2
  exit 1
fi

$psql_cmd -c "
  begin;
  set local role service_role;
  insert into public.mentor (
    first_name, last_name, \"current_role\", institution, bio,
    current_stage, mentee_capacity, email
  ) values (
    'Disposable', 'Mentor', 'Physician', 'Test Institution', 'Test bio',
    'Attending Physician', '1', 'disposable-mentor@example.test'
  );
  insert into public.mentees (full_name, email, school)
  values ('Disposable Mentee', 'disposable-mentee@example.test', 'Test School');
  rollback;
" >/dev/null

if $psql_cmd -c "set role anon; select count(*) from public.waitlist" >/dev/null 2>&1; then
  echo "Expected anon to have no waitlist privileges." >&2
  exit 1
fi

if $psql_cmd -c "set role anon; select public.reserve_email_budget(2)" >/dev/null 2>&1; then
  echo "Expected anon email-budget reservation to be denied." >&2
  exit 1
fi

# At 88 actual sends, exactly one of eight concurrent two-slot reservations
# may succeed. The advisory lock makes the decision atomic.
$psql_cmd -c "
  set role service_role;
  insert into public.email_log (kind, recipient_email)
  select 'verification', 'quota-' || n || '@example.test'
  from generate_series(1, 88) as n;
" >/dev/null

i=1
while [ "$i" -le 8 ]; do
  (
    $psql_cmd -Atc "set role service_role; select coalesce(public.reserve_email_budget(2)::text, 'quota')"
  ) > "$work_dir/reservation-$i.txt" &
  i=$((i + 1))
done
wait

[ "$(rg -l '^[0-9a-f-]{36}$' "$work_dir"/reservation-*.txt | wc -l | tr -d ' ')" = "1" ]
[ "$(rg -l '^quota$' "$work_dir"/reservation-*.txt | wc -l | tr -d ' ')" = "7" ]

reservation_id=$(rg '^[0-9a-f-]{36}$' "$work_dir"/reservation-*.txt | sed 's/.*://')
[ "$($psql_cmd -Atc "select slots_remaining from public.email_budget_reservations where id = '$reservation_id'")" = "2" ]
[ "$($psql_cmd -Atc "set role service_role; select public.reserve_email_budget(1) is null")" = "t" ]
[ "$($psql_cmd -Atc "set role service_role; select public.release_email_budget_slots('$reservation_id', 2)")" = "0" ]
[ "$($psql_cmd -Atc "select count(*) from public.email_budget_reservations")" = "0" ]

# A definite mentor-send failure releases both slots. A successful mentor send
# is logged before one slot is released; a failed confirmation releases only
# its unused slot, leaving one actual-send row and no live reservation.
$psql_cmd -c "truncate public.email_log" >/dev/null
failed_reservation=$($psql_cmd -Atc "set role service_role; select public.reserve_email_budget(2)")
[ "$($psql_cmd -Atc "set role service_role; select public.release_email_budget_slots('$failed_reservation', 2)")" = "0" ]

partial_reservation=$($psql_cmd -Atc "set role service_role; select public.reserve_email_budget(2)")
$psql_cmd -c "
  set role service_role;
  insert into public.email_log (kind, recipient_email)
  values ('verification', 'mentor-send@example.test');
" >/dev/null
[ "$($psql_cmd -Atc "set role service_role; select public.release_email_budget_slots('$partial_reservation', 1)")" = "1" ]
[ "$($psql_cmd -Atc "set role service_role; select public.release_email_budget_slots('$partial_reservation', 1)")" = "0" ]
[ "$($psql_cmd -Atc "select count(*) from public.email_log")" = "1" ]
[ "$($psql_cmd -Atc "select count(*) from public.email_budget_reservations")" = "0" ]

# The existing pair-level unique constraint remains the final race guard. A
# reservation acquired before a duplicate insert can be released cleanly.
$psql_cmd -c "
  set role service_role;
  insert into public.mentor (
    id, first_name, last_name, \"current_role\", institution, bio,
    current_stage, mentee_capacity, email, approved
  ) values (
    '11111111-1111-4111-8111-111111111111',
    'Duplicate', 'Mentor', 'Physician', 'Test Institution', 'Test bio',
    'Attending Physician', '1', 'duplicate-mentor@example.test', true
  );
  insert into public.mentees (id, full_name, email, school)
  values (
    '22222222-2222-4222-8222-222222222222',
    'Duplicate Mentee', 'duplicate-mentee@example.test', 'Test School'
  );
  insert into public.mentee_requests (mentee_id, mentor_id)
  values (
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111'
  );
" >/dev/null

duplicate_reservation=$($psql_cmd -Atc "set role service_role; select public.reserve_email_budget(2)")
if $psql_cmd -c "
  set role service_role;
  insert into public.mentee_requests (mentee_id, mentor_id)
  values (
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111'
  );
" >/dev/null 2>&1; then
  echo "Expected duplicate mentor/mentee request to be rejected." >&2
  exit 1
fi
[ "$($psql_cmd -Atc "set role service_role; select public.release_email_budget_slots('$duplicate_reservation', 2)")" = "0" ]

echo "PostgreSQL 17 reconstruction, catalog, access, concurrency, cleanup, and deduplication checks passed."
