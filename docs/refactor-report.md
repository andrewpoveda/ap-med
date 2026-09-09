# Repository compression audit

Scope: behavior-preserving refactor on `codex/token-efficient-refactor`. Baseline:
303 tracked files, 198 files under `src/`, 29,046 source lines (including CSS,
blank lines and comments; counted with `wc -l`). Untracked `artifacts/` and
`outputs/` are excluded and untouched.

## Evidence and plan

- Runtime: package.json specifies Next 16 App Router, React 19 and strict
  TypeScript. Pages/layouts/route handlers and instrumentation are framework
  entry points, not dead files when absent from the import graph.
- Routing: public marketing, directory/onboarding, mentor dashboard, Ascenso
  applications/programs/dashboard and admin cohort subroutes; API routes handle
  writes, exports, Calendar OAuth, booking and digest cron. Preserve every route.
- Auth: proxy refreshes host-only sessions; account-role/participation resolve
  owned active roles mentor-first. Admin grants and resource checks are separate.
  Keep these decisions and cookie behavior intact.
- Data: service-role access remains server-side. Public mentors use the explicit
  projection; general records have null cohort_id. complete-query handles paged
  exports. Migrations and verification scripts remain operational records.
- Client boundaries: interactive forms, booking controls, analytics and directory
  filters need client execution. Most admin reading/reporting pages are server
  components. Do not merge across those boundaries merely to delete a file.
- Forms: public routes cap/allowlist inputs and verify Turnstile; cohort writes
  validate session ownership. Vocabularies in data/ and program-definition are
  persisted identifiers. Similar-looking forms have different payloads and UX.
- Analytics: explicit PostHog events, sanitized pageviews, Vercel analytics URL
  filtering and Sentry privacy hooks. Preserve initialization and event timing.
- Email/services: Resend templates, durable cohort queue, atomic notification
  budget, Google OAuth/Calendar and Turnstile. No production inspection or sends.
- Models: mentor public/private projections, cohort applications/matches,
  participation, sessions, goals, logs and surveys. Retain permissive legacy
  record handling where database values may predate current intake validation.
- Dead code evidence: static import graph plus repository-wide symbol search
  identifies lib/supabase.ts (zero imports), notifyCohortMatchActivated (zero
  callers; durable introduction messages use buildCohortOperationalEmail), its
  secondaryButton helper, demo MILESTONES, isSurveyStatus and three unused cohort
  type aliases. Framework exports are explicitly excluded from deletion.
- Duplication evidence: AST comparison finds four identical privileged-client
  factories, duplicate submission Field markup, and duplicate local date helpers
  in goal/log components. Inspect surrounding state before consolidating.
- Fragmentation: institutions route forwards directly to one server component;
  cn is a tiny institutions-only helper. Several other one-consumer modules
  protect client/server boundaries or domain clarity and should stay separate.
- Configuration/dependencies: every direct dependency has a source/config use.
  CI runs lint/typecheck, 78 JavaScript regressions, webpack build and disposable
  PostgreSQL migration checks. Do not remove dependencies, scripts or migrations
  based on age. Review Tailwind config loading before considering removal.
- Comments: preserve privacy/security/compatibility rules; shorten dated rollout
  narration that requires extra context without explaining current behavior.

Execute logical commits: proven dead code; shared implementations; file/component
simplification; documentation. Validate each code unit with lint, TypeScript,
existing JavaScript tests and build. Use rendered-output equivalence checks for
markup changes. No intentional behavior changes or production operations.
