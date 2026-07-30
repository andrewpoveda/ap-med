export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createMenteeSignInLink } from '@/lib/ascenso-auth'
import { sendAscensoSignInLink } from '@/lib/email'
import { getCohortName } from '@/lib/cohort-dashboard'
import { isValidEmail } from '@/lib/validate'

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

const DAILY_EMAIL_SOFT_CAP = 90

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
    const email = String(data.email).trim().toLowerCase()

    const admin = getSupabaseAdmin()

    // Cohort mentees only. A general-platform mentee (cohort_id IS NULL) is
    // auth-less by design and must never be handed an account, and a cohort
    // MENTOR signs in with Google at /login — neither is reachable from here.
    // ilike with no wildcards is a case-insensitive exact match.
    const { data: rows, error } = await admin
      .from('mentees')
      .select('id, full_name, email, cohort_id')
      .ilike('email', email)
      .not('cohort_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      console.error('Ascenso sign-in link lookup failed:', error.message)
      return NextResponse.json(
        { error: 'Could not send a sign-in link right now — please try again.' },
        { status: 500 },
      )
    }

    const mentee = rows?.[0]
    if (!mentee) return NextResponse.json(GENERIC_OK)

    // Shared email budget (PRM §2). Checked before generating anything so a
    // capped day doesn't churn auth users. Reported plainly: knowing the site
    // is out of email for the day reveals nothing about who is a member.
    const todayUtcStart = new Date()
    todayUtcStart.setUTCHours(0, 0, 0, 0)
    const { count, error: countError } = await admin
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', todayUtcStart.toISOString())
    if (countError) {
      console.error('email_log count failed:', countError.message)
      return NextResponse.json(
        { error: 'Could not send a sign-in link right now — please try again.' },
        { status: 500 },
      )
    }
    if ((count ?? 0) + 1 > DAILY_EMAIL_SOFT_CAP) {
      return NextResponse.json(
        { error: "We've hit today's email limit — please try again tomorrow." },
        { status: 429 },
      )
    }

    // Recipient is the row's own address, NOT the submitted one.
    const recipient = String(mentee.email ?? '').trim()
    if (!isValidEmail(recipient)) return NextResponse.json(GENERIC_OK)

    const origin = new URL(request.url).origin
    const signInUrl = await createMenteeSignInLink(admin, recipient, origin)
    if (!signInUrl) {
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

    return NextResponse.json(GENERIC_OK)
  } catch (err) {
    console.error('Ascenso sign-in link request crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
