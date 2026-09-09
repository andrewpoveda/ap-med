# Ascenso institutional evidence and outstanding validation

This is a repository evidence index, not a certification, completed security questionnaire or statement about deployed settings. Confirm the intended release, hosted configuration and customer requirements before making procurement claims.

| Topic | Demonstrable repository evidence | What still requires verification/agreement |
|---|---|---|
| Architecture/deployment | Next.js App Router, server routes and shared Supabase database; `package.json`, `src/lib/supabase-admin.ts`, active migrations. Exact optional customer-host routing in `src/lib/site.ts`. | Actual deployed revision, regions, hosting/account ownership, availability commitments and domain/provider approval. Multiple public branded intakes are not self-service. |
| Authentication/authorization | Shared Google sign-in; stable person identity and owned active participation; `src/lib/participation.ts`, `src/lib/admin.ts`, Phase 6/7 migrations. Cohort grants and route-specific pair checks. | Intended customer population can use Google; operator access/custody; grant review/offboarding responsibilities. No SAML/SCIM promise. |
| Database controls | Server-only tables, client privilege restrictions, transaction guards and same-cohort references in `supabase/migrations/`; local SQL negative tests in `database/verification/`. | Applied migration history, production grants/RLS catalog and service-key handling. Shared storage is not contractual dedicated isolation. |
| Operational audit | Actor-attributed decisions, match lifecycle, grants, status and export requests; Phase 2/6/8 migrations and event export. | Retention/access to history. Export requests are not proof of download/readership; no full access-log product. |
| Telemetry | Phase 12 disables Sentry replay/tracing and filters error payloads in `src/lib/sentry-privacy.ts`; PostHog controls in `src/components/PostHogProvider.tsx`. | Actual deployed configuration, provider-side retention, historical data and hosting logs. No assertion that every external log is free of personal data. |
| Recovery | `docs/operations/ascenso-recovery.md`, synthetic migration and dump/restore tests, CI workflow. | Hosted restore exercise, backup/PITR plan, provider reconciliation, agreed RPO/RTO. No disaster-recovery SLA has been proven. |
| Data handling | Named cohort records/exports; immutable history and separate person/participation; `docs/operations/ascenso-data-governance.md`. | Customer retention/deletion, secure export destination, support/access decisions and legal terms. No automated policy enforcement or anonymized survey claim. |
| Providers | Code integrates Vercel deployment/analytics, Supabase DB/Auth, Google sign-in/Calendar/Meet, Resend mail, Cloudflare Turnstile, PostHog and Sentry. | Contractual subprocessor list, applicable agreements, locations, account plans and retention must be verified with actual accounts. A code dependency is not proof of a signed agreement. |

## Accessibility validation required before an institutional claim

Item 56 remains intentionally deferred as a formal institutional validation exercise, not marked compliant. Agree the buyer's relevant WCAG target and any required report format first. Test real supported desktop/mobile browsers with representative applicant, mentor, mentee and admin workflows:

- Keyboard-only navigation, logical tab order, skip/navigation access and completion without a pointer.
- Screen-reader names, role/state announcements, headings, data tables and dynamic feedback.
- Visible focus, focus movement after errors/dialogs/navigation and no traps.
- Programmatic labels, required/invalid states, instructions and error association for forms.
- Text/control contrast, zoom/reflow, touch targets and information not conveyed by color alone.
- Recoverable validation/network errors and appropriate announcements without exposing sensitive content.

Use synthetic program records and record browser/assistive technology, route, result and remediation evidence. Source inspection and automated checks alone do not establish compliance. Fix trivial accessibility defects encountered in touched components, but do not present that as completion of this institutional exercise.

## Deliberate boundaries

- Item 58: reader/reviewer roles remain deferred until a buyer's staffing model requires distinct privileges; current grants deliberately provide cohort administration, not a pretend read-only role.
- Item 59: deeper access/export auditing remains deferred until procurement specifies the event/retention need. Existing operational history and export-request events remain usable.
- Item 60: evaluate unsupported login and Calendar populations separately under items 45–46. A Microsoft requirement does not automatically imply SAML, Teams, SCIM and calendar integration together.

No SOC 2, WCAG, HIPAA, FERPA or other certification/compliance claim is made. Obtain appropriate legal/security review for a concrete institutional contract rather than inferring obligations or readiness from this document.
