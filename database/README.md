# Database reproducibility

The canonical blank-database path is intentionally split between portable
application schema and Supabase compatibility concerns.

## Files

- `baseline/pre_waitlist_schema.sql` — the 18-table application-owned schema at
  the logical cutoff immediately before the live waitlist migration.
- `../supabase/migrations/20260827014254_production_baseline.sql` — the active
  Supabase migration copy of the pre-waitlist baseline. It represents schema
  that already exists in production and must never be executed there.
- `../supabase/migrations/20260827014255_waitlist.sql` — the preserved 19th
  table and the migration already represented in production's Supabase ledger.
- `../supabase/migrations/20260829042822_lock_down_mentor_mentee_direct_access.sql`
  — removes direct `anon`/`authenticated` access to the two base application
  tables while preserving server-side `service_role` access.
- `../supabase/migrations/20260829065258_enforce_atomic_email_budget.sql` —
  adds the portable server-only reservation primitive used to enforce the
  account-wide email limit under concurrent notification requests.
- `baseline/bootstrap_data.sql` — the required `app_settings` singleton only;
  it contains no production user or program data.
- `baseline/supabase_compatibility_roles.sql` — optional `anon`,
  `authenticated`, and `service_role` roles for a clean standard PostgreSQL
  instance. It does not recreate Supabase Auth or PostgREST.
- `baseline/supabase_compatibility_grants.sql` — explicit current grants on
  application-owned objects. Supabase owner-specific default privileges are not
  copied.
- `history/manual-migrations/` — byte-identical archive copies of the original
  `0001`–`0010` historical/manual SQL, retained for auditability and never
  replayed after the baseline.
- `verification/catalog_signature.sql` — owner-independent catalog comparison.

## Clean PostgreSQL 17 order

Run as an administrative role:

1. `baseline/supabase_compatibility_roles.sql`
2. `../supabase/migrations/20260827014254_production_baseline.sql`
3. `baseline/bootstrap_data.sql`
4. `../supabase/migrations/20260827014255_waitlist.sql`
5. `../supabase/migrations/20260829042822_lock_down_mentor_mentee_direct_access.sql`
6. `../supabase/migrations/20260829065258_enforce_atomic_email_budget.sql`
7. `baseline/supabase_compatibility_grants.sql`

The compatibility role/grant files are separable. A future non-Supabase
runtime can replace them with its own login and role model without changing the
application-owned table schema.

The email budget uses a normal table, transaction-scoped advisory lock, and
`SECURITY INVOKER` PostgreSQL functions. Supabase exposes the functions through
RPC for the current server runtime, but only `service_role` may execute them;
another PostgreSQL provider can call the same functions over a standard SQL
connection without schema changes.

## Deliberate exclusions

- Production rows, including mentors, mentees, cohorts, admins, OAuth tokens,
  applications, logs, and the current live value of feature flags.
- `auth`, `storage`, `realtime`, `vault`, GraphQL, and other managed schemas.
- Supabase platform roles such as `authenticator`, `supabase_admin`, and
  `dashboard_user`.
- Supabase default privileges owned by `postgres` or `supabase_admin`.
- Platform-only extensions `pg_stat_statements`, `pgcrypto`, and
  `supabase_vault`; no application-owned object depends on them.

The required application extension is `uuid-ossp`, installed without an
explicit version so the target PostgreSQL installation selects its supported
default. `plpgsql` is supplied by PostgreSQL and is used by the single trigger
function.

Production also has `pgcrypto` installed. PostgreSQL 17 supplies the
application's `gen_random_uuid()` calls from `pg_catalog`; because pgcrypto has
a same-named compatibility function, production catalog rendering qualifies
the core function while a plain PostgreSQL installation does not. The catalog
comparison normalizes only that qualification and still compares every default
expression.

## Production safety

These files are a reconstruction artifact, not a pending production DDL change.
Do not apply the baseline to the existing production database. The baseline
version is recorded as already applied through Supabase migration-history
repair only; no schema statement from it is executed against production.

The baseline intentionally preserves the three policies that existed at its
historical cutoff. The later lockdown migration removes exactly those policies
and revokes direct `anon` and `authenticated` table privileges. Applications
must access `mentor` and `mentees` through the existing server-mediated paths.
