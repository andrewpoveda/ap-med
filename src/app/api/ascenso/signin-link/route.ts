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
 * Legacy recovery for emailed sign-in; Google at /login is the primary path.
 * Retain until use can be ruled out (see ascenso-auth). This public route mails
 * only the stored cohort mentee address, never an authoritative browser-provided
 * recipient. Identical responses hide membership. Turnstile and the shared
 * email_log soft cap limit automated requests.
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
    const { data: memberships, error } = await admin
      .from('mentees')
      .select('id, person_id, full_name, email, cohort_id, membership_status')
      .eq('normalized_email', email)
      .not('cohort_id', 'is', null)

    if (error) {
      console.error('Ascenso sign-in link lookup failed:', error.message)
      return NextResponse.json(
        { error: 'Could not send a sign-in link right now — please try again.' },
        { status: 500 },
      )
    }

    const active = (memberships ?? []).filter(m => m.membership_status === 'active')
    if (!active.length) return NextResponse.json(GENERIC_OK)
    const identities = new Set(active.map(m => m.person_id))
    if (identities.size !== 1 || !active[0].person_id) return NextResponse.json(GENERIC_OK)
    // All qualifying rows are the same stable person. The callback presents
    // their owned programs instead of choosing an arbitrary cohort as authority.
    const mentee = active[0]

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

    const cohortName = active.length === 1 ? await getCohortName(admin, String(mentee.cohort_id)) : 'your Ascenso programs'

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
