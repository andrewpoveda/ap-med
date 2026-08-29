# AP MED Mentors

AP MED connects pre-medical students with mentors through a public matching directory and supports the separately scoped Ascenso mentorship cohort. The application is built with Next.js and TypeScript, with Supabase for data and authentication, Resend for transactional email, and Turnstile for public-form protection.

Repository documentation describes code-controlled behavior only. Deployed settings, feature flags, migration status, and production data must be checked at the source when a task requires them.

## Local development

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Common verification commands:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Local configuration belongs in `.env.local`, which is intentionally untracked. See `docs/development.md` for setup guidance and environment-variable names.

## Documentation map

- `AGENTS.md` — short canonical context and durable invariants
- `docs/architecture/matching-and-public-data.md` — matching, data boundaries, and public projections
- `docs/architecture/auth-and-access.md` — sign-in, roles, route protection, and database access
- `docs/features/ascenso.md` — current cohort behavior and isolation rules
- `docs/operations/email-and-calendar.md` — delivery budgets, digests, scheduling, and Calendar integration
- `docs/development.md` — local setup and verification
- `database/README.md` — active migration workflow and database reproducibility

Historical plans, audits, and snapshots live under `docs/history/` and `database/history/` or in the external AP MED Vault. They are preserved as dated records and are not current implementation guidance.
