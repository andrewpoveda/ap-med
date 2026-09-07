# Ascenso

Read this document for work on `/ascenso`, cohort applications, cohort matching, member dashboards, or cohort administration. The original build plan is preserved under `docs/history/` and is not current guidance.

## Isolation and visibility

Ascenso is a cohort-scoped program on the AP MED platform. Its mentors and mentees have authenticated accounts and never join the general public matching pool. All cohort records and member actions must retain `cohort_id` scoping.

Public discoverability is controlled by the singleton `app_settings.ascenso_visible` value through `src/lib/app-settings.ts`. The read fails closed and coordinates four public surfaces: the homepage panel, `/ascenso`, `/ascenso/apply`, and the two sitemap entries. It does not disable existing-member dashboards, authentication routes, or admin access. This visibility flag is distinct from a cohort's workflow `status`.

The public application flow is bound to the exact UUID in
`ASCENSO_COHORT_ID`; neither the cohort name nor a client-submitted identifier
selects the destination. The configured row must also have
`status = 'applications_open'`. Missing, malformed, closed, or nonexistent
configuration fails closed.

When `ASCENSO_SITE_URL` is set, its exact hostname is the customer-facing
Ascenso surface on the shared deployment. That hostname's root redirects to
`/ascenso`, the global shell uses Ascenso/LMSA Northeast co-branding, and its
sitemap excludes general AP MED marketing routes. This hostname selection is a
presentation/routing concern, not an authorization boundary; cohort and admin
access must continue to be enforced by authenticated IDs and `cohort_id`.

Do not document or assume the flag's current deployed value. Do not add an Ascenso call to action that routes applicants into the general mentor directory.

## Future LMSA-NE custom-domain launch checklist

This checklist records launch requirements, not completed approvals or current
production settings.

- Obtain LMSA-NE approval of the exact Ascenso hostname first. Any hostname
  discussed before that approval is only a proposal.
- Keep `app_settings.ascenso_visible` disabled until the coordinated launch.
  Domain setup alone is not approval to expose the public program or application
  flow. Enabling visibility also affects the AP MED public surfaces described
  above.
- Configure the required Vercel production variables: `ASCENSO_SITE_URL` must be
  the approved HTTPS origin, and `ASCENSO_COHORT_ID` must be the intended cohort's
  exact UUID. Include the approved hostname in `TURNSTILE_ALLOWED_HOSTNAMES`.
- Attach the approved custom domain to the existing Vercel project, complete
  DNS verification and TLS setup, and deploy with the launch variables.
- Complete the [provider configuration checklist](../development.md): Supabase
  Auth redirect URLs, Google Cloud Calendar OAuth redirect URI, Cloudflare
  Turnstile widget hostname, and Sentry browser Allowed Domains. Preserve the
  existing AP MED entries alongside the new hostname.

Perform final E2E verification on the approved HTTPS hostname using designated
test participants and recipients. Sign-in and existing-member checks can run
while visibility is disabled; verify the public application flow when visibility
is enabled as part of the coordinated launch. These checks can create real
applications, bookings, and emails, so coordinate the test records and cleanup.

- Confirm `/` redirects to `/ascenso` with the Ascenso shell and that the closed
  state is displayed before public visibility is enabled.
- Sign in through Google as an Ascenso mentor and mentee; confirm callbacks
  return to the approved host and the appropriate member dashboard.
- Submit a public application after launch visibility is enabled; confirm it
  reaches only the configured cohort, which must be accepting applications.
- Confirm Turnstile loads and validates on the approved hostname and that a
  missing or invalid challenge cannot submit the application.
- Connect Google Calendar and confirm the consent flow returns through the
  approved Calendar OAuth callback without a redirect or state error.
- Book a session with the designated matched participants; confirm the booking,
  Calendar event, and expected notifications. Exercise any tokenized scheduling
  link included in the launch flow.
- Check generated activation, digest, scheduling, and any retained magic-link
  emails: links must use the intended configured origin and reach the correct
  sign-in, dashboard, or scheduling page.
- Log out and confirm protected pages require sign-in again on the customer
  host. Verify AP MED still works independently on its normal hostname.

## Applications and membership

`/api/cohort-applications` owns server validation. Applications require identity fields, current position and location, motivation, specialty/support selections, role-specific answers, and the four acknowledgments represented by the current form and route. Email plus cohort and role is unique. Public intake creates new applications only. Duplicate submissions return 409 with administrator-correction guidance, regardless of review status; they never read or overwrite existing answers. Legacy previous-submission snapshots remain available to reviewers as historical records, not an edit/recovery mechanism.

Admin approval creates or claims a cohort member without overriding a row already assigned to another cohort. Google sign-in then claims the member row by exact normalized verified email. The generated `normalized_email` columns preserve legacy address casing while supporting equality queries; ambiguous identities fail closed. General-platform mentees remain outside this account flow.

## Current feature areas

The repository contains cohort-scoped administration and member behavior for applications, proposed and active matches, orientation state, meeting logs, goals, scheduling, surveys, announcements, digest reminders, and analytics. Authorization belongs in the route or server helper for each operation; UI hiding alone is insufficient.

General and Ascenso help-tag vocabularies are separate in `src/data/tags.ts`. Mentor capacity is collected for administrative judgment but is not an automatic matching constraint unless current source explicitly adds that behavior.

Avoid embedding cohort size, participant names, current application counts, dates, partner approvals, or workflow status in canonical documentation. Those are changing operational facts.

## Phased readiness implementation

The persistent [Phase 1–15 checklist](ascenso-readiness.md) tracks all 64 items,
validation and migration rollout notes. Work only on the next incomplete phase
when explicitly authorized; never infer production rollout from a Fixed status.
