# Ascenso customer data decisions

This document describes implementation and decisions to agree with a customer. It is not a privacy policy, legal advice, certification or a default contractual retention promise.

## Current capability and visibility

- Authorized cohort administrators can see named applications, member profiles, match history, goals, meeting records/notes, named survey responses and program exports. Members see their own participation and authorized pair records. Surveys are not anonymous.
- AP MED operates the platform. Authorized operators/service-role access can reach program records for support and maintenance; cohort-grant restrictions do not technically constrain the service-role credential. Limit operator access separately and agree on support access practices.
- Cohort exports include named sensitive records, stable IDs and definition versions. CSV downloads are not encrypted delivery channels or automatic customer handovers. Administrators must choose an approved destination and protect downloaded copies.
- Withdrawal, offboarding, match ending and cohort closure retain history. There is no automated customer-wide retention/deletion job or self-service identity merge. Deleting one person may affect multiple programs; do not cascade across another organization's participation without deliberate review.
- Queued email bodies and recipient addresses, delivery state, operational events and provider-side copies have their own retention implications. Database deletion does not delete an already delivered email, exported file or Google event.

## Customer agreement checklist

Before a paid launch, record an owner and explicit decision for each item:

| Decision | Required agreement / current limit |
|---|---|
| Retention | Duration after application rejection, participant exit and cohort closeout; treatment of applications, notes, surveys, identity, events, queued messages and backups. No automatic expiry currently exists. |
| Deletion | Who verifies a request, who authorizes it, exceptions/holds, cross-program references and provider/export copies. Use a scoped reviewed operator procedure; no blanket table deletion. |
| Export/handover | Authorized requester, included records, format, secure destination, receipt confirmation and disposal of temporary copies. Existing CSV requests are logged, not proven received. |
| Support | Program inbox owner, AP MED escalation contact, coverage hours, incident severity and response expectations. The UI contact does not establish a response SLA. |
| Administrator access | Exact grant list, approval owner, recurring review, departure notification and revocation verification. No delegated reviewer/read-only roles yet. |
| AP MED operator access | Named operational responsibilities, minimum access, approval/notification expectations, handling of sensitive troubleshooting information and credential custody. |
| Recovery | Actual backup/PITR plan, retention, restore owner, acceptable data loss/downtime and provider reconciliation. Follow ascenso-recovery.md; local synthetic evidence is not a hosted SLA. |
| Telemetry/providers | Approved providers, deployment regions/agreements, provider retention and treatment of operational logs. Verify actual accounts/settings; repository defaults are not production evidence. |

## Telemetry implementation

Sentry replay integration is removed and replay/tracing sample rates are zero. Client/server/edge error hooks allow only event diagnostics, an allowlisted environment, redacted request routes, generic exception categories and sanitized stack filenames/line positions; arbitrary messages, request bodies, users, breadcrumbs, extra context and source-line contents are omitted. Query strings, fragments, UUID path segments and scheduling capability path values are removed. This reduces diagnostic detail intentionally; support should use scoped operational history rather than transmitting private records in exception messages.

PostHog already disables replay/autocapture and discards snapshot events. Explicit application events and sanitized pageviews remain. These controls are not proof that all hosting/provider logs are free of personal data. Review logging, provider retention and access as part of the customer agreement. Re-enabling Sentry traces/replay requires a new privacy review and negative tests for application answers, goals, meeting notes, named surveys, email addresses and auth/scheduling tokens.

No existing telemetry data was deleted, no provider retention setting was changed, and no customer policy was invented or applied by this repository work.
