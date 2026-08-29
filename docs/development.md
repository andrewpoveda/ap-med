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

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Resend: `RESEND_API_KEY`
- Turnstile: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, plus optional hostname/action allowlists
- Google Calendar: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, optional `GOOGLE_OAUTH_REDIRECT_URI`, and `GOOGLE_TOKEN_ENC_KEY`
- scheduled digest: `CRON_SECRET` and optional `DIGEST_COOLDOWN_DAYS`
- optional telemetry/build integration: PostHog and Sentry variables referenced by current source

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
