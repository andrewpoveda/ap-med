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
- `../supabase/migrations/20260906152802_exact_member_email_identity.sql` —
  adds the exact normalized identity columns required by member claims.
- `../supabase/migrations/20260907140501_ascenso_pilot_operations.sql` —
  adds the Phase 2 member lifecycle, match cardinality/end controls, and
  decision/introduction delivery recovery records.
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
7. `../supabase/migrations/20260906152802_exact_member_email_identity.sql`
8. `../supabase/migrations/20260907140501_ascenso_pilot_operations.sql`
9. `baseline/supabase_compatibility_grants.sql`

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

## Verification

The full reproducibility check requires a local PostgreSQL 17 installation and
uses an isolated temporary cluster:

```bash
./database/verification/verify_postgres17.sh
```

The focused client-contract tests use Node's built-in test runner:

```bash
node --test database/verification/email_budget_client.test.mjs
```

## Phase 1 email identity migration

`../supabase/migrations/20260906152802_exact_member_email_identity.sql` adds
indexed, stored generated `normalized_email` columns to `mentor` and `mentees`.
It preserves original email values, member IDs, auth links, existing indexes,
RLS and grants. It adds no unique constraint and does not merge legacy duplicates.

Apply this additive migration before deploying code that queries those columns.
Adding stored columns/indexes takes table locks and computes existing values;
choose an appropriate maintenance window based on actual table size. This work
does not establish that the migration has been applied to any hosted database.
No environment variables or provider-dashboard changes are required. Do not replay
the baseline against production. For a new blank database, run this migration after
the previously listed migration chain.

Focused verification (synthetic data in a disposable local PostgreSQL 17 cluster):

```sh
sh database/verification/verify_phase1.sh
node --test database/verification/phase1_security.test.mjs
```

The existing `verify_postgres17.sh` remains the historical baseline/catalog check;
the focused Phase 1 runner verifies this additive migration separately.
Rollback: revert dependent application code before considering column removal.
Prefer leaving the additive columns in place and fixing forward; reverting the
security code restores the original exposure. No production rollback was tested.

## Phase 2 pilot operations migration

`../supabase/migrations/20260907140501_ascenso_pilot_operations.sql` must follow
the Phase 1 normalized identity migration and precede the dependent application
deployment. The migration adds columns/tables/functions/triggers and partial
unique indexes; it does not rewrite or delete existing relationships.

The one-live-match indexes deliberately fail if existing proposed,
board-approved, or active rows already assign a mentor or mentee more than once.
Inspect and resolve any such conflicts deliberately before rollout. Take a
database backup and choose a maintenance window: adding constrained columns and
building indexes take locks. No hosted migration was run or production data
inspected during Phase 2.

The delivery state records provider acceptance, not inbox delivery. Its retry
path freezes the original message and reuses the same Resend idempotency key
inside the provider window. After that window, an administrator must check the
provider and record the outcome; the application does not blindly generate a
new key. No environment or provider configuration change is required.

Focused verification uses only synthetic data in a disposable PostgreSQL 17
cluster and local provider/framework stubs:

```sh
sh database/verification/verify_phase2.sh
node --test database/verification/phase2_operations.test.mjs
```

## Phase 3 member recovery migration

`../supabase/migrations/20260907192940_ascenso_member_recovery.sql` follows
Phase 2. It adds a durable calendar-cleanup flag to sessions, a unique non-null
meeting-log session index and a transactional session-log validation trigger,
plus a scoped support-config update function. It requires no environment or
external provider configuration changes. Apply before dependent code; no hosted
migration has been performed. Existing duplicate session-linked meeting logs
will block migration and must be reviewed without silently deleting history.

`sh database/verification/verify_phase3.sh` validates this chain in a disposable
PostgreSQL 17 database, including the Phase 2 SQL regression suite. It neither
reads credentials nor connects to a configured hosted project.
