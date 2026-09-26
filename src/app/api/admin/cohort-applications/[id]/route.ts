export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendCohortDeliveries } from '@/lib/cohort-delivery'
import { normalizeEmail } from '@/lib/email-identity'
import { cap, LIMITS } from '@/lib/validate'
import { normalizeUsPhoneNumber } from '@/lib/sms-consent'
import type { CohortApplication } from '@/types/cohort'
import type { SupabaseClient } from '@supabase/supabase-js'

// Board review actions (ascenso-prm.md §5.3): approve / reject / waitlist a
// cohort application, with review notes. Approve also creates-or-claims the
// mentor/mentees row with cohort_id and writes member_id back. Admin-only:
// session email must be in admin_users AND scoped to the application's cohort.
// Non-admins get the same 404 the /admin pages give — this surface should not
// be discoverable by probing.

const STATUS_BY_ACTION: Record<string, string> = {
  approve: 'approved',
  reject: 'rejected',
  waitlist: 'waitlisted',
}

const SMS_HANDOFF_WARNING =
  'Decision saved, but the SMS phone preference could not be copied. The member can add it from their dashboard once SMS is enabled.'

/**
 * Approval and its email intent have already committed in the review RPC. This
 * optional handoff only inserts a missing contact; a member's later dashboard
 * preference always wins. No SMS is sent here.
 */
async function handoffApplicationSmsContact(
  admin: SupabaseClient,
  application: CohortApplication,
): Promise<string | null> {
  const initialAnswers = application.answers && typeof application.answers === 'object' && !Array.isArray(application.answers)
    ? application.answers : {}
  const hasNoConsentEvidence = initialAnswers.sms_consented_at == null &&
    initialAnswers.sms_consent_notice == null && initialAnswers.sms_consent_notice_version == null
  if (initialAnswers.sms_phone_e164 == null && hasNoConsentEvidence &&
      (initialAnswers.sms_consent == null || initialAnswers.sms_consent === false)) return null

  const { data: linked, error: linkedError } = await admin.from('cohort_applications')
    .select('member_id,cohort_id,role,answers')
    .eq('id', application.id)
    .eq('cohort_id', application.cohort_id)
    .maybeSingle()
  if (linkedError || !linked || !linked.member_id) return SMS_HANDOFF_WARNING

  const answers = linked.answers && typeof linked.answers === 'object' && !Array.isArray(linked.answers)
    ? linked.answers as Record<string, unknown>
    : {}
  const rawPhone = answers.sms_phone_e164
  const consent = answers.sms_consent
  if (rawPhone == null && consent == null) {
    return answers.sms_consented_at == null && answers.sms_consent_notice == null &&
      answers.sms_consent_notice_version == null ? null : SMS_HANDOFF_WARNING
  }
  if (rawPhone == null && consent === false) {
    return answers.sms_consented_at == null && answers.sms_consent_notice == null &&
      answers.sms_consent_notice_version == null ? null : SMS_HANDOFF_WARNING
  }
  if (typeof rawPhone !== 'string' || typeof consent !== 'boolean') return SMS_HANDOFF_WARNING

  const phone = normalizeUsPhoneNumber(rawPhone)
  if (!phone || phone !== rawPhone) return SMS_HANDOFF_WARNING

  let consentedAt: string | null = null
  let consentNotice: string | null = null
  let consentNoticeVersion: string | null = null
  if (consent) {
    const recordedAt = answers.sms_consented_at
    const recordedNotice = answers.sms_consent_notice
    const recordedVersion = answers.sms_consent_notice_version
    const parsedAt = typeof recordedAt === 'string' ? new Date(recordedAt) : null
    if (
      typeof recordedNotice !== 'string' || !recordedNotice.trim() ||
      typeof recordedVersion !== 'string' || !recordedVersion.trim() ||
      !parsedAt || Number.isNaN(parsedAt.getTime()) ||
      parsedAt.toISOString() !== recordedAt
    ) return SMS_HANDOFF_WARNING
    consentedAt = recordedAt as string
    consentNotice = recordedNotice
    consentNoticeVersion = recordedVersion
  } else if (
    answers.sms_consented_at != null ||
    answers.sms_consent_notice != null ||
    answers.sms_consent_notice_version != null
  ) {
    return SMS_HANDOFF_WARNING
  }

  const memberTable = linked.role === 'mentor' ? 'mentor' : linked.role === 'mentee' ? 'mentees' : null
  if (!memberTable) return SMS_HANDOFF_WARNING
  const { data: member, error: memberError } = await admin.from(memberTable)
    .select('person_id').eq('id', linked.member_id).eq('cohort_id', linked.cohort_id).maybeSingle()
  if (memberError || !member?.person_id) return SMS_HANDOFF_WARNING

  const { error: insertError } = await admin.from('cohort_sms_contacts').upsert({
    cohort_id: linked.cohort_id,
    person_id: member.person_id,
    phone_e164: phone,
    consented_at: consentedAt,
    consent_source: consent ? 'cohort_application' : null,
    consent_notice: consentNotice,
    consent_notice_version: consentNoticeVersion,
  }, { onConflict: 'cohort_id,person_id', ignoreDuplicates: true })
  if (insertError) {
    // Provider/database details can contain the phone; keep it out of logs.
    console.error('SMS contact handoff failed', { code: insertError.code ?? 'unknown' })
    return SMS_HANDOFF_WARNING
  }
  return null
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await resolveAdminSession()
    if (session.status === 'unauthenticated') {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    if (session.status === 'not_admin') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const { adminUser } = session

    const { id } = await ctx.params
    const body = await request.json().catch(() => ({}))

    const action = String(body.action ?? '')
    const status = STATUS_BY_ACTION[action]
    if (!status) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    const notes = cap(body.notes, LIMITS.text).trim()

    const admin = getSupabaseAdmin()
    // A malformed id lands here as a lookup error → same 404 as a miss.
    const { data: application, error } = await admin
      .from('cohort_applications')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error || !application) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const app = application as CohortApplication

    if (!canAccessCohort(adminUser, app.cohort_id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { data: savedStatus, error: reviewError } = await admin.rpc('ascenso_review_application', {
      p_id: app.id, p_actor: adminUser.id, p_status: status,
      p_notes: notes, p_email: normalizeEmail(app.email),
    })
    if (reviewError) {
      return NextResponse.json({ error: reviewError.code === '23514'
        ? reviewError.message : 'Could not save the review; refresh and try again' }, { status: 409 })
    }
    let smsWarning: string | null = null
    if (savedStatus === 'approved') {
      try {
        smsWarning = await handoffApplicationSmsContact(admin, app)
      } catch {
        // Approval and the delivery intent are already committed; still attempt
        // the decision email and tell the administrator to repair SMS enrollment.
        console.error('SMS contact handoff crashed')
        smsWarning = SMS_HANDOFF_WARNING
      }
    }
    const sent = await sendCohortDeliveries(admin, app.id, app.cohort_id)
    const warnings = [
      smsWarning,
      !sent ? 'Decision saved. Email acceptance is incomplete; use delivery recovery below.' : null,
    ].filter((warning): warning is string => warning !== null)
    return NextResponse.json({ success: true, status: savedStatus,
      ...(warnings.length ? { warning: warnings.join(' ') } : {}) })
  } catch (err) {
    console.error('Application review crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
