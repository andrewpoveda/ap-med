#!/bin/sh
# Disposable local database only. No .env, hosted project or provider traffic.
set -eu
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
pg_bin=${PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/ap-med-phase4.XXXXXX")
mkdir -p "$work_dir/socket"
cleanup() {
  if [ -f "$work_dir/data/postmaster.pid" ]; then
    "$pg_bin/pg_ctl" -D "$work_dir/data" -m fast stop >/dev/null 2>&1 || true
  fi
  case "$work_dir" in "${TMPDIR:-/tmp}"/ap-med-phase4.*) rm -rf -- "$work_dir" ;; esac
}
trap cleanup EXIT INT TERM
"$pg_bin/initdb" -D "$work_dir/data" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$pg_bin/pg_ctl" -D "$work_dir/data" -l "$work_dir/postgres.log" -o "-k $work_dir/socket -p 55444 -c listen_addresses=''" -w start >/dev/null
psql_local() { "$pg_bin/psql" -X -q -v ON_ERROR_STOP=1 -h "$work_dir/socket" -p 55444 -d postgres "$@"; }
psql_local -f "$repo_root/database/baseline/supabase_compatibility_roles.sql"
for migration in "$repo_root"/supabase/migrations/*.sql; do
  psql_local -f "$migration"
done
psql_local -f "$repo_root/database/baseline/supabase_compatibility_grants.sql"
psql_local -f "$repo_root/database/verification/phase2_operations.sql"
psql_local -f "$repo_root/database/verification/phase4_delivery.sql"
echo 'Phase 4 local PostgreSQL verification passed.'
