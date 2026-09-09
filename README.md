# AP MED

AP MED is a mentorship platform for structured healthcare mentorship programs. It helps participants find and build mentor relationships while giving program teams tools to run applications, matching, cohort operations, and engagement follow-up.

## Overview

AP MED supports both the participant experience and the organizational side of running mentorship programs. The general platform provides mentor onboarding, a public directory, and mentee-to-mentor matching. Programs can run cohort-scoped workflows on the same platform, with their own applications, members, matches, dashboards, and administration.

Ascenso / LMSA Northeast is a program cohort running on AP MED, not a separate product. Its current workflow covers application and board review, matching, participant sign-in, relationship support, scheduling, and ongoing cohort administration.

The core lifecycle is: a mentor or mentee submits the appropriate intake, a program team reviews and manages participants where applicable, participants are matched, the pair schedules and holds meetings, and the relationship is supported through goals, milestones, surveys, announcements, and reminders.

## Product

### Participant and mentor experience

- Mentor onboarding with background, specialties, areas of help, contact preferences, and capacity information.
- Mentee intake and matching against approved general-platform mentors.
- Public mentor directory and match results with an explicit request flow.
- Google sign-in for mentors and authenticated cohort members, with participation selection when an account has more than one active program role.
- Participant dashboards for matches, availability, goals, surveys, meeting history, support information, and upcoming sessions.

### Program operations

- Cohort applications with administrative review and member lifecycle management.
- Cohort-scoped proposed, board-approved, active, and ended matches.
- Participant milestones, announcements, surveys, support configuration, and cohort exports.
- Session scheduling, tokenized scheduling links, meeting logs for booked or off-platform meetings, and optional Google Calendar / Google Meet integration.

### Matching and reporting

- Deterministic general-platform matching based on identity, specialty/interests, and requested help.
- Cohort matching and match management for program administrators.
- Cohort analytics covering match status, meetings over time, per-pair activity, milestone completion, goal completion, and session counts.
- Scheduled digest reminders for active cohorts, including prompts related to meetings, goals, milestones, surveys, and upcoming sessions.

## Tech Stack

- Next.js App Router with React, TypeScript, and Tailwind CSS.
- Supabase for PostgreSQL-backed data access and authentication, using server-mediated routes for application writes and privileged operations.
- Resend for transactional email.
- Cloudflare Turnstile for public-form protection.
- Google OAuth and Calendar API integration for calendar-backed scheduling.
- Sentry for error monitoring, PostHog and Vercel Analytics for product analytics, and Recharts for cohort reporting visualizations.
- Vercel cron configuration for the scheduled digest endpoint.

## Project Structure

- `src/app/` — App Router pages, layouts, route handlers, and API endpoints.
- `src/app/mentors/`, `src/app/mentor-onboarding/`, and `src/app/mentee-onboarding/` — general mentor discovery and intake flows.
- `src/app/dashboard/` — authenticated participant dashboard and relationship tools.
- `src/app/ascenso/` — Ascenso cohort landing, application, participation selection, and member dashboard routes.
- `src/app/admin/` — cohort administration, applications, matching, member management, delivery, surveys, milestones, announcements, and analytics.
- `src/lib/` — matching, authentication and access, Supabase clients, scheduling, email, cohort operations, analytics, and validation helpers.
- `src/data/` and `src/types/` — canonical intake options and shared application types.
- `supabase/migrations/` — active database migration chain.
- `docs/` — development, architecture, feature, operations, and database documentation.

## Local Development

### Prerequisites

Install a Node.js version compatible with the project’s `package-lock.json`, together with npm. A Supabase project and provider credentials are required for flows that access the database, authentication, email, Turnstile, or Google Calendar.

### Setup

Install dependencies:

```bash
npm install
```

Create an ignored `.env.local` file for local configuration. The application expects environment-variable names for Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`), Resend, Turnstile, Google Calendar OAuth, scheduled digests, and optional PostHog/Sentry integrations. See [`docs/development.md`](docs/development.md) for the complete current list and provider setup notes. Do not commit credentials.

Start the development server:

```bash
npm run dev
```

The package scripts also provide:

```bash
npm run lint
npx tsc --noEmit
npm run build
npm run start
```

There is no general `npm test` script. Database-specific verification commands and migration guidance are documented in [`database/README.md`](database/README.md).

## Deployment / Production

The repository includes a `vercel.json` cron declaration that invokes `/api/cron/digest` daily. `next.config.ts` also configures Sentry integration, security headers, and Supabase-hosted image patterns. Provider credentials, domains, OAuth redirect URLs, database migration state, and other hosted settings must be configured and verified outside the repository; repository configuration alone does not establish production state.

## Status

AP MED is under active development. The implementation and documentation continue to evolve as the platform supports additional structured mentorship program workflows.

## Documentation

- [`docs/development.md`](docs/development.md) — local setup, environment-variable names, and verification guidance
- [`docs/architecture/matching-and-public-data.md`](docs/architecture/matching-and-public-data.md) — matching behavior and public data boundaries
- [`docs/architecture/auth-and-access.md`](docs/architecture/auth-and-access.md) — authentication, roles, and access control
- [`docs/features/ascenso.md`](docs/features/ascenso.md) — current Ascenso cohort behavior
- [`docs/operations/email-and-calendar.md`](docs/operations/email-and-calendar.md) — email, scheduling, and calendar operations
- [`database/README.md`](database/README.md) — migration and database reproducibility guidance
