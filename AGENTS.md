# AP MED Mentors — Project Context

This file is the canonical automatic context for the repository. Keep it short and limited to durable facts verified in source control. Do not treat documentation, a dated snapshot, or an old implementation plan as evidence of live production state.

## Product and architecture

- AP MED is a Next.js App Router/TypeScript platform for public mentor matching and Ascenso cohort administration. `package.json` is authoritative for framework versions and commands.
- Supabase provides data and authentication; Resend sends transactional email; Turnstile protects public writes. Secrets and service-role clients must remain server-only.
- General-platform mentor and mentee records use `cohort_id is null`. Cohort records must be scoped to the authenticated member or administrator and the relevant `cohort_id`.
- Google sign-in is shared by mentors and Ascenso members. Default resolution is mentor-first; an explicit participation selection must be owned and active. General-platform mentees do not have accounts.

## Invariants

- Matching is deterministic: identity 40%, specialty 35%, requested help 25% (`src/lib/match.ts`). Tags use exact canonical values from `src/data/specialties.ts` and `src/data/tags.ts`; changing stored labels requires an explicit compatibility or migration plan.
- Client-reachable mentor data must use `PUBLIC_MENTOR_COLUMNS` and `toPublicMentor` from `src/types/mentor.ts`. Never expose unrestricted mentor rows or email addresses.
- Public database mutations go through server routes with validation and Turnstile where applicable. Do not add direct browser writes to Supabase.
- Mentor email is sent only after an explicit request. Recipient addresses are resolved on the server. Match notifications reserve their two-message daily budget atomically; preserve the accounting and idempotency guarantees.
- Active migration truth is `supabase/migrations/`, explained in `database/README.md`. `database/history/` and manual migrations are records, not an executable migration chain.

## Work practices

- Inspect current code and configuration before relying on prose. Never infer deployed values, row counts, feature-flag state, provider configuration, or migration application status from the repository.
- Keep unrelated user changes intact. Do not alter production services or data unless the task explicitly authorizes it.
- Before handing off code changes, run the relevant checks. Standard checks are `npm run lint`, `npx tsc --noEmit`, and `npm run build`; use narrower checks when the task is documentation-only.

## Read only when relevant

- Matching, onboarding, directory, or public mentor data: `docs/architecture/matching-and-public-data.md`
- Login, authorization, admin, dashboards, or member writes: `docs/architecture/auth-and-access.md`
- Ascenso cohort features or administration: `docs/features/ascenso.md`
- Email, digests, scheduling, or Google Calendar: `docs/operations/email-and-calendar.md`
- Local setup, environment variables, or verification: `docs/development.md`
- Database schema, migrations, or data-access work: `database/README.md` and the scoped `.cursor/rules/database-data-access-portability.mdc`

Do not preload `docs/history/`, `database/history/`, the external AP MED Vault, build logs, audits, or planning documents. Consult them only for an explicitly historical question.

## Git and commit behavior

- Prefer multiple small, coherent commits over one large commit whenever the work naturally contains separate logical changes.
- Treat each independently complete feature, fix, refactor, test addition, documentation change, or roadmap phase as a separate commit when practical.
- Each commit should represent one meaningful unit of work that can be understood, reviewed, reverted, or cherry-picked independently.
- For multi-step plans, audits, or roadmaps, preserve logical commit boundaries between independently complete phases or items when practical; do not wait until the end and collapse the entire task into one commit.
- Use clear Conventional Commit-style messages such as `feat(...)`, `fix(...)`, `docs(...)`, `test(...)`, `refactor(...)`, or `chore(...)`.
- Run appropriate focused validation before committing each logical unit of work.
- Before committing, inspect the working tree and staged diff to ensure unrelated pre-existing changes are not included.
- Do not combine unrelated changes into the same commit.
- Do not create artificial, empty, no-op, typo-only, or otherwise unnecessary commits solely to increase commit count.
- Do not artificially split a single indivisible change into multiple commits.
- Preserve unrelated uncommitted work and never include it in a commit unless explicitly requested.
- Do not squash completed logical commits at the end of a task unless explicitly requested.
- At the end of the task, report all commits created during the task in chronological order, including each commit hash and message.