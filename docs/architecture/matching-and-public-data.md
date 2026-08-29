# Matching and Public Data

Read this document for work on mentor onboarding, mentee onboarding, matching, the directory, or client-reachable mentor APIs. Source code remains authoritative.

## Matching contract

`src/lib/match.ts` is the shared scorer used by matching and notification flows. It calculates a rounded 0–100 score from exact tag overlap:

- identity: 40%
- specialty/interests: 35%
- requested help/capabilities: 25%

Each category scores the fraction of the mentee's selected values present in the mentor's values. An empty mentee preference scores as a full match for that category; empty mentor tags score zero when the mentee selected preferences. The scorer does not use fuzzy text, ranking models, geography, capacity, or implicit synonyms.

Canonical selectable values live in `src/data/specialties.ts` and `src/data/tags.ts`. General-platform and Ascenso help vocabularies are intentionally separate. Treat stored strings as data identifiers: rewording one without compatibility handling can silently reduce existing matches.

## Public mentor boundary

`src/types/mentor.ts` defines `PUBLIC_MENTOR_COLUMNS`, `PublicMentor`, and `toPublicMentor`. All client-reachable mentor queries and responses must use that projection. Sensitive or operational columns—including email, notes, contact methods, capacity, scheduling URL, approval state, account links, and cohort membership—remain server-only.

Public mentor surfaces include only approved general-platform mentors and must retain both filters:

- `approved = true`
- `cohort_id is null`

Never replace the public projection with `select('*')`, accept a recipient email from the browser, or expose cohort mentors in general search results.

## Submission and isolation rules

General mentees are auth-less. `/api/mentees` validates and writes their submissions server-side, uses a client-generated UUID `submission_id` for retry idempotency, and returns a public mentor projection. If the post-write mentor lookup fails, it returns an empty result rather than leaking or fabricating data.

General-platform records are identified by `cohort_id is null`. Ascenso records use a non-null cohort ID and must be queried within that cohort. A cohort member appearing on a public surface is a security defect, not a display preference.

Do not record live mentor counts, approval totals, or current production rows here. Verify those against the authorized production source only when a task explicitly requires it.
