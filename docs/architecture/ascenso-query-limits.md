# Ascenso query and matching limits

## Complete reads

`completeQuery` reads ordered pages until empty, using actual returned row count to advance even when the server cap is below the requested 500 rows. It applies a unique ID tie-breaker; scoped grant queries supply their unique admin/cohort key instead. Every caller applies its authorization filters before pagination. Errors discard accumulated partial results. Do not use this helper for mutations, single-row queries, head/count-only queries, deliberately limited recent-history lists or tables without a suitable unique order key.

The memory guard is 100,000 rows per logical read, including all batches of `completeInQuery`. Exceeding it returns an explicit error rather than a partial export. Large IN filters use at most 50 unique values per request. These are bounded request/memory policies, not a measured enterprise throughput guarantee. Export responses and named survey/report records remain sensitive.

Coverage includes export data and label joins, analytics, digest inputs/cooldowns, matching rosters/tracks/approvers, application/member/milestone lists, survey counts/details, announcements and recipient selection, grants, participation choices, and source-scoped delivery reads. The delivery-status page retains explicit 50-row pagination. Recent member events (30) and announcement history (10) remain intentionally limited views; complete operational history is available by export.

Multi-request reads are not a transaction snapshot. Run formal pilot exports during a quiet review period and retain their timestamp/definition version; if a buyer requires a guaranteed point-in-time export, implement a scoped database snapshot/export job then. Do not claim audit-snapshot semantics from pagination alone. PostgREST range errors remain failures rather than being treated as successful completion; see [PostgREST pagination](https://postgrest.org/en/stable/references/api/pagination_count.html).

## Matching

The intended assisted pilot envelope is up to 200 active participants in a cohort, with no more than 10,000 unmatched mentor × mentee combinations per track. The page enforces the combination bound before building a ranking, shows a clear message above that bound, and does not silently rank a subset. This is a conservative product guardrail, not a production load-test result.

Candidate generation is O(mentors × mentees) within each track, followed by sorting. Historical exact-pair membership uses a set rather than a full history scan per candidate. No distributed matcher, background optimizer or configurable capacity was added. Before onboarding a larger intended cohort, benchmark representative data and review a narrower board workflow or batching with the director. Never split real program history merely to evade the guardrail.

No migration, environment variable, provider change or deployment is required by Phase 10 itself. Prior-phase migrations still precede their dependent application code.
