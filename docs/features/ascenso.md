# Ascenso

Read this document for work on `/ascenso`, cohort applications, cohort matching, member dashboards, or cohort administration. The original build plan is preserved under `docs/history/` and is not current guidance.

## Isolation and visibility

Ascenso is a cohort-scoped program on the AP MED platform. Its mentors and mentees have authenticated accounts and never join the general public matching pool. All cohort records and member actions must retain `cohort_id` scoping.

Public discoverability is controlled by the singleton `app_settings.ascenso_visible` value through `src/lib/app-settings.ts`. The read fails closed and coordinates four public surfaces: the homepage panel, `/ascenso`, `/ascenso/apply`, and the two sitemap entries. It does not disable existing-member dashboards, authentication routes, or admin access. This visibility flag is distinct from a cohort's workflow `status`.

Do not document or assume the flag's current deployed value. Do not add an Ascenso call to action that routes applicants into the general mentor directory.

## Applications and membership

`/api/cohort-applications` owns server validation. Applications require identity fields, current position and location, motivation, specialty/support selections, role-specific answers, and the four acknowledgments represented by the current form and route. Email plus cohort and role is unique. A repeat submission can update an existing application only while it remains unreviewed; reviewed applications reject resubmission.

Admin approval creates or claims a cohort member without overriding a row already assigned to another cohort. Google sign-in then claims the member row by verified email. General-platform mentees remain outside this account flow.

## Current feature areas

The repository contains cohort-scoped administration and member behavior for applications, proposed and active matches, orientation state, meeting logs, goals, scheduling, surveys, announcements, digest reminders, and analytics. Authorization belongs in the route or server helper for each operation; UI hiding alone is insufficient.

General and Ascenso help-tag vocabularies are separate in `src/data/tags.ts`. Mentor capacity is collected for administrative judgment but is not an automatic matching constraint unless current source explicitly adds that behavior.

Avoid embedding cohort size, participant names, current application counts, dates, partner approvals, or workflow status in canonical documentation. Those are changing operational facts.
