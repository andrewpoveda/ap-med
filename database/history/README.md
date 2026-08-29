# Database migration history

`manual-migrations/` preserves byte-identical archive copies of the
repository's original `0001`–`0010` SQL. Those files document changes that were
applied manually in the Supabase SQL editor, but they are not a blank-database
migration chain:

- `0001` is data-only and assumes `mentor` and `mentees` already exist.
- `0002`–`0010` incrementally alter those pre-existing base tables.
- Production's Supabase migration ledger contains none of `0001`–`0010`.

Their final schema effects are consolidated into
`database/baseline/pre_waitlist_schema.sql`. Do not replay the archived files
after the baseline.

The active Supabase migration directory contains the reproducible baseline,
the waitlist migration, and the later access-hardening migration:

- `20260827014254_production_baseline.sql`
- `20260827014255_waitlist.sql`
- `20260829042822_lock_down_mentor_mentee_direct_access.sql`

The waitlist file is byte-identical to the former `0011_waitlist.sql`. The
baseline consolidates schema that already exists in production, so production
history reconciliation marks it applied without executing its SQL.

The lockdown migration is an ordinary forward migration. It drops the three
historical permissive policies and removes direct `anon` and `authenticated`
table privileges from `mentor` and `mentees`, without changing `service_role`.

No archived file should be applied to production as part of baselining.
