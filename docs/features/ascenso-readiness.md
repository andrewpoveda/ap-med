# Ascenso phased readiness checklist

Execution contract: the current authorization is to process Phases 3–15 sequentially, validating and committing each phase before beginning the next. Phases 1–2 remain authoritative completed baselines. Do not repeat the completed audit. Do not modify hosted services, apply hosted migrations, or deploy. Preserve unrelated working-tree changes. Completion of a phase is a checkpoint; the active goal requires cumulative verification and a rollout inventory after the final phase.

Status vocabulary: **Pending**, **In progress**, **Fixed**, **Partially addressed**, **Intentionally deferred**, **Not applicable**. Fixed means implemented and locally validated, not deployed. A phase is complete only when every numbered item in it has a documented disposition. Later-phase deferral notes record the accepted scope, not permission to execute those phases.

## Phase status

| Phase | Status | Items |
|---|---|---|
| 1 — Security / Intake Integrity | Fixed | 1–2 |
| 2 — Pilot Operational Correctness | Fixed | 3–9 |
| 3 — Member Experience Consistency | Fixed | 10–14 |
| 4 — Email / Delivery Reliability | Fixed | 15–17 |
| 5 — Reporting / Data Trustworthiness | Fixed | 18–22 |
| 6 — Cohort / Program Lifecycle | Fixed | 23–27 |
| 7 — Person / Role / Participation Model | Fixed | 28–31 |
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
| 15 | Shared Email Capacity / 90-Day Gates | Fixed | All live Ascenso Resend routes use the shared atomic reservation budget, including legacy sign-in links. Server-only singleton config defaults to 90/day; it is not the provider subscription limit. Excess announcement recipients remain pending; cron drains a bounded cohort-round-robin queue. Failed/deferred/expired entries are visible on paginated cohort email status. |
| 16 | Durable Email Send State | Fixed | Decisions, introductions, announcements and digests persist recipient intent before provider calls. Announcement request UUID + transactional creation and digest member/day uniqueness preserve retries. Frozen messages and provider keys are retained. Expired reminders are superseded if never attempted; uncertain attempts require provider confirmation. Credentials remain request-bound, never stored in the queue. |
| 17 | Delivery/Bounce Visibility | Fixed | UI distinguishes queued, provider-accepted and unresolved mail; historical announcement rows are not treated as confirmed delivery. Bounce/delivery webhooks intentionally deferred: no delivery-SLA or automated bounce suppression requirement is established. Trigger: first paid program requires delivery evidence, or manual provider checks cannot reliably handle volume. Then implement signed events, replay-safe provider-ID reconciliation and suppression policy together. |
| 18 | Approval Vs Activation Timestamps | Fixed | Real immutable activation timestamp set on transition; backfill only from recorded activation events. Dashboard uses activation; export separates proposed, approved, activated and ended times. Unknown historical activation remains blank. |
| 19 | Inactivity / Engagement Definition | Fixed | Follow-up list measures personal meeting-log/survey submission only, explicitly not disengagement. Partner logs, shared goals, staff milestones and bookings do not count as individual action. Future logs excluded; upcoming bookings and past completed session records shown separately from logged meetings and attendance. |
| 20 | Session-Linked Meeting Deduplication | Fixed | Phase 3 supplied unique session linkage and transactional past/eligible/same-pair enforcement; manual logs remain supported. Its SQL regression is retained; reports distinguish source and warn against counting sessions plus logs as two meetings. |
| 21 | Reporting Completeness | Fixed | Stable IDs across exports; named survey responses with question definitions; application answers and member linkage; match lifecycle dates/reasons; operational event export. Explicit sensitive-data notice; no auth IDs, credentials or previous-submission duplication exported. Full query pagination remains Phase 10. |
| 22 | Pilot Success Measures | Fixed | `ascenso-pilot-measures.md` defines supported numerators, denominators, joins, timing limits and missing-data treatment. Staff-time and renewal willingness require explicit collection; no causal outcome or fabricated first-login timing. Phase 15 implements the funnel/support capture workflow. |
| 23 | Cohort Creation / Configuration | Fixed | Super administrators create setup cohorts from `/admin`; scoped settings edit name, organization/program label, orientation date and supported status. Existing support inbox editor remains linked. Only fields used by current code are exposed; no JSON editor. Public intake destination remains an explicit operator configuration step. |
| 24 | Cohort Status / Closeout | Fixed | Setup → applications open → matching → active → closed, with matching-to-intake reopening only. Database guards serialize intake/matching against lifecycle changes. Closeout requires clearing live matches/selections, future sessions, pending Calendar cleanup and uncertain mail; pending mail is superseded and reports/history retained. Closed cohorts cannot reopen through the controller. |
| 25 | Admin Invitation / Removal / Offboarding | Fixed | Super-only add/view/revoke/restore workflow on cohort settings; exact Google email grants, no automatic invitation email. Actor/reason events preserve attribution. Revocation applies on subsequent checks, and zero-grant identities have no admin session. Other-cohort grants are preserved. Global admin management remains deliberately operator-owned. |
| 26 | Multi-Cohort Admin Grants | Fixed | `admin_cohort_grants` separates identity from zero or more cohort grants. Existing single-cohort access is backfilled with unknown original grantor left null; legacy `cohort_id` is no longer authoritative. Scoped multi-cohort directors are not supers. Disabled identities fail closed. |
| 27 | Reviewer / Read-Only Roles | Intentionally deferred | Institutional. Defer fine roles until distinct reviewer/reader responsibilities exist; first establish correct scoped grants (25–26). |
| 28 | Person, Role, And Cohort Coupling | Fixed | Planned before implementation; stable server-only people own auth identity, existing role rows become immutable cohort participations. Enrollment creates a new role/cohort row without moving history. Exact claims, ambiguity rollback and ownership denial retained. Owned active participation chooser supports returners and role changes; Calendar setup remains per participation. |
| 29 | Session / Match / Participation Attribution | Fixed | New cohort sessions carry explicit match/cohort IDs and exact pair validation; logs and reports use that context. Historical backfill uses linked logs or known activation windows; unknown remains unknown. Cross-role/program personal booking conflicts are rejected. |
| 30 | Same-Cohort Database Invariants | Fixed | Composite FKs protect match/member, goal/log/match and survey/response context. Triggers validate polymorphic member references and session pairs, reject self-matches and freeze participation/organization ownership. Legacy contradictions abort migration. |
| 31 | Authorization Centralization | Fixed | Shared person/participation resolver revalidates owned active selection; stale/forged selection fails closed. Member writes retain pair/cohort guards; Phase 6 central scoped grants remain authoritative. Negative participant, removed-grant, multi-grant and super tests pass. Digest content, cooldown and admin retries are cohort-scoped. |
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
- Commit: `76e24a2`.
- Migration: `supabase/migrations/20260907192940_ascenso_member_recovery.sql`, unapplied to hosted databases. Apply after Phase 2 and before dependent code. Existing duplicate session-linked logs intentionally block the unique index and require deliberate operator review, not automatic deletion.
- Validation: six focused Phase 3 Node tests (including both participant roles and wrong-cohort denial), focused ESLint, TypeScript, and `verify_phase3.sh` against disposable PostgreSQL 17 with the prior-phase SQL regression suite. No browser/provider end-to-end claim. No new dependencies or environment variables.
- Operations: configure each cohort's support inbox and assign an owner; mentors retry failed Calendar cleanup after reconnecting or coordinate manual event removal. No external provider actions performed.
- Later work: Phase 5 retains reporting/time attribution work despite the prerequisite session-log constraint added here. Phase 6 handles full cohort configuration; Phase 9 reuses the small support config. Broader event history stays Phase 8.

## Phase 4 checkpoint

- Items 15–17 explicitly addressed. Announcements/digests now use durable recipient intents and atomic capacity; legacy sign-in links reserve one slot. Public notification two-slot accounting remains unchanged. Obsolete unbudgeted bulk-send helpers removed.
- Commit: `9063c91`.
- Migration: `20260907194153_ascenso_email_queue.sql`, after Phase 3 and before dependent code; no hosted migration, deployment, dependencies or provider changes. Config is `email_budget_settings.daily_limit`, default 90. Adjust only after checking the actual Resend account plan, other users of that account and headroom; changing the database value does not change the provider limit.
- Validation: 70 focused/prior-phase Node tests passed; focused lint and TypeScript passed; disposable PostgreSQL checks cover cap exhaustion/release, atomic campaign idempotency, scoped denial, historical intent preservation, acceptance accounting and expired digest suppression. No provider/browser end-to-end claim.
- Queue: cron processes at most 40 candidates per invocation with a 40-second worker budget; it rotates across cohorts within each page. Announcements also attempt their own recipients immediately. Unprocessed mail remains durable. Existing daily cron configuration is unchanged; admins can retry on the cohort email-status page, or operators can invoke the existing authenticated digest cron again. Under sustained volume, schedule more frequent drains after checking the hosting plan; do not assume daily cron guarantees same-day completion. Inspect queue daily during pilot.
- Provider acceptance remains distinct from delivery. Check the provider for bounces/unknown outcomes before recording acceptance or confirmed non-send. Resend key expiry is guarded; elapsed time alone never authorizes a fresh duplicate. Unknown transport failures retain capacity conservatively until day reset.
- Reminders expire at the earliest included session or UTC day-end; the next run recomputes current needs. A prior unresolved digest blocks new sends for that member until reviewed. Phase 10 still addresses complete recipient query pagination; Phase 12 handles retention of stored message bodies and operator access.
- Sign-in credentials are not persisted for delayed delivery. Budget exhaustion keeps the non-probeable generic response; users can use Google login or contact support. Known link-generation failure releases capacity, unknown mail outcomes retain it.

## Phase 5 checkpoint

- Items 18–22 explicitly addressed. Files: cohort dashboard/analytics/export helpers, analytics report/toolbar, pilot metric definitions, activation migration and focused tests.
- Commit: `6cac8d9` (includes the shared match type's optional activation timestamp).
- Migration: `20260907235236_ascenso_truthful_reporting.sql`, after Phase 4, unapplied to hosted databases. Activation events are the only backfill evidence; approval timestamps are never reused. A trigger stamps future transitions and preserves the timestamp on other edits.
- Validation: three focused reporting tests; TypeScript and focused lint; disposable PostgreSQL checks of known-event backfill, unknown historical activation, approval preservation and timestamp immutability, with Phase 2 SQL regression. Phase 3 session-log deduplication is retained as item 20's implementation.
- Exports contain named sensitive program records and are available only through existing scoped admin authorization. Survey definitions accompany answers. No credentials/auth IDs are exported. Existing CSV formula escaping remains in the download path.
- Manual steps: director chooses meeting cadence/response targets and a staff-time recording owner; use the documented missing-data denominators when discussing pilot outcomes. No environment/provider changes or deployment. Phase 10 still owns query completeness; Phase 15 adds operational collection and funnel presentation.

## Phase 6 checkpoint

- Items 23–26 implemented; 27 intentionally deferred until a customer has distinct reviewer/read-only responsibilities. Creation and grant management are super-only; authorized cohort administrators manage that cohort's basic settings. This is assisted onboarding, not automated tenant provisioning.
- Commit: `25d9542`.
- Migration: `20260907235949_ascenso_cohort_lifecycle.sql`, after Phase 5 and before dependent code. It backfills existing grants, preserves legacy identity rows/event references, introduces lifecycle transactions/guards and serializes delivery claims with closeout. No hosted migration/deployment or provider changes.
- Validation: 59 focused Phase 6/Phase 1/Phase 2 Node tests; local PostgreSQL lifecycle/grant/closeout checks plus prior Phase 2 SQL invariants; focused lint and TypeScript. Tests cover multiple grants, missing/revoked/disabled access, super-only management, stale state, invalid dates, closed-history preservation, live-match and calendar closeout refusal. Original synthetic fixtures now explicitly create open cohorts and grants where that table exists.
- Manual onboarding: create cohort, configure support inbox/owner, grant each director's exact Google email, and directly share login/admin instructions. No emails are sent by grant management. The existing configured public intake cohort/origin still needs an operator-selected deployment configuration; creating a cohort alone does not make it public. Review this before launching simultaneous intakes.
- Manual offboarding: revoke each intended cohort grant; removal preserves other grants and history. Global super identities and emergency `disabled_at` controls remain operator-managed. Cohort closure requires ending matches, clearing selections, cancelling future appointments and confirming provider/calendar outcomes first. Archived reporting remains accessible to remaining authorized staff.
- Later work: Phase 7 owns person/participation attribution and the stable organization ownership boundary; the editable organization label is not a tenant model. Phase 9 owns versioned branding/program definitions. No reviewer/reader roles, SCIM, automatic invitations or domain console were added.

## Phase 7 checkpoint

- Items 28–31 implemented and reviewed. Required pre-implementation plan and rollout decisions: `docs/architecture/ascenso-participation-migration.md`. Migration `20260908001057_ascenso_person_participations.sql` follows Phase 6 and must precede dependent code; no hosted migration or deployment performed. Preflight ambiguity review and backup are operator prerequisites. No dependencies or environment/provider changes.
- Resumption verification on 2026-09-08: seven focused participation Node tests passed. Disposable PostgreSQL Phase 7 verification passed, including rollback on ambiguous legacy identity, literal email ownership, historical session attribution (unknown stays unknown), cross-role booking conflicts and client denial. Phase 5 backfill verification also passed after fixing its migration boundary; backfill runners now stop before the target migration instead of applying successors before it. These are local synthetic checks, not hosted/provider validation.
- Further regression review: all 67 Node tests and TypeScript passed. Current-migration Phase 3 meeting and Phase 6 closeout SQL checks passed after their booking fixtures supplied explicit relationship context and created bookings before ending the match. Phase 7 SQL also verifies explicit organization reuse, immutable ownership and self-match rejection. New booking validation holds cohort/match locks against concurrent lifecycle changes. These local tests do not claim production/provider end-to-end verification.

## Remaining audit boundaries

All actionable audit recommendations are represented by items 1–64 except the explicit **stable organization entity/ownership boundary**, now **Fixed** in Phase 7: server-only organization identities, immutable cohort ownership and explicit owner reuse for new cohorts. Historical equal labels are not automatically merged. This structural boundary is not a claim of separate infrastructure or a complete self-service tenant platform; cohort grants still control access.

Current custom-domain readiness is preserved, not reopened. The audit’s existing strengths (board control, cohort/party checks, public mentor projection, CSV defenses) are regression invariants, not new phases. Future enhancements retain the triggers/dependencies in the item table. Phase 1 does not resolve operational pilot blockers in Phase 2, member consistency, email capacity, privacy/telemetry, or the later paid/institutional requirements.

Phase 1 does not establish whether any historical misclaims or forged submissions occurred. Existing suspicious identities, if any, require a separately authorized operational review; never automatically clear auth links or discard applications.
