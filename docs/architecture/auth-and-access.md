# Authentication and Access

Read this document for work on login, OAuth callbacks, role resolution, dashboards, admin routes, cohort-member writes, or Supabase access controls.

## Account resolution

`/login` is the shared Google sign-in door for mentors and Ascenso cohort mentees. `src/app/auth/callback/route.ts` derives identity from the verified Supabase auth user; role is not trusted from request data. `src/lib/account-role.ts` resolves and claims member rows by verified email in this order:

1. mentor, including cohort mentors
2. Ascenso cohort mentee
3. no linked account

Mentor precedence is load-bearing because claiming both rows would attach two roles to one auth identity. General-platform mentees remain auth-less and are never claim targets. Ascenso also retains a server-mediated magic-link fallback for cohort mentees; it does not apply to general mentees.

Successful mentor sign-in lands on `/dashboard`; cohort-mentee sign-in lands on `/ascenso/dashboard`. Do not duplicate role state into user-controlled metadata or add a second independent login model.

## Route and data posture

`src/proxy.ts` refreshes Supabase sessions for dashboard, Ascenso, and admin path families. Individual pages and route handlers still enforce authorization; the proxy matcher is not the permission boundary.

- Member reads and writes re-resolve the signed-in actor, active match, and `cohort_id` on the server.
- Cohort administrators are limited to their assigned cohort. Super administrators may cross cohorts where the route explicitly permits it.
- Cron routes authenticate separately with `CRON_SECRET`; they are not session-authenticated.
- The service-role key and privileged Supabase client are server-only. Never expose them through `NEXT_PUBLIC_*`, a Client Component, or a browser response.

The active migration chain removes direct `anon` and `authenticated` table privileges from `mentor` and `mentees`. Public reads and writes are therefore mediated by server routes. Consult `database/README.md` and active migrations before changing this boundary.

Repository files do not prove which users, administrators, OAuth test users, redirect URIs, or policies currently exist in a deployed environment. Check live configuration only when authorized and necessary.
