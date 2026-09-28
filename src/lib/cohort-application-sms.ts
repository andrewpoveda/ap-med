import { normalizeUsPhoneNumber } from '@/lib/sms-consent'
import type { CohortApplication } from '@/types/cohort'
import type { SupabaseClient } from '@supabase/supabase-js'

export const SMS_HANDOFF_WARNING =
  'Decision saved, but SMS phone enrollment could not be confirmed. Retry from this application review page; the member can also update their SMS settings once enabled.'
export const SMS_HANDOFF_CONFLICT_WARNING =
  'Decision saved, but this application\'s SMS phone or consent differs from the member\'s saved preference or phone opt-out. Ask the member to review SMS settings once enabled; an opted-out number must text START first. Then retry phone enrollment.'

export type SmsHandoffState = 'pending' | 'complete' | 'needs_review' | 'conflict'

/** No handoff is needed when optional collection produced no phone or consent. */
export function hasApplicationSmsContact(answers: unknown): boolean {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return false
  const value = answers as Record<string, unknown>
  return value.sms_phone_e164 != null || value.sms_consent === true || value.sms_consent === 'true' ||
    value.sms_consented_at != null || value.sms_consent_notice != null ||
    value.sms_consent_notice_version != null
}

/**
 * Approval and its email intent have already committed in the review RPC. This
 * optional handoff only inserts a missing contact; a member's later dashboard
 * preference always wins. No SMS is sent here. Any cohort application using
 * the shared SMS answer keys can take this path without a program-specific copy.
 */
export async function handoffApplicationSmsContact(
  admin: SupabaseClient,
  application: CohortApplication,
): Promise<string | null> {
  const initialAnswers = application.answers && typeof application.answers === 'object' && !Array.isArray(application.answers)
    ? application.answers : {}
  if (!hasApplicationSmsContact(initialAnswers)) return null

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
  // A second participation can share this person and cohort. DO NOTHING keeps
  // any later dashboard edit or revocation authoritative, but a conflicting
  // application must not appear to the administrator as if it were enrolled.
  const { data: saved, error: savedError } = await admin.from('cohort_sms_contacts')
    .select('phone_e164,consented_at,opted_out_at')
    .eq('cohort_id', linked.cohort_id).eq('person_id', member.person_id).maybeSingle()
  if (savedError || !saved) return SMS_HANDOFF_WARNING
  if (saved.phone_e164 !== phone) return SMS_HANDOFF_CONFLICT_WARNING

  // The dashboard deliberately keeps its revoke action available when this
  // lookup fails. Approval needs stricter verification before claiming that
  // application consent actually took effect.
  const { data: suppression, error: suppressionError } = await admin.from('sms_phone_suppressions')
    .select('opted_out_at,resumed_at').eq('phone_e164', phone).maybeSingle()
  if (suppressionError) return SMS_HANDOFF_WARNING
  const consentTime = saved.consented_at ? Date.parse(saved.consented_at) : NaN
  const stopTime = suppression ? Date.parse(suppression.opted_out_at) : NaN
  const resumeTime = suppression?.resumed_at ? Date.parse(suppression.resumed_at) : NaN
  const effectiveConsent = Number.isFinite(consentTime) && !saved.opted_out_at &&
    (!suppression || (Number.isFinite(stopTime) && Number.isFinite(resumeTime) &&
      resumeTime > stopTime && consentTime > stopTime))
  if (consent && !effectiveConsent) {
    return SMS_HANDOFF_CONFLICT_WARNING
  }
  return null
}

/**
 * Approval marks the handoff pending in the same database transaction as the
 * member decision. This completes that durable state after verifying the copy.
 * A failed status write leaves pending visible for the admin retry control.
 */
export async function completeApplicationSmsHandoff(
  admin: SupabaseClient,
  application: CohortApplication,
  actorId: string,
): Promise<string | null> {
  if (!hasApplicationSmsContact(application.answers)) return null

  let warning: string | null
  try {
    warning = await handoffApplicationSmsContact(admin, application)
  } catch {
    // Errors can include phone data; the durable pending state is sufficient
    // for the administrator to find and retry this handoff later.
    console.error('SMS contact handoff crashed')
    warning = SMS_HANDOFF_WARNING
  }

  const state: SmsHandoffState = warning === null ? 'complete'
    : warning === SMS_HANDOFF_CONFLICT_WARNING ? 'conflict' : 'needs_review'
  let data: unknown = null
  let error: { code?: string } | null = null
  try {
    const result = await admin.rpc('sms_record_application_handoff', {
      p_application: application.id,
      p_cohort: application.cohort_id,
      p_actor: actorId,
      p_state: state,
    })
    data = result.data
    error = result.error
  } catch {
    console.error('SMS handoff status update crashed')
    return SMS_HANDOFF_WARNING
  }
  if (error || typeof data !== 'string' ||
      !['complete', 'needs_review', 'conflict'].includes(data)) {
    console.error('SMS handoff status update failed', { code: error?.code ?? 'unknown' })
    return SMS_HANDOFF_WARNING
  }
  // A second retry may already have succeeded; that result wins over this
  // request's stale failure, and the administrator should see it as complete.
  return data === 'complete' ? null : data === 'conflict'
    ? SMS_HANDOFF_CONFLICT_WARNING : SMS_HANDOFF_WARNING
}
