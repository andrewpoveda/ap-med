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
