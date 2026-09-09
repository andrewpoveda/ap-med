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
- Fragmentation: institutions route forwards directly to one client component;
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

## Results

| Metric | Before | After |
| --- | ---: | ---: |
| Tracked repository files | 303 | 298 |
| Source files under src/ | 198 | 192 |
| Source lines, including CSS/comments/blanks | 29,046 | 28,204 |

Removed 842 source lines (2.90%). This is a conservative reduction, not a claim
of a dramatic repository-wide shrink. Most content, business logic and integration
code remains necessary. The largest gain is 53 copies of style objects replaced
by 13 exact shared definitions across 23 consumers. Different spacing variants
remain distinct; JSX and inline-style values were checked for equality.

Other changes:

- Reused the existing privileged-client factory in three public API routes.
- Shared exact tag filtering for mentor/mentee intake. Ascenso's different trim
  and 40-tag limit remain local and unchanged.
- Inlined directory filters as a local list, eliminating the nine-prop adapter.
- Rendered six Ascenso basic-information fields from local descriptors.
- Reused submission-review Field markup and the existing UpcomingSession type.
- Moved institutions UI into its route, cn into its existing frame module, and
  the one-use session refresher into proxy.ts without changing its function body.
- Colocated UUID validation with validation helpers and notification dry-run
  policy with test-mode helpers. Their distinct policies remain intact.
- Shortened dated source commentary while preserving ownership, privacy,
  integration, compatibility and race-condition explanations.

Deleted files: src/lib/supabase.ts, src/lib/uuid.ts,
src/lib/notify-request.ts, src/lib/supabase-middleware.ts,
src/components/FilterBar.tsx, src/components/institutions/cn.ts, and
src/components/institutions/page.tsx. Live code from the latter six was merged
into the consumers/modules described above. Added one shared source module,
src/components/styles.ts. No dependencies removed or added.

## Verification

- Every code commit passed lint, TypeScript, all 78 JavaScript regressions and
  `npm run build -- --webpack` before commit. Lint retains the two baseline
  warnings about the layout font link and results-page img element.
- The default Turbopack baseline build made no further progress and was stopped;
  verification used the repository's CI webpack command. Restricted font fetches
  failed initially; the webpack build passed with network access.
- Temporary AST/value comparisons verified all 53 imported style objects equal
  their originals and JSX is unchanged in those 23 consumers.
- Temporary rendered-HTML comparisons passed for six directory states (loading,
  error, empty, populated, filtered and no match), the institutions landing page,
  and Ascenso basic fields for both mentor and mentee. These used synthetic data
  and framework/provider stubs, not a live browser or production accounts.
- General tag filtering matched both original implementations for malformed,
  duplicate, whitespace and valid inputs. The six remaining functions across
  the three API routes have unchanged ASTs after helper extraction.
- All page/layout/API file paths were retained. The session-refresh function
  body is identical after moving it into proxy.ts.
- Comment-only edits in 15 files emit identical JavaScript. Lint, TypeScript and
  all 78 JavaScript regressions also passed after those edits.
- All CI PostgreSQL suites passed in disposable local PostgreSQL 17 clusters:
  phases 1, 2, 3, 4, 5, 6, 7, 8, 9, 11 and 15. Sandbox shared-memory restrictions
  required running those local checks with expanded permissions. No hosted
  database, provider sends, migration deployment or production configuration
  was changed.

## Deliberately retained / remaining candidates

No intentional product behavior changed. Auth ownership, grants, match scoring,
public projections, queue/budget accounting, transactions, provider integration,
legacy recovery, migration history, analytics and deployment settings remain.
Client components that require hooks and server helpers that protect privileged
access retain their boundaries. Similar date helpers and differing form/parser
implementations were not forced into a generic framework for small line savings.

Potential follow-up work needs stronger end-to-end coverage before it is worth
its risk: common member-write orchestration, the distinct public/cohort booking
flows, and larger form state/validation consolidation. Marketing copy and CSS
were not deleted based on apparent inactivity. Historical documentation and
untracked artifacts/outputs were preserved.
