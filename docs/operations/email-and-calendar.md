# Email and Calendar Operations

Read this document for work on Resend delivery, notifications, announcements, the daily digest, mentor availability, session booking, or Google Calendar.

## Delivery invariants

Recipient addresses are resolved from trusted database rows on the server. Browser requests pass stable record identifiers, never authoritative recipient addresses. A mentor notification is sent only after the mentee explicitly requests that mentor.

`/api/notify` recomputes the match score from database data and reserves the two-message daily budget atomically before sending the mentor and mentee emails. The reservation functions live in the active atomic-email-budget migration. Preserve request idempotency, reservation accounting, and actual-send logging when editing this flow.

The Ascenso digest and announcement paths use `email_log` soft-cap guards; do not describe every email path as using the notification reservation RPCs. The digest adds cooldown and same-day idempotency, while announcements limit full-cohort delivery to once per cohort per day. The digest batches a person's pending items and is invoked by `/api/cron/digest`, authenticated with `CRON_SECRET`. `vercel.json` is authoritative for its configured schedule. A digest request with `?test=1` computes recipients and guards without sending or logging email.

The notification route's dry-run behavior is restricted by the current runtime checks to development and preview environments and returns before side effects. Verify a route's implementation before assuming `?test=1` has the same semantics elsewhere.

## Scheduling and Google

Google Calendar authorization is separate from Google account sign-in. Calendar tokens are encrypted at rest and the app requests event and free/busy access for the connected mentor calendar. Scheduling links use an opaque token whose hash is stored server-side; the booking route validates token state, available slots, and existing bookings before creating a session.

Session helpers coordinate database rows with Google events and attempt rollback when one side fails. Cohort members can schedule only within their own active match. Cancellation and completion transitions are server-authorized.

Do not infer whether Google OAuth is in testing or production, which accounts are connected, current send counts, remaining email quota, or provider configuration from this repository. Those require an authorized live check.
# Ascenso delivery queue rollout (Phase 4)

Decisions, introductions, announcements and digests persist recipient intent in `cohort_delivery` before sending. The cohort announcements page links to paginated email status and recovery. “Accepted” means accepted by Resend, not inbox delivery. Historical announcement records have no inferred acceptance.

Apply `20260907194153_ascenso_email_queue.sql` after the Phase 3 migration and before deploying dependent code. No provider configuration is changed by that migration. `email_budget_settings.daily_limit` defaults to 90 and counts all logged/reserved application email against one UTC-day limit. Confirm the actual provider subscription and other senders before adjusting it; no commercial limit is inferred from repository configuration.

The existing authenticated digest cron also drains up to 40 queued candidates, interleaving cohorts, within a 40-second worker budget. Excess recipients remain pending. Check email status daily during pilot. Use scoped retry or another authenticated cron invocation to progress backlog; a more frequent production schedule requires checking the hosting plan and separate authorization. Never assume a large campaign will finish in one daily run.

Check the provider before resolving uncertain sends. Do not reset keys based solely on elapsed time. Expired, unattempted digests are discarded and recomputed; expired uncertain attempts require provider review. A retry reuses the frozen message/key within the guarded provider window. Unknown failures conservatively retain budget capacity for the day. Legacy sign-in credentials are request-bound and never put in this queue.

Delivery/bounce webhooks are deliberately not added yet. Add signed, replay-safe provider events and a defined bounce-suppression policy when a paid program requires delivery evidence or manual provider checks cannot handle volume. Until then assign a named operator to inspect bounce reports; do not promise inbox delivery or automated suppression.
