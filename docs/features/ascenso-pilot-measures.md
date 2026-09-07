# Ascenso pilot measurement definitions

Use one cohort and a dated observation window. Save the report date and denominator with each result. These are operational records, not causal outcomes or verified attendance. Current CSV exports provide stable IDs for joining records; keep identifiable exports restricted to authorized staff.

| Measure | Supported evidence and calculation | Limits |
|---|---|---|
| Application → approval | Applications: approved rows / submitted rows, grouped by role and track; use reviewed time for the current decision | Not an immutable history of every past decision; events provide supported transitions from their introduction onward |
| Approval → sign-in | Approved application member ID joined to member export's auth-identity-linked flag | Linkage is a proxy for account access; no first-sign-in timestamp or elapsed time is claimed |
| Selection → activation | Match ID, proposed time, approval time and real activation time; report selected/approved/active/ended separately | Ended relationships may have activated previously. Blank activation time is unknown, never approval time |
| Activation → first recorded meeting | Match ID joined to meeting logs; earliest valid met date on/after known activation date | Date-level interval, self-reported; exclude unknown activation times from timing denominator and disclose excluded count |
| Recurring recorded activity | Count distinct meeting dates per match and matches with at least two dates; show booked-session vs manual sources | Same-day manual logs may describe one meeting; do not sum booked sessions and logs as separate meetings |
| Goal completion | Done / (done + active); show dropped separately | Shared pair goal state, not individual work or causal attainment |
| Survey usefulness/satisfaction | Named response export joined to survey ID, wave and question definitions; show response count / invited eligible members | Only compute a rating if that question exists; nonresponse is not dissatisfaction, and responses are not anonymous |
| Support/intervention burden | Operational event count by action; during pilot keep a staff log of date, cohort, intervention category, minutes and outcome | Events do not measure elapsed staff time. Time/willingness-to-continue instrumentation remains Phase 15; never invent savings |
| Willingness to continue/renew | Explicit participant feedback and program-director renewal conversation | Not implied by bookings, logins or satisfaction scores; organization renewal differs from participant interest |

The follow-up list now means **no personal meeting-log or survey submission in 30 days** for a member in an active pair. A partner's log, future booking, goal update or staff-marked milestone does not clear it. Contact the member before interpreting this as disengagement: one partner may routinely log for both. Pair meeting totals remain separate, and scheduled/completed session counts never establish verified individual attendance.

Before the pilot, the director should choose expected meeting cadence, response targets and a support-time recording owner. Review these definitions and missing-data counts together during the pilot; do not tune thresholds after seeing results without documenting the change. Track manual spreadsheet/email preparation time using the same task definitions before and during the pilot if AP MED wants to discuss administrative time saved. No causal retention, pipeline or match-quality improvement is claimed.
