# Authentication and Access

Read this document for work on login, OAuth callbacks, role resolution, dashboards, admin routes, cohort-member writes, or Supabase access controls.

## Account resolution

`/login` is the shared Google sign-in door for mentors and Ascenso cohort mentees. `src/app/auth/callback/route.ts` derives identity from the verified Supabase auth user; role is not trusted from request data. `src/lib/account-role.ts` resolves and claims member rows by verified email in this order:

1. an explicitly selected, owned active participation, if a selection exists
2. otherwise a general mentor, then a cohort mentor, then a cohort mentee
3. no accessible participation (an invalid selection offers recovery through `/ascenso/programs`)

The stable `people` row owns the verified auth identity. Mentor/mentee rows are role/cohort participations and keep their historical IDs; one person can hold multiple roles or cohorts without moving older records. `src/lib/participation.ts` resolves ownership and active participation, while `mentor-link`/`mentee-link` retain their caller-facing interfaces. Default navigation remains mentor-first. General-platform mentees remain auth-less and are never claim targets. The legacy emailed-link flow leads to the participation chooser.

Successful mentor sign-in lands on `/dashboard`; cohort-mentee sign-in lands on `/ascenso/dashboard`. Do not duplicate role state into user-controlled metadata or add a second independent login model.

## Route and data posture

`src/proxy.ts` refreshes Supabase sessions for dashboard, Ascenso, and admin path families. Individual pages and route handlers still enforce authorization; the proxy matcher is not the permission boundary.

- Member reads and writes re-resolve the signed-in actor, active match, and `cohort_id` on the server.
- Cohort administrators require explicit active `admin_cohort_grants`; the legacy `admin_users.cohort_id` field no longer authorizes access. Super administrators may cross cohorts where the route explicitly permits it. Disabled identities and zero-grant scoped identities fail closed.
- Cron routes authenticate separately with `CRON_SECRET`; they are not session-authenticated.
- The service-role key and privileged Supabase client are server-only. Never expose them through `NEXT_PUBLIC_*`, a Client Component, or a browser response.

The active migration chain removes direct `anon` and `authenticated` table privileges from `mentor` and `mentees`. Public reads and writes are therefore mediated by server routes. Consult `database/README.md` and active migrations before changing this boundary.

Repository files do not prove which users, administrators, OAuth test users, redirect URIs, or policies currently exist in a deployed environment. Check live configuration only when authorized and necessary.

## Exact email identity

Member ownership and promotion use `normalizeEmail` (trim + lowercase) and exact
`normalized_email` equality, never pattern matching. The additive migration
`20260906152802_exact_member_email_identity.sql` generates indexed normalized
columns without rewriting stored addresses or merging identities. Apply it before
deploying the dependent code. Ambiguous normalized cohort identities fail closed;
multiple general mentee submissions remain valid. Administrator lookup retains
exact equality on lowercased `admin_users.email`. Claims also condition their write
on the same normalized address and an unclaimed auth link.

Phase 7 moves that claim into the server-only `ascenso_claim_person` transaction. It locks the exact stable identity and rejects a different existing auth owner or an auth user already assigned elsewhere. Legacy role-row auth IDs remain historical compatibility fields, not the authorization source; reports read identity linkage through `people`. No claim rewrites cohort membership or profile history.

The host-only HttpOnly participation cookie is a preference, never a grant. Every member lookup revalidates the selected record against the authenticated person's active memberships. Invalid/removed selections do not silently fall through to another program. Resource-specific match/cohort checks remain in each write path. Availability saves include the rendered mentor participation ID, and Calendar OAuth binds completion to its initiating participation so switching tabs/programs cannot redirect credentials.

New cohort sessions carry explicit match/cohort identity. Composite foreign keys and polymorphic reference guards enforce matching program context for matches, goals, logs, survey responses, milestones and application-member linkage. Historical session attribution is backfilled only from a linked log or known activation window; unknown context stays unknown. Program participation IDs remain the reference used by Calendar credentials/availability; credentials are not copied into new enrollments. A shared person-level booking check prevents overlapping 30-minute sessions across roles/programs.
