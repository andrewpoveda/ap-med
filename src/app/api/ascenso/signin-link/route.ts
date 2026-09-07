export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createMenteeSignInLink } from '@/lib/ascenso-auth'
import { sendAscensoSignInLink } from '@/lib/email'
import { getCohortName } from '@/lib/cohort-dashboard'
import { isValidEmail } from '@/lib/validate'
import { ascensoAbsoluteUrl } from '@/lib/site'
import { releaseEmailBudgetSlots } from '@/lib/email-budget'
import { normalizeEmail } from '@/lib/email-identity'

/**
 * DEPRECATED (superseded Jul 30 2026) — re-request an Ascenso mentee magic-link
 * sign-in. Mentees now sign in with Google at /login, and match-confirmation
 * emails no longer carry a magic link, so this is the last issuer of them.
 *
 * It stays live for the mentees who signed in by emailed link before the switch,
 * or who are still holding an older match email: those links expire on Supabase's
 * OTP schedule (about an hour), so without this route their only door closes
 * overnight and they're locked out mid-program. Retire it together with the rest
 * of the magic-link path (checklist in src/lib/ascenso-auth.ts) once email_log
 * shows no recent kind='signin_link' rows.
 *
 * Public and unauthenticated by necessity —
 * the whole point is that the caller can't sign in — so it carries the same
 * posture as the other public write routes plus two extra constraints:
 *
 *   - The link is mailed ONLY to the address on the cohort mentee row we found.
 *     The request body's address is a lookup key, never a recipient, so this
 *     can't be used to mail someone else's credential to a chosen inbox.
 *   - The response is identical whether or not a mentee exists, so the route
 *     isn't a membership oracle for the cohort roster.
 *
 * Turnstile gates it against drive-by automation, and the shared daily email
 * budget (email_log, same soft cap as announcements/digests/match notifies)
 * bounds the damage a determined caller can do to the Resend quota.
 */


// Deliberately identical for "sent", "no such mentee", and "not yet matched".
const GENERIC_OK = {
  success: true,
  message:
    "If that email belongs to an Ascenso member, a sign-in link is on its way. Check your inbox — and your spam folder, just in case.",
}

export async function POST(request: Request) {
  try {
    const data = await request.json().catch(() => ({}))

    const turnstileOk = await verifyTurnstileToken(data?.turnstile_token ?? '')
    if (!turnstileOk) {
      return NextResponse.json({ error: 'CAPTCHA verification failed' }, { status: 400 })
    }

    if (!isValidEmail(data?.email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }
    const email = normalizeEmail(String(data.email))

    const admin = getSupabaseAdmin()

    // Cohort mentees only. A general-platform mentee (cohort_id IS NULL) is
    // auth-less by design and must never be handed an account, and a cohort
    // MENTOR signs in with Google at /login — neither is reachable from here.
    // Ambiguous normalized identities fail closed; never choose by recency.
    const { data: mentee, error } = await admin
      .from('mentees')
      .select('id, full_name, email, cohort_id, membership_status')
      .eq('normalized_email', email)
      .not('cohort_id', 'is', null)
      .maybeSingle()

    if (error) {
      console.error('Ascenso sign-in link lookup failed:', error.message)
      return NextResponse.json(
        { error: 'Could not send a sign-in link right now — please try again.' },
        { status: 500 },
      )
    }

    if (!mentee || mentee.membership_status !== 'active') return NextResponse.json(GENERIC_OK)

    const recipient = String(mentee.email ?? '').trim()
    if (!isValidEmail(recipient)) return NextResponse.json(GENERIC_OK)
    const { data: reservation, error: budgetError } = await admin.rpc('reserve_email_budget', { p_slots: 1 })
    if (budgetError) return NextResponse.json({ error: 'Could not send a sign-in link right now.' }, { status: 500 })
    if (!reservation) return NextResponse.json(GENERIC_OK)

    // The emailed credential must always return to the configured Ascenso
    // origin, regardless of which deployment alias received this request.
    const signInUrl = await createMenteeSignInLink(
      admin,
      recipient,
      ascensoAbsoluteUrl(),
    )
    if (!signInUrl) {
      await releaseEmailBudgetSlots(admin, reservation, 1)
      return NextResponse.json(
        { error: 'Could not send a sign-in link right now — please try again.' },
        { status: 500 },
      )
    }

    const cohortName = await getCohortName(admin, String(mentee.cohort_id))

    try {
      await sendAscensoSignInLink({
        recipientEmail: recipient,
        recipientName: String(mentee.full_name ?? ''),
        cohortName,
        signInUrl,
      })
    } catch {
      // sendAscensoSignInLink already logged the Resend error.
      return NextResponse.json(
        { error: 'Could not send a sign-in link right now — please try again.' },
        { status: 500 },
      )
    }

    const { error: logError } = await admin.from('email_log').insert([
      {
        cohort_id: mentee.cohort_id,
        kind: 'signin_link',
        recipient_email: recipient,
        ref_id: mentee.id,
      },
    ])
    // The send already happened — a failed log line is server-side noise, not a
    // client error (same posture as the match-notify logging).
    if (logError) console.error('email_log insert failed:', logError.message)
    else await releaseEmailBudgetSlots(admin, reservation, 1)

    return NextResponse.json(GENERIC_OK)
  } catch (err) {
    console.error('Ascenso sign-in link request crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
