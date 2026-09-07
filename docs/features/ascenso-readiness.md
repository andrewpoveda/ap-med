# Ascenso phased readiness checklist

Execution contract: the current authorization is to process Phases 3–15 sequentially, validating and committing each phase before beginning the next. Phases 1–2 remain authoritative completed baselines. Do not repeat the completed audit. Do not modify hosted services, apply hosted migrations, or deploy. Preserve unrelated working-tree changes. Completion of a phase is a checkpoint; the active goal requires cumulative verification and a rollout inventory after the final phase.

Status vocabulary: **Pending**, **In progress**, **Fixed**, **Partially addressed**, **Intentionally deferred**, **Not applicable**. Fixed means implemented and locally validated, not deployed. A phase is complete only when every numbered item in it has a documented disposition. Later-phase deferral notes record the accepted scope, not permission to execute those phases.

## Phase status

| Phase | Status | Items |
|---|---|---|
| 1 — Security / Intake Integrity | Fixed | 1–2 |
| 2 — Pilot Operational Correctness | Fixed | 3–9 |
| 3 — Member Experience Consistency | Fixed | 10–14 |
| 4 — Email / Delivery Reliability | Pending | 15–17 |
| 5 — Reporting / Data Trustworthiness | Pending | 18–22 |
| 6 — Cohort / Program Lifecycle | Pending | 23–27 |
| 7 — Person / Role / Participation Model | Pending | 28–31 |
| 8 — Audit / Event History | Pending | 32–33 |
| 9 — Branding / Program Configuration | Pending | 34–36 |
| 10 — Scale / Query Completeness | Pending | 37–38 |
| 11 — Testing / Recovery | Pending | 39–41 |
| 12 — Privacy / Data Governance | Pending | 42–44 |
| 13 — Features To Defer, But Explicitly Track | Pending | 45–55 |
| 14 — Institutional Items To Document, Not Overbuild | Pending | 56–60 |
| 15 — Pilot Learning / Product Evidence | Pending | 61–64 |

## Numbered item dispositions

| Item | Scope | Status | Implementation / remaining work / deferral trigger |
|---|---|---|---|
| 1 | Exact Email Identity Matching | Fixed | Exact normalized equality across mentor/mentee claims, promotion, existence probe, legacy sign-in link and public mentor duplicate lookup. Administrator equality and ownership/race guards preserved; ambiguity fails closed. Covered by focused regression tests. |
| 2 | Application Ownership / Overwrite Flaw | Fixed | Public intake is insert-only; duplicates return 409 with administrator-correction guidance, without reading or overwriting existing answers. Replacement UI/path removed; historical snapshots preserved. Covered by focused regression tests. |
| 3 | Admin Entry / Auth Routing | Fixed | OAuth routes an admin-only authenticated identity to `/admin`. Mentor-first and mentee resolution still take precedence; admin access still requires an exact `admin_users` record, and existing super/cohort boundaries are unchanged. |
| 4 | Application Decision Communications | Fixed | Approve/reject/waitlist now commits the authoritative decision, promotion and a durable email intent atomically. Repeated same-status actions do not create another intent or event. Provider acceptance state and safe recovery are shown on the review page; send failure never rolls the decision back. |
| 5 | Member Management / Routine Corrections | Fixed | Cohort-scoped admin UI/API supports a small allowlist of name/profile corrections and active/withdrawn/offboarded status. Email, auth ownership, cohort, application answers, tags and track remain outside the editor. Reasons and before/after fields are recorded; history/auth links remain. Stale edits, cross-cohort access and offboarding with a live selection/match are rejected. Inactive members lose participant access and routine cohort mail. |
| 6 | Match End / Rematch Lifecycle | Fixed | Admins can end an active match with a reason; actor/time/reason and the row remain. Ended participants return to the candidate pool and can be paired with a different participant. Historical active/ended rows cannot be deleted or reactivated, and the retained exact-pair uniqueness means repeating the same pair remains intentionally unsupported for this pilot. No automatic participant rematch was added. |
| 7 | Match Activation Delivery Recovery | Fixed | Activation commits the active match and two recipient-specific introduction intents together. Provider-accepted recipients are never resent; unresolved recipients can retry with the same frozen message and Resend idempotency key. After the provider key window, an admin must record a checked accepted/non-send outcome before further action. UI labels acceptance honestly rather than claiming inbox delivery. |
| 8 | Assignment Cardinality / Concurrency | Fixed | Partial unique indexes enforce one proposed/board-approved/active match per mentor and mentee, including stale tabs and concurrent transactions. Database guards require active same-cohort members. Lower-ranked manual pairing remains available, and the existing all-history exact-pair constraint remains. Migration intentionally fails if pre-existing live conflicts require operator resolution. |
| 9 | Mentor Capacity | Fixed | Pilot policy is explicitly one live assignment per person and is enforced in the database. The application and matching UI explain that the capacity answer records future willingness only. Configurable capacity greater than one is deferred until a customer/program requirement justifies changing the assignment model. |
| 10 | Meeting Logging Rule | Fixed | Both dashboards expose the shared meeting form and eligible booked-session picker. Copy asks participants to agree who logs and check for an existing off-platform entry. Pair authorization is retained. A unique session index and transactional trigger prevent duplicate/future/cancelled/wrong-pair booked-session logs; item 20 builds on this. |
| 11 | Scheduling Fallback | Fixed | An authenticated active pair can contact its partner from the match panel regardless of Calendar/availability status. Booking copy explains manual scheduling, checking for an existing booking after failure, and subsequent off-platform logging. Partner contact never comes from a proposed selection. |
| 12 | Meeting Cancellation / Rescheduling Recovery | Fixed | Mentor remains cancellation owner; mentee UI explicitly directs cancellation requests to the mentor, followed by either-party rebooking. AP MED cancellation commits first with durable calendar_cleanup_pending; failures remain visible and retryable after refresh. History is retained and completed-session/cancellation races are rejected. External account settings are unchanged. |
| 13 | Member Accept / Decline / Rematch Request | Fixed | Authenticated cohort members have a program-directed email action for match help/reassignment with program and member reference, plus visible destination and instructions. Sending is explicit through their email client. Board-controlled disclosure/activation remains; no automatic acceptance/rematching or ticketing system. |
| 14 | Support Ownership | Fixed | Admin member-management page configures support name, validated email, and optional instructions in the cohort's support configuration. Scoped server RPC preserves unrelated config and records an event. Defaults explicitly name AP MED program support; the program must assign an inbox owner. |
| 15 | Shared Email Capacity / 90-Day Gates | Pending | Shared configurable daily cap, safe deferral, visible failures and practical cohort fairness. The source heading says “90-DAY”; this is the 90-per-day gate. |
| 16 | Durable Email Send State | Pending | Durable intent, recipient status, idempotency and retry-safe introductions/decisions/digests. |
| 17 | Delivery/Bounce Visibility | Pending | Honest provider-accepted versus delivered semantics; minimal webhook only if justified and straightforward. |
| 18 | Approval Vs Activation Timestamps | Pending | Real activation timestamp and honest labels; never invent historical activation dates. |
| 19 | Inactivity / Engagement Definition | Pending | Separate booked activity from recorded meetings and pair activity from individual participation. |
| 20 | Session-Linked Meeting Deduplication | Pending | Database session-log deduplication plus past/eligible, same-pair validation; preserve manual logs. |
| 21 | Reporting Completeness | Pending | Stable export IDs, survey export, appropriate application fields and truthful lifecycle/activity data. |
| 22 | Pilot Success Measures | Pending | Supported funnel/outcomes plus manual staff-time measurement; no causal retention or match-quality claims. |
| 23 | Cohort Creation / Configuration | Pending | Small supported cohort setup for name/program label/status/used dates and configuration; no arbitrary JSON UI. |
| 24 | Cohort Status / Closeout | Pending | Safe cohort transitions govern intake/matching/reminders and retain closeout reports/history. |
| 25 | Admin Invitation / Removal / Offboarding | Pending | Supported grant/add/view/revoke with attribution and subsequent-check revocation; no SCIM. |
| 26 | Multi-Cohort Admin Grants | Pending | Separate admin identity from selected cohort grants if clean; never make a multi-cohort director global super. |
| 27 | Reviewer / Read-Only Roles | Intentionally deferred | Institutional. Defer fine roles until distinct reviewer/reader responsibilities exist; first establish correct scoped grants (25–26). |
| 28 | Person, Role, And Cohort Coupling | Pending | Plan a backward-compatible person/participation migration before implementation; preserve role changes, returners and historical references. |
| 29 | Session / Match / Participation Attribution | Pending | Attribute sessions and logs to the correct relationship/cycle alongside participation migration. |
| 30 | Same-Cohort Database Invariants | Pending | Strengthen same-cohort relationships with database constraints/FKs or equivalent; preserve historical integrity. |
| 31 | Authorization Centralization | Pending | Central actor/grant/participation resolution with denial-by-default and cross-cohort negative tests. |
| 32 | Operational Event History | Pending | Small durable actor/action/target/time/reason history for meaningful program transitions; no SIEM. |
| 33 | Access / Export Audit | Intentionally deferred | Institutional. Defer deeper access auditing until procurement requires it; minimal export events may use item 32 plumbing first. |
| 34 | Limited Branding Configuration | Pending | Limited program/org/asset/support/email identity/origin configuration preserving AP MED and Ascenso; no theme/domain console. |
| 35 | Program Definitions Embedded In Code | Pending | Version realistic program-specific definitions without reinterpreting existing cohorts or canonical tags. |
| 36 | Configurable Matching | Pending | Keep Ascenso policy fixed unless a small versioned abstraction is justified. Arbitrary matching controls wait for a paying program’s concrete policy difference; solve cardinality first. |
| 37 | Pagination / Query Limit Safety | Pending | Complete paginated reads for reports/exports/digests/lists; explicit failure rather than silent truncation. |
| 38 | Matching Computational Scale | Pending | Document supported cohort size and pair-computation limits; no distributed matching without realistic volume evidence. |
| 39 | Core Regression Coverage | Pending | Targeted lifecycle, ownership, isolation, concurrency, delivery and export tests. Phase 1 covers only its own security cases. |
| 40 | Ci | Pending | Minimal CI for lint/typecheck/tests and reasonable build; no deployment pipeline expansion. |
| 41 | Recovery Procedure | Pending | Document and exercise appropriate local recovery procedures; separate evidence from untested production guarantees. |
| 42 | Privacy Copy Vs Actual Admin Visibility | Pending | Disclose actual admin/operator visibility, named surveys and notes; do not invent legal claims. |
| 43 | Sentry Replay | Pending | Review Sentry replay/credential URLs and sensitive program content; conservative masking/disablement with verification. |
| 44 | Data Retention / Export / Deletion / Support | Pending | Customer decisions on retention/deletion/export/support/operator access/recovery; distinguish capability from contract. |
| 45 | Saml / Sso / Scim | Intentionally deferred | Requested. No SAML/SSO/SCIM now. Trigger: qualified buyer identity requirement or blocked intended users. First fix ownership/grants. Microsoft login and calendar are independent requirements. |
| 46 | Microsoft / Outlook / Teams Compatibility | Intentionally deferred | Requested. Google login, Calendar OAuth/freebusy and Meet are current dependencies. Trigger: actual Microsoft population blocked. Evaluate Entra login separately from Graph calendar/Teams; first make existing auth and scheduling reliable. |
| 47 | Soc 2 | Intentionally deferred | Requested. Defer SOC 2 until procurement/contracts justify cost; first resolve technical controls, recovery and data-handling evidence. |
| 48 | Separate Database Per Organization | Intentionally deferred | Requested. Defer dedicated databases unless explicit contractual isolation requires them; first fix shared-model constraints and grants. |
| 49 | Generalized White-Label / Domain Self-Service | Intentionally deferred | Future. Defer generalized white-label/domain provisioning until several organizations need repeatable onboarding; first deliver limited branding and correct organization ownership. |
| 50 | Ai Matching / Embeddings / Optimization | Intentionally deferred | Requested. Defer AI/embeddings/optimization until measured matching failures and buyer demand; first capture override reasons and enforce assignment rules. |
| 51 | Public Api / Webhook / Zapier / Connector Catalog | Intentionally deferred | Requested. Defer APIs/webhooks/Zapier/catalog until a buyer identifies repeated costly manual work; first make exports and event semantics reliable. Delivery webhook item 17 is a separate narrow reliability decision. |
| 52 | Custom Bi / Data Warehouse / Predictive Engagement | Intentionally deferred | Future. Defer BI/warehouse/prediction until trusted metrics and renewing customers justify it; first correct activity definitions/export completeness. |
| 53 | Native Mobile / In-App Chat / Video / Training Lms | Intentionally deferred | Requested. Defer native apps/chat/video/LMS until evidence browser/email/calendar is insufficient; first fix current member friction. |
| 54 | Subscription Billing / Automated Provisioning | Intentionally deferred | Requested. Defer subscription billing/provisioning while contracts are assisted/invoiced; revisit at repeatable sales volume, after supported setup/lifecycle. |
| 55 | Universal Form / Survey / Workflow Builders | Intentionally deferred | Requested. Defer universal builders until repeated customer requirements defeat specific versioned definitions; first preserve historical program meaning. |
| 56 | Accessibility | Pending | Institutional validation remains deferred until buyer target is known: keyboard, screen reader, focus, labels, contrast and errors. Source inspection is not compliance; fix trivial touched-component defects if found. |
| 57 | Procurement / Security Evidence | Pending | Document actual architecture/auth/RLS/telemetry/recovery/data/providers/deployment evidence in this phase; no certification claims. |
| 58 | Reader / Reviewer Role Separation | Intentionally deferred | Institutional. Defer fine reader/reviewer separation until staffing requires it; dependency: correct grant model (25–27). |
| 59 | Access / Export Auditing | Intentionally deferred | Institutional. Defer deeper access/export audit until procurement requires it; dependency: operational events (32–33). |
| 60 | Procurement-Driven Auth/Calendar Compatibility | Intentionally deferred | Requested. Procurement-driven auth/calendar compatibility follows separate triggers in 45–46; dependency: current identity and scheduling correctness. |
| 61 | Match Override / Rejection Reasons | Pending | Record lightweight board override/rejection reasons before algorithm sophistication. |
| 62 | Support / Manual Work Tracking | Pending | Small manual support/intervention/time tracking workflow; no helpdesk. |
| 63 | Pilot Funnel | Pending | Honest application/approval/sign-in/selection/activation/first meeting/repeat activity/goals/survey funnel. |
| 64 | Participant Feedback Timing | Pending | Early pilot feedback wave only if trivial; otherwise document external feedback survey, not a builder. |

## Phase 1 implementation and rollout

- Items 1–2: **Fixed** and reviewed on 2026-09-07. No later phase implemented.
- Validation passed: 38 Phase 1 tests plus 5 existing email-budget tests (43 total); focused ESLint on all changed TS/TSX/test files; `npx --no-install tsc --noEmit --incremental false`; `git diff --check`; disposable PostgreSQL 17 migration checks. The existing Node module-type warning is non-failing; package configuration is unchanged.
- Tests exercise actual TypeScript helpers/routes with provider/framework stubs; the SQL runner separately verifies real PostgreSQL normalization, migration preservation, generated updates, ambiguity and client denial. No production/browser end-to-end claim is made.
- New migration: `supabase/migrations/20260906152802_exact_member_email_identity.sql`. Additive indexed generated columns on `mentor`/`mentees`; no original emails, auth links or history rewritten. Apply before dependent application deployment; no hosted migration performed by this run.
- Tests: `node --test database/verification/phase1_security.test.mjs`; `sh database/verification/verify_phase1.sh` (disposable PostgreSQL 17 with synthetic data). No provider traffic.
- Existing previous-submission columns/UI are retained only to display historical snapshots; intake no longer writes them. Corrections remain administrator-assisted until later supported workflows.
- No environment-variable changes, provider-dashboard actions, dependency installation, new auth provider, verified edit link, or applicant portal.
- Exact normalized duplicates are not merged. They fail closed for identity claiming/legacy links and require deliberate operator correction; general mentee submission duplicates remain supported.
- Migration timing must account for stored-column/index table locks; see [database rollout notes](../../database/README.md#phase-1-email-identity-migration).

## Phase 2 implementation and rollout

- Items 3–9: **Fixed** and reviewed locally on 2026-09-07. No Phase 3 work was started.
- Validation passed: 18 focused Phase 2 route/helper tests, all 43 Phase 1 and email-budget regression tests, focused ESLint, TypeScript, `git diff --check`, and disposable PostgreSQL 17 lifecycle/security/concurrency checks. The Node module-type warning remains non-failing and package configuration is unchanged.
- New migration: `supabase/migrations/20260907140501_ascenso_pilot_operations.sql`. It adds member status, match end metadata, server-only delivery/event tables, transaction functions/guards, and one-live-match partial unique indexes. No hosted migration was performed.
- The migration must run after the Phase 1 normalized-email migration and before this application code. It deliberately aborts on an existing conflicting live assignment rather than choosing or ending a relationship. Review conflicts and take a database backup before production rollout.
- Durable delivery in this phase covers application decisions and match introductions. Broader campaign/digest queuing and bounce/delivery webhooks remain items 15–17; the UI reports provider acceptance only.
- Operational events in this phase cover Phase 2 decisions, member changes, match activation/end and manual delivery resolution. Full event taxonomy and access/export auditing remain items 32–33.
- No dependency, environment-variable, auth-provider or provider-dashboard changes were added. Resend's existing API key and existing account-wide 90-message reservation mechanism are reused one message at a time.
- Withdrawal and offboarding do not delete records, unlink auth ownership, revoke the external Google account, or cancel existing calendar events. Operators must end/remove matches and coordinate calendar cleanup first. Those scheduling recovery workflows remain Phase 3.
- Configurable mentor capacity above one remains intentionally unimplemented. Supporting it later requires a program rule and a cardinality model that keeps mentee uniqueness and concurrency guarantees explicit.

## Phase 3 checkpoint

- Repository changes: two-sided meeting UI; active-partner contact and support panel; scoped support editor/API; durable cancellation recovery and session-linked meeting integrity.
- Migration: `supabase/migrations/20260907192940_ascenso_member_recovery.sql`, unapplied to hosted databases. Apply after Phase 2 and before dependent code. Existing duplicate session-linked logs intentionally block the unique index and require deliberate operator review, not automatic deletion.
- Validation: six focused Phase 3 Node tests (including both participant roles and wrong-cohort denial), focused ESLint, TypeScript, and `verify_phase3.sh` against disposable PostgreSQL 17 with the prior-phase SQL regression suite. No browser/provider end-to-end claim. No new dependencies or environment variables.
- Operations: configure each cohort's support inbox and assign an owner; mentors retry failed Calendar cleanup after reconnecting or coordinate manual event removal. No external provider actions performed.
- Later work: Phase 5 retains reporting/time attribution work despite the prerequisite session-log constraint added here. Phase 6 handles full cohort configuration; Phase 9 reuses the small support config. Broader event history stays Phase 8.

## Remaining audit boundaries

All actionable audit recommendations are represented by items 1–64 except the explicit **stable organization entity/ownership boundary**. Track this as **Pending**, to be designed with items 23, 26, 28 and 34 before simultaneous organizations require it. A free-text organization label or multiple cohort grants must not be documented as a complete tenant model. Do not add this structural work in Phase 1.

Current custom-domain readiness is preserved, not reopened. The audit’s existing strengths (board control, cohort/party checks, public mentor projection, CSV defenses) are regression invariants, not new phases. Future enhancements retain the triggers/dependencies in the item table. Phase 1 does not resolve operational pilot blockers in Phase 2, member consistency, email capacity, privacy/telemetry, or the later paid/institutional requirements.

Phase 1 does not establish whether any historical misclaims or forged submissions occurred. Existing suspicious identities, if any, require a separately authorized operational review; never automatically clear auth links or discard applications.
