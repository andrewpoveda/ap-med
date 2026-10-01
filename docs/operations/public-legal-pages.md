# Public legal pages and SMS rollout

The `/privacy` and `/terms` routes use a `(legal)` App Router group, which does not add a URL segment. They use the existing site shell, have AP MED canonical metadata, and require no authentication, database reads, feature flags, or Twilio credentials. Both the shared shell and the standalone institutions footer link to them. The root layout reads request headers for site branding, so these routes still render through the existing dynamic root layout.

This change is independent of draft PR #40's SMS foundation and can be reviewed and deployed from main without its migrations. It changes no SMS switch, cohort configuration, provider integration, scheduler, or database schema. The SMS copy describes enrollment when offered; it does not claim that sending is already active.

## Before calling the public-page blocker complete

- Have the AP MED owner review the policy commitments and contact address against actual operating practices. The copy follows the SMS disclosure in PR #40: up to two texts per booked meeting, named replies, optional consent, STOP/HELP, and fresh dashboard consent after START.
- Merge and deploy this isolated change through normal application review and CI. Anonymous requests to `https://ap-med.org/privacy` and `https://ap-med.org/terms` must return 200 with the full copy, without login or a redirect. Recheck the configured partner hostname if those URLs will be submitted.
- Submit the deployed URLs and a verifiable separate, unchecked SMS opt-in flow to A2P review. Page publication alone does not establish campaign approval.

## Remaining SMS blockers from PR #40

PR #40 remains a draft with an explicit no-merge/no-deploy instruction. Its rollout checkpoint is `docs/architecture/cohort-sms-v1.md` on `codex/sms-foundation`. Do not enable SMS as part of publishing these pages.

- Review production readiness and the migration-first deployment. At the inspected PR head `6f143131d49f66fc8000cb34de19d03dc2ee8060`, the PR records 15 migrations after the reported hosted ledger checkpoint: five cohort/admin migrations followed by ten SMS migrations. Re-read the live ledger before acting; that historical report is not proof of current hosted state.
- Configure server-only Twilio credentials and the fixed two-way sender/Messaging Service, Advanced Opt-Out, and signed inbound POST webhook with the documented retry overrides. Complete the appropriate A2P Brand/Campaign approval.
- Confirm scheduler support and configure a sufficiently frequent protected SMS worker schedule. PR #40 deliberately has no SMS cron entry.
- Verify the intended cohort and explicitly configure phone collection separately from sending. Collection is not permission to send.
- Complete nonproduction real-number delivery and reply checks, including STOP/START with fresh consent, webhook retries/deduplication, changed phones, cancellations, overlapping cohorts, web/SMS answer races, provider timeouts, and uncertain-send reconciliation.
- Obtain separate production-enablement authorization after those checks. Keep `SMS_FEATURE_ENABLED` absent/false and cohort sending disabled until then. No hosted flags or provider state were inspected or changed in this task.

Provider guidance: [Twilio A2P campaign onboarding](https://help.twilio.com/articles/11847054539547-A2P-10DLC-Campaign-Approval-Best-Practices), [public policy and terms URL requirement](https://www.twilio.com/en-us/changelog/a2p-10dlc-campaign-registration-will-require-privacy-policy-and-).
