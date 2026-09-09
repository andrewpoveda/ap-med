# Ascenso readiness completion and rollout inventory

Repository work is complete through Phase 15, subject to the final validation record below. Production rollout is separate and was not performed. Hosted migration/provider state was not inspected or changed; “not applied by this work” does not establish whether an operator previously applied a migration.

## Ordered phase commits

| Phase | Commit | Outcome |
|---|---|---|
| 1 baseline | `bac5d01` | Exact ownership and insert-only intake |
| 2 baseline | `ea44df1` | Recoverable pilot operations |
| 3 | `76e24a2` | Member meetings, support and scheduling recovery |
| 4 | `9063c91` | Durable email queue and shared capacity |
| 5 | `6cac8d9` | Truthful activation/reporting evidence |
| 6 | `25d9542` | Cohort lifecycle and scoped grants |
| 7 | `ae166e6` | Stable people and program participations |
| 8 | `42f5230` | Atomic operational/export-request history |
| 9 | `e74e218` | Released definitions and limited program identity |
| 10 | `3b2b845` | Complete reads and explicit scale limits |
| 11 | `ca0ac2c` | CI and synthetic recovery evidence |
| 12 | `4eac4a5` | Privacy disclosures and restricted telemetry |
| 13 | `aa94930` | Explicit enterprise-feature deferrals |
| 14 | `d008112` | Institutional evidence and validation limits |
| 15 | `34ddd05` | Matching feedback and observed pilot funnel |

## Migration inventory

All files are under `supabase/migrations/`. Confirm actual hosted history first; apply only missing migrations in filename order before deploying dependent code. Do not replay applied migrations or run historical/manual migration records.

| File | Rollout consideration |
|---|---|
| `20260906152802_exact_member_email_identity.sql` | Generated normalized-email columns/indexes; original emails preserved. Account for table/index locks. |
| `20260907140501_ascenso_pilot_operations.sql` | Member status, match lifecycle, cardinality, durable mail/events. Existing conflicting live assignments require deliberate resolution. |
| `20260907192940_ascenso_member_recovery.sql` | Session-log uniqueness and Calendar cleanup. Existing duplicate linked logs block migration rather than being deleted. |
| `20260907194153_ascenso_email_queue.sql` | Announcement/digest intents and shared budget configuration. Inspect pending/uncertain attempts before rollout. |
| `20260907235236_ascenso_truthful_reporting.sql` | Activation backfill only from existing events; unknown remains null. |
| `20260907235949_ascenso_cohort_lifecycle.sql` | Backfilled cohort grants and lifecycle guards; legacy grantor history may remain unknown. |
| `20260908001057_ascenso_person_participations.sql` | Run Phase 7 preflight; conflicting identity/reference rows abort. Preserve historical IDs; canonical ownership moves to people. Existing cohort owners remain separate unless deliberately reconciled. |
| `20260908133738_ascenso_operational_history.sql` | New selection/approval/removal/export RPCs required by routes. No fabricated historical selection events. |
| `20260908134231_ascenso_program_definition_version.sql` | Pins supported cohort definition; new policy versions require compatible code/migration. |
| `20260909001134_ascenso_pilot_learning.sql` | Candidate reasons and first observed dashboard access. No historical login backfill. |

Take a verified backup and review preflight results before applying changes. Plan recovery/forward fixes and application compatibility; blindly rolling back only application code can break ownership/RPC semantics. No automatic down-migrations are supplied.

## Configuration and provider prerequisites

- No new dependency or required environment variable was introduced by Phases 3–15. Existing Supabase, Resend, Google, Turnstile and hosting credentials remain necessary. CI uses placeholders and no production secrets.
- Preserve exact `ASCENSO_COHORT_ID` and `ASCENSO_SITE_URL` configuration. Public intake still selects one configured cohort per deployment; multiple member/admin cohorts do not imply simultaneous self-service branded intakes.
- For a new approved hostname, complete the existing Vercel/DNS/TLS, Supabase Auth redirect, Google Calendar OAuth redirect, Turnstile hostname and applicable provider-domain checklist in `docs/features/ascenso.md` and `docs/development.md`. No provider setting was changed here.
- Check the actual Resend plan/headroom before adjusting `email_budget_settings.daily_limit` (default 90). The database value does not change provider limits. Inspect the durable queue daily during pilot; arrange a more frequent authorized drain if daily scheduling and manual retries cannot meet agreed timing. Provider acceptance is not delivery.
- Calendar setup/availability remain per mentor participation. New program participation does not copy credentials. Restart any in-flight OAuth connection begun before participation-bound state was introduced.
- Sentry replay/traces are disabled in repository configuration; verify the deployed release and review provider retention/historical telemetry separately. Disabling collection does not delete previous data.

## Operational tasks before a paid rollout

1. Verify hosted migration state, backup/restore ownership and an isolated hosted restore exercise; agree data-loss/downtime expectations and reconcile email/Calendar effects after recovery.
2. Configure each program's name/organization/support inbox and owner. Grant directors' exact Google emails, share onboarding instructions manually, and verify scoped/revoked access. Review landing/shell copy and approved assets before presenting another organization publicly.
3. Assign queue/provider-error and Calendar-cleanup owners. Never reset uncertain send state or resend after key expiry without provider confirmation. Event-create rollback can still leave an orphan provider event; check Calendar before retrying after ambiguous booking failure.
4. Agree retention, deletion, secure export/handover, support/escalation, operator access and administrator offboarding. Existing closure/offboarding preserves history; no automatic retention job or legal policy is implied.
5. Assign the manual-work register and early-feedback owners. Set pilot denominators/cutoff/cadence and protect named exports. First observed access is prospective evidence; blank historical dates are unknown, not inactivity.
6. Review the first hosted CI run after push. Run the appropriate real login, member/admin, email and Calendar smoke checks in an approved non-production environment before rollout; local stubs/synthetic SQL do not replace provider end-to-end evidence.

## Deliberate limits and deferrals

Use `ascenso-deferred-features.md` for items 45–55 and their exact triggers. Formal institutional accessibility validation, reader/reviewer separation, deeper access auditing and procurement-driven identity/Calendar compatibility remain deferred as documented in `ascenso-institutional-evidence.md`. No SOC 2/WCAG or other certification is claimed.

Current matching guardrail is 10,000 candidate combinations per track with an intended 200-participant pilot envelope, not a load-tested enterprise capacity promise. Multi-request exports are complete bounded reads, not transaction snapshots. Repeat pair activity/shared goals are not individual retention or causal program outcomes.

## Final validation

- All 64 numbered items have explicit Fixed or Intentionally deferred dispositions; phases were committed separately.
- Cumulative Node suite: 78 passing tests. TypeScript passed. Repository lint passed with two existing warnings in unrelated interface work.
- All disposable SQL runners (1–9, 11, 15) passed, including ownership, concurrency, cross-cohort denial, delivery recovery, migration ambiguity rollback and synthetic dump/restore.
- Final isolated production build: passed, including compilation, type checking and prerendering. It uses tracked code, no local environment files, loopback placeholder credentials and webpack because the isolated dependency symlink is unsupported by Turbopack.
- No live provider/browser end-to-end, hosted CI, hosted restore or production deployment is claimed. Unrelated working-tree interface/artifact changes are preserved and excluded from phase commits.
