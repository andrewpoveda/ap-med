# Ascenso person and participation migration plan

Phase 7 plan, written before implementation. Current baseline: Phase 6 `25d9542`. This plan is not evidence that the migration or application changes are complete.

## Current references verified in the implementation

- `mentor` and `mentees` currently combine profile, cohort and auth ownership. Separate unique auth-user indexes permit only one row per role; `mentees_cohort_email_key` also prevents returning across cohorts. The public mentor email constraint is limited to general-platform rows.
- `mentee_requests` and `sessions` reference mentor/mentee row IDs. `mentor_google_tokens` and `mentor_availability` use mentor row ID as their primary key. These IDs must remain stable; no record should be moved out of its historical cohort or deleted during enrollment.
- `cohort_matches` references both member IDs without declared foreign keys. `meeting_logs` and `goals` reference match ID. Logs optionally reference a session. Session-linked log validation already enforces pair/cohort and date/status eligibility.
- `member_milestones`, `survey_responses` and `cohort_applications.member_id` have polymorphic role/member references. Survey responses have a survey foreign key but do not yet enforce matching cohort through that key. These require same-cohort member/reference validation.
- Promotion in `ascenso_review_application_v2` currently moves an existing general member into a cohort and refuses other-cohort members. This must become enrollment into a new cohort-role record, preserving original records and their references.
- `mentor-link`, `mentee-link`, `account-role` and `goals.resolveActingMember` resolve one role without an explicit participation context. All dependent dashboard, booking, meeting, goal, survey, availability and Calendar routes must use a validated selected participation. General-platform mentees remain accountless.

## Smallest compatible target

1. Add a server-only stable person identity, with one verified auth user owner and exact normalized email identity. Keep existing mentor/mentee IDs as role/cohort participation records; add person references rather than replacing all downstream IDs. General mentee submissions remain outside authenticated identity claiming.
2. Backfill only unambiguous identity groups. Abort on conflicting existing auth owners or duplicate records within the same role/cohort context. Do not choose a record by recency, merge conflicting identities, discard duplicates, overwrite ownership, or fabricate attribution. Produce explicit preflight queries and operator resolution guidance.
3. Replace global cohort-mentee email/auth uniqueness with participation-level uniqueness. Preserve the general mentor uniqueness policy. New enrollment creates another role/cohort row for the same person; returning or role-changing people do not move old rows. Existing profile/application fields and historical IDs remain intact.
4. Add a server-validated participation selector for authenticated members. Default to existing mentor-first behavior when no explicit selection exists. A selected role/cohort is a navigation preference, never authorization: every request rechecks person ownership, active participation and the target record's cohort/pair. A stale or invalid selection fails closed and offers selection recovery. Test stale tabs and switching during Calendar connection.
5. Add explicit session match/cohort context for cohort bookings. Backfill only when one historical relationship can be proven, including ended relationships and logged-session evidence. Leave genuinely unknown historical context explicitly unknown rather than guessing the newest match. New cohort sessions require exact match/participants/cohort, while general sessions retain their general context.
6. Enforce same-cohort references for matches, goals, logs, sessions, surveys, responses, milestones and approved applications with composite foreign keys or transactional guards. Freeze historical participation context so references cannot change meaning after later enrollment.
7. Establish an explicit organization ownership entity and immutable cohort ownership link. Do not merge organizations merely because free-text labels match. Existing cohorts can initially receive distinct ownership records, with deliberate operator assignment for cohorts proven to share an owner. This is a stable boundary, not a claim of separate infrastructure or a complete self-service tenant platform.

## Compatibility and operational decisions to implement

- Keep all historical mentor/mentee IDs, match IDs, log/session IDs, goals and survey references. No destructive rewrites or deletes. Preserve exact email claim/race guards and insert-only public applications.
- Existing general mentor records must retain public visibility rules. A separate cohort participation must not cause unrestricted mentor rows or email addresses to appear in public responses.
- Decide token/availability ownership deliberately: a returning mentor's enrollment must not silently copy or redirect Calendar credentials. Bind Calendar OAuth completion to the initiating owned participation, and either retain per-participation setup or centralize it behind person ownership with verified compatibility tests. Do not introduce cross-program double-booking through duplicated mentor IDs.
- Digests must not concatenate content from multiple organizations under one cohort's name. Scope recipient intent, cooldown, reporting and active context consistently with participation. Match/session exports must retain stable IDs so separate cycles remain distinguishable.
- Legacy magic-link lookup must remain non-probeable and must not choose an arbitrary cohort among repeated memberships. Resolve the stable person/owned participation safely or direct the user through the supported selection flow.
- Preserve scoped administrator grants and global-super exceptions from Phase 6. Keep route-specific party checks after central actor resolution.

## Validation and rollout gate

Focused synthetic tests must prove: current single-cohort sign-in compatibility; exact-email and wrong-owner denial; returning enrollment without moving history; role changes and concurrent programs; selected-participation isolation; removed membership/grant denial; same-cohort constraints; general-public isolation; session attribution across cycles; and Calendar/scheduling ownership after switching. Exercise migrations on a disposable PostgreSQL database with legacy fixtures before committing the phase.

Deploy only after preflight ambiguities are resolved deliberately, backup/recovery steps are ready, and the additive migration is applied in order. No hosted migration or production changes are authorized by this work. Phase 7 remains incomplete until the implementation, regression review, validation and explicit checklist dispositions are complete.

## Implementation decisions and rollout notes

- `20260908001057_ascenso_person_participations.sql` follows Phase 6. Run `database/verification/phase7_preflight.sql` as a separately authorized read-only operator review before rollout. Ambiguous identities or historical cross-cohort references require deliberate resolution; migration failure rolls back rather than selecting a winner. Original role rows and relationship IDs remain intact.
- `people.auth_user_id` becomes canonical ownership. Legacy role-row auth columns are compatibility data, not a source for authorization or account-link reporting. Account resolution preserves an already owned person when the auth provider email changes. Email correction/identity merging remains an operator procedure, not automatic reassignment.
- Calendar tokens and availability remain per mentor participation. Each new mentor participation needs its own Calendar connection and availability setup. OAuth completion checks the initiating participation; an in-flight connection begun before this code should be restarted. No credentials are copied between programs.
- The selection cookie is host-only and HttpOnly. Every lookup revalidates ownership and active status. Switching a program requires refreshing other open tabs; stale availability edits and Calendar callbacks fail closed.
- Known session context is exported and used in program metrics. Legacy sessions without evidence remain unattributed; the preflight inventory identifies them for review. No approval timestamp is substituted for activation or attendance.
- Booking conflicts span a person's mentor and mentee participations. The database guard uses the existing fixed 30-minute session duration; changing duration requires updating that guard together with event creation and availability calculations. New bookings lock cohort then match while checking lifecycle state, preventing a concurrent close/end from invalidating the check.
- Historical organization owners start separately even if labels match. Super administrators can explicitly reuse an owner for new cohorts. Moving an existing cohort's ownership requires a deliberate migration. Organization identity does not itself grant access; cohort grants remain authoritative.
- No environment variables, dependencies, external provider configuration or production changes are required by the repository implementation. Applying the migration before the dependent code remains a rollout prerequisite. Public intake still requires the existing operator-selected cohort/origin configuration.
- External Calendar creation followed by a rejected database booking still uses the existing best-effort provider rollback. This is not provider end-to-end recovery evidence; retain it in Phase 11 recovery review.
