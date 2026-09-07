# Ascenso phased readiness checklist

Execution contract: implement **one phase per explicitly authorized run**. Phase 1 is locally complete. The next incomplete phase is Phase 2; wait for explicit authorization before beginning it. On a later “continue”, inspect the next incomplete phase and relevant current code; do not repeat the completed audit. Do not modify hosted services without separate authorization. Preserve unrelated working-tree changes.

Status vocabulary: **Pending**, **In progress**, **Fixed**, **Partially addressed**, **Intentionally deferred**, **Not applicable**. Fixed means implemented and locally validated, not deployed. A phase is complete only when every numbered item in it has a documented disposition. Later-phase deferral notes record the accepted scope, not permission to execute those phases.

## Phase status

| Phase | Status | Items |
|---|---|---|
| 1 — Security / Intake Integrity | Fixed | 1–2 |
| 2 — Pilot Operational Correctness | Pending | 3–9 |
| 3 — Member Experience Consistency | Pending | 10–14 |
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
| 3 | Admin Entry / Auth Routing | Pending | Route admin-only accounts without changing member precedence or grant boundaries. |
| 4 | Application Decision Communications | Pending | Authoritative decisions plus idempotent, recoverable decision notifications; use existing email infrastructure. |
| 5 | Member Management / Routine Corrections | Pending | Cohort-scoped corrections, withdrawal and offboarding while retaining history; no CRM. |
| 6 | Match End / Rematch Lifecycle | Pending | Controlled end/rematch with reason, history and eligibility; no automatic participant rematching. |
| 7 | Match Activation Delivery Recovery | Pending | Recipient-level introduction state and retry of failed recipients only. |
| 8 | Assignment Cardinality / Concurrency | Pending | Transactional live-assignment rule for stale tabs/concurrent reviewers; preserve manual lower-ranked selection. |
| 9 | Mentor Capacity | Pending | Explicit pilot cardinality or real capacity enforcement; do not silently ignore the capacity field. |
| 10 | Meeting Logging Rule | Pending | Preferred two-sided pair logging; normal mentee UI and API must agree; explain who logs. |
| 11 | Scheduling Fallback | Pending | Manual scheduling/contact fallback when Google connection, availability or booking fails. |
| 12 | Meeting Cancellation / Rescheduling Recovery | Pending | Explicit cancel/rebook permissions and external-calendar failure recovery; no sync engine. |
| 13 | Member Accept / Decline / Rematch Request | Pending | Lightweight match-issue/support path while preserving board-controlled activation. |
| 14 | Support Ownership | Pending | Limited program support name/email/instructions; no ticketing system. |
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

## Audit coverage and later boundaries

All actionable audit recommendations are represented by items 1–64 except the explicit **stable organization entity/ownership boundary**. Track this as **Pending**, to be designed with items 23, 26, 28 and 34 before simultaneous organizations require it. A free-text organization label or multiple cohort grants must not be documented as a complete tenant model. Do not add this structural work in Phase 1.

Current custom-domain readiness is preserved, not reopened. The audit’s existing strengths (board control, cohort/party checks, public mentor projection, CSV defenses) are regression invariants, not new phases. Future enhancements retain the triggers/dependencies in the item table. Phase 1 does not resolve operational pilot blockers in Phase 2, member consistency, email capacity, privacy/telemetry, or the later paid/institutional requirements.

Phase 1 does not establish whether any historical misclaims or forged submissions occurred. Existing suspicious identities, if any, require a separately authorized operational review; never automatically clear auth links or discard applications.
