# Ascenso recovery procedures and evidence

These are operator procedures, not an SLA or proof of production recoverability. No hosted restore, provider action or production migration was performed during readiness work. Keep actions scoped to the affected cohort and retain actor/reason history.

## Migration failure and recovery

Before rollout, confirm applied migration history independently, take a verified backup, run documented preflight queries, and schedule the locking migrations. Apply the active migration chain in order before dependent application code. An ambiguity/constraint failure is a stop for that migration: identify the conflicting records and agree on a correction; do not delete or reassign identities to make a migration pass.

Phase 7's disposable test deliberately introduces a conflicting identity, confirms the transaction rolls back without rewriting the original email, then removes only the synthetic conflict and retries successfully. This proves that test case, not that every real migration failure is harmless. Inspect actual transaction/application state after any failure.

After a successful data migration, prefer a reviewed forward fix. Older application releases may rely on superseded ownership/RPC semantics and must not be deployed blindly against the newer schema. There is no supported automatic down-migration. Restoring a pre-migration backup discards intervening writes and requires separately authorized downtime/data-loss decisions.

## Uncertain email

Use the cohort delivery-status page. Queued/failed/accepted describes provider acceptance, not inbox delivery. Safe retries reuse frozen message content and the original idempotency key. If a send is uncertain or its key window has elapsed, check the provider for that attempt and record an accepted or confirmed non-send outcome with a reason before retrying. Elapsed time alone is not permission for a fresh send. Check shared daily capacity and pending recipients; do not reset reservations manually to force a send.

Local Phase 2/4 tests cover atomic intent creation, budget accounting, retry state, expiry and operator resolution. They do not test a live provider outage or bounce reconciliation.

## Calendar cleanup

Cancellation commits in AP MED first and retains `calendar_cleanup_pending` until provider deletion succeeds. The owning mentor retries after reconnecting the appropriate participation if necessary. Confirm the external event before manual intervention; do not claim cancellation removed a Google event merely because the AP MED session is cancelled. Mentees request cancellation from the mentor and can rebook after coordination.

If Google event creation succeeded but the later booking insert failed, current code attempts provider rollback. A failed rollback can leave an orphan external event without a saved AP MED session ID. The member must check Calendar before retrying; operators need the provider event/error context to resolve it. This remains a limitation of the external transaction boundary, not a guaranteed automated recovery path.

## Access revocation and closeout

Super administrators revoke only the intended cohort grants. Recheck access in a new request; retain identity/event rows and other grants. Emergency global disablement remains an operator action. Revoking an application grant does not revoke the user's Google account.

Before closing a cohort, end live matches, remove unactivated selections, cancel future sessions, clear Calendar cleanup and resolve uncertain email. Closeout refuses unresolved work and retains history. Local tests exercise revoked/multiple grants, invalid transitions and closeout guards. They do not prove external account revocation or provider cleanup.

## Restore expectations

Before any paid rollout, identify the backup owner, actual backup/PITR availability and retention, acceptable data-loss/downtime targets, and a safe isolated restore destination. Exercise a restore with realistic non-production data and record date, source, restored row/reference checks and elapsed time. Database restore does not undo provider emails/events or restore external OAuth consent. Reconcile outbox attempts and Calendar state before resuming workers after a restore, to avoid duplicate sends or stale appointments.

No RPO/RTO, disaster-recovery certification or successful hosted restore is claimed here. CI runs synthetic database scenarios only and does not hold production secrets or deploy.

`database/verification/verify_phase11.sh` locally exercised PostgreSQL 17 custom-format dump/restore into a second disposable database. It compared counts for identity, participation, cohort, match, history and delivery tables; verified validated constraints, protected identity access and retained reassignment/delivery records. This is evidence for synthetic database restoration only, not hosted backups, storage objects, OAuth/provider reconciliation or a production recovery-time target.
