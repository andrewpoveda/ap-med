# Cohort SMS V1 checkpoint

## Status

This branch contains a credential-free foundation only. It does not send SMS, receive Twilio webhooks, register a cron, enable any cohort, or apply the new migration to a hosted database. `SMS_FEATURE_ENABLED` is absent or false by default, and every `cohorts.sms_enabled` value defaults to false. Both switches must be enabled before members see SMS preferences or meeting check-ins.

The migration is `supabase/migrations/20260926201229_sms_foundation.sql`. It is additive and must be reviewed and applied before the dependent code is deployed. The current web surveys and meeting-log behavior are unchanged.

## Data path

- Ascenso's application form optionally collects a US phone number and a separate unchecked SMS permission. The intake route normalizes the number and records the exact disclosure, version, and server timestamp in `cohort_applications.answers`. Approval copies a missing contact into `cohort_sms_contacts`; it never overwrites a member's later preference. Existing approved members can add or revoke their own contact from the dashboard once both switches are on.
- Contacts and consent belong to a person within a cohort. Global `sms_phone_suppressions` prevents sending to a number after STOP across all cohorts. No phone is added to public mentor columns.
- `meeting_checkins` is the channel-neutral answer record. The web route and eventual SMS webhook will write the same member/session row. It carries cohort, pair, session, member, response channel, and answer. An answer does not create a `meeting_logs` row or mark attendance. The existing mid-year/end-year `surveys` and `survey_responses` remain intact.
- `sms_outbox` is transport bookkeeping for one reminder and one check-in prompt per session/contact. A check-in prompt has a unique reply reference. Inbound SMS has no original prompt ID, so the webhook must require that reference plus exact From/To match and a still-open intent. `sms_inbound_receipts` deduplicates provider message IDs without retaining unmatched message bodies.

## Twilio implementation still required

1. Create a Twilio Messaging Service and two-way sender number; complete US A2P 10DLC Brand and Campaign registration before sending to US recipients. Obtain approved public privacy and terms URLs, including SMS consent and non-sharing language. Keep screenshots of the optional onboarding consent flow for registration review.
2. Add server-only Twilio API credentials and Messaging Service SID. Proposed names: `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, and a fixed public webhook origin/sender number. The auth token is for webhook signature verification; API key credentials are for outbound REST calls. Never use `NEXT_PUBLIC_` for these.
3. Implement the Twilio adapter behind the provider-neutral SMS domain contract. Validate the webhook signature with the exact public URL and all form parameters, verify Account SID and receiving number, process STOP/START/HELP before reply matching, and return TwiML. STOP must update global suppression; START must not recreate AP MED consent. Deduplicate `MessageSid` in the database and atomically claim/write the check-in response so retries cannot lose a reply.
4. Add a separately authenticated SMS scheduler/worker. Before every provider call, recheck the global feature switch, cohort flag/status, active membership/match, session status/time, current consent/phone, and STOP suppression. Claim a unique outbox intent before sending. A timeout after provider acceptance must remain `needs_review` rather than blindly resend. Use one reminder before the session and one question after it; skip canceled or unattributed historical sessions. Keep email digest accounting separate.
5. Verify the hosting plan's cron frequency before promising an exact reminder interval. The current repository only configures a once-daily 13:00 UTC email digest. Run local and test-number end-to-end cases for duplicate webhooks, late replies, STOP, START plus fresh consent, phone changes, cancellations, cross-cohort participation, and provider timeouts. Then enable only the designated pilot cohort with explicit production authorization.

## Production limits and risks

- Optional phone entry does not verify handset ownership. Shared, mistyped, or reassigned numbers can receive a prompt; keep text minimal and provide a web fallback.
- A reply without its reference must remain unattributed. Reply references are required because a person can have multiple meetings, pairs, or cohorts.
- A check-in can say the meeting did not occur. It must never imply attendance or complete a booked session.
- Consent, check-in answers, and numbers are sensitive program data. Only service-role routes and authorized admins may access them; do not log message bodies or phone numbers.
- The new migration has been tested only in a disposable local PostgreSQL instance. No repository file proves the deployed database, provider approval, or cohort flag state.

Provider setup references: [Twilio Messaging Services](https://www.twilio.com/docs/messaging/services), [webhook request format](https://www.twilio.com/docs/messaging/guides/webhook-request), [webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security), [Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out), [A2P 10DLC](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc), and [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
