import { normalizeUsPhoneNumber } from '@/lib/sms-consent'
import type { CohortApplication } from '@/types/cohort'
import type { SupabaseClient } from '@supabase/supabase-js'

export const SMS_HANDOFF_WARNING =
  'Decision saved, but the SMS phone preference could not be copied. The member can add it from their dashboard once SMS is enabled.'
export const SMS_HANDOFF_CONFLICT_WARNING =
  'Decision saved, but this application\'s SMS phone or consent differs from the member\'s saved preference or phone opt-out. Ask the member to review SMS settings once enabled; an opted-out number must text START first.'

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
