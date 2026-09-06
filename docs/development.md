# Development and Verification

Read this document for local setup, environment-variable names, worktrees, or verification. It intentionally contains no secret values or production snapshot.

## Setup

Use the Node/npm versions compatible with `package.json` and `package-lock.json`:

```bash
npm install
npm run dev
```

Local secrets belong in the ignored `.env.local`. A new Git worktree does not inherit that file; configure it separately rather than copying values into tracked documentation.

Environment-variable families used by the application include:

- public origins and Ascenso routing: optional `AP_MED_SITE_URL` (defaults to
  `https://ap-med.org`), optional `ASCENSO_SITE_URL`, and `ASCENSO_COHORT_ID`
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Resend: `RESEND_API_KEY`
- Turnstile: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, plus optional hostname/action allowlists
- Google Calendar: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, optional `GOOGLE_OAUTH_REDIRECT_URI`, and `GOOGLE_TOKEN_ENC_KEY`
- scheduled digest: `CRON_SECRET` and optional `DIGEST_COOLDOWN_DAYS`
- optional telemetry/build integration: PostHog and Sentry variables referenced by current source

`ASCENSO_SITE_URL` must be an origin only (for example,
`https://ascenso.example.org`), without a path, query, or fragment. Its exact
hostname activates the Ascenso navigation/footer and redirects that hostname's
root to `/ascenso`. It is also the deterministic base for Ascenso login, magic
link, digest, canonical, sitemap, and Google Calendar callback URLs. Leave it
unset until that hostname is ready to serve the deployment. `ASCENSO_COHORT_ID`
must be the UUID of the one cohort that accepts public Ascenso applications;
missing or invalid configuration fails closed.

Before connecting an Ascenso hostname, configure the same exact origin with the
external providers. Repository configuration cannot make these dashboard
changes:

- Vercel: attach and verify the custom domain and DNS/TLS.
- Supabase Auth: allow `<ASCENSO_SITE_URL>/auth/callback` as a redirect URL and,
  while the deprecated mentee magic-link flow remains enabled,
  `<ASCENSO_SITE_URL>/ascenso/auth/callback` as well.
- Google Cloud: allow `<ASCENSO_SITE_URL>/api/google/callback` for the Calendar
  OAuth client. `GOOGLE_OAUTH_REDIRECT_URI` remains the AP MED/default-host
  override; the configured Ascenso host uses `ASCENSO_SITE_URL`.
- Cloudflare Turnstile: allow the Ascenso hostname on the widget and include it
  in `TURNSTILE_ALLOWED_HOSTNAMES`.
- Sentry: include the Ascenso hostname in the project's browser Allowed Domains.

Production public origins should use HTTPS. Auth cookies intentionally remain
host-only: users sign in separately on unrelated AP MED and customer domains.
The application does not attempt cross-domain session sharing.

Use local/test provider credentials where required. Public form submissions fail closed when Turnstile server configuration is absent; use the provider's supported test configuration rather than bypassing validation in application code.

## Checks

Choose checks proportional to the change:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

There is no general `npm test` script. Database changes have focused checks documented in `database/README.md`. For documentation-only work, validate links/paths, formatting, and the Git diff; an application build is normally unnecessary.

Repository configuration shows intended behavior, not deployed truth. When a task depends on current environment variables, migrations, flags, logs, quotas, or provider state, inspect the authorized live source instead of updating docs from an assumption.
