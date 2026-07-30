import type { SupabaseClient } from '@supabase/supabase-js'
import { linkMentorByEmail } from '@/lib/mentor-link'
import { linkCohortMenteeByEmail, cohortMenteeExistsForEmail } from '@/lib/mentee-link'

/**
 * Which AP MED surface a Google sign-in belongs to — the single branch point
 * behind the unified /login flow.
 *
 * Mentors and Ascenso cohort mentees now share one door (PRM §2 "Cohort
 * accounts", decided Jul 12 2026: both roles authenticate through the existing
 * Google OAuth + claim-by-email pattern). The account type is NOT a field on the
 * auth user — it is derived, per sign-in, from which member table holds a row
 * for the Google-verified email, and first sign-in claims that row by writing
 * auth_user_id. Deriving it means a row created or corrected after someone's
 * first sign-in still resolves on their next one, and there is no second copy of
 * the truth to drift.
 *
 * PRECEDENCE is mentor, then cohort mentee, and the short-circuit is load-bearing
 * rather than an optimization: linkCohortMenteeByEmail WRITES (it claims the
 * row), so attempting both would let a single auth user own a mentor row and a
 * cohort-mentee row at once — two dashboards, one identity. A mentor match
 * therefore stops the walk. The one case that hides is a single address sitting
 * on both a mentor row and a cohort-mentee row; that is a data problem (a shared
 * program inbox, or a past mentee now mentoring), so it is logged rather than
 * silently resolved.
 */

export type AccountResolution =
  /** A mentor row is linked to this user — includes cohort mentors. */
  | 'mentor'
  /** A cohort mentee row is linked to this user. */
  | 'mentee'
  /** Neither table has a row for this verified email. */
  | 'none'
  /** A row exists but a DIFFERENT auth user already claims it. */
  | 'conflict'
  /** A lookup failed; the role is unknown, not absent. */
  | 'unresolved'

/**
 * Resolve (and, on first sign-in, claim) the member row behind a signed-in auth
 * user. `email` must be the address from the auth server's own user object —
 * never anything read off the request — because possession of that mailbox is
 * what the claim grants.
 *
 * Requires the service-role client: both member tables are RLS-locked and
 * `email` is a server-only column.
 */
export async function resolveAccountForUser(
  admin: SupabaseClient,
  userId: string,
  email: string,
): Promise<AccountResolution> {
  const mentorResult = await linkMentorByEmail(admin, userId, email)

  if (mentorResult.status === 'linked') {
    // Read-only cross-check, no claim. If this email is also on a cohort mentee
    // row, precedence above just decided a tie that shouldn't exist — the mentee
    // row will never link on its own, so surface it. No address or row id in the
    // message (Sentry attaches console.error output as breadcrumbs); the pair is
    // findable by the signing-in user's email.
    if (await cohortMenteeExistsForEmail(admin, email)) {
      console.error(
        'Ambiguous account role — one email holds both a mentor row and a cohort mentee row; resolved as mentor',
      )
    }
    return 'mentor'
  }
  if (mentorResult.status === 'conflict') return 'conflict'
  if (mentorResult.status === 'error') return 'unresolved'

  const menteeResult = await linkCohortMenteeByEmail(admin, userId, email)
  if (menteeResult.status === 'linked') return 'mentee'
  if (menteeResult.status === 'conflict') return 'conflict'
  if (menteeResult.status === 'error') return 'unresolved'

  return 'none'
}

/**
 * Where a just-signed-in user lands. Paths only — the caller prefixes its own
 * server-derived origin, so no client-supplied host ever reaches a redirect.
 *
 * 'unresolved' falls through to /dashboard on purpose: that page re-attempts
 * BOTH links and renders whichever role comes back (or a "no linked profile"
 * card), so a transient lookup failure degrades into a retry rather than into a
 * wrong "no account found" verdict.
 */
export function signInDestination(resolution: AccountResolution): string {
  switch (resolution) {
    case 'mentor':
      return '/dashboard'
    case 'mentee':
      return '/ascenso/dashboard'
    case 'none':
      return '/login?error=no_account'
    case 'conflict':
      return '/login?error=account_conflict'
    case 'unresolved':
      return '/dashboard'
  }
}
