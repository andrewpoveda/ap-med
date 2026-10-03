/**
 * The exact optional SMS disclosure shown to cohort applicants. Keep the text
 * and version together so a later wording change cannot rewrite old consent.
 */
export const SMS_CONSENT_NOTICE_VERSION = '2026-09-26-v1'
export const SMS_CONSENT_NOTICE =
  'I agree to receive AP MED text reminders about meetings and one-question post-meeting check-ins for this cohort. My replies are named and visible to authorized program administrators. Up to two AP MED texts per booked meeting. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is optional and is not a condition of participation. Do not include patient information in replies.'

export type ValidatedSmsContact = {
  phoneE164: string | null
  consent: boolean
}

/** Accept a US/NANP number and return its canonical +1 E.164 form. */
export function normalizeUsPhoneNumber(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value || value.length > 40 || !/^\+?[0-9().\s-]+$/.test(value)) return null

  const digits = value.replace(/\D/g, '')
  if (value.startsWith('+') && (digits.length !== 11 || !digits.startsWith('1'))) return null
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (national.length !== 10 || !/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return null
  return `+1${national}`
}

/** Missing fields from older clients mean no phone and no SMS permission. */
export function validateSmsContactInput(
  rawPhone: unknown,
  rawConsent: unknown,
): { ok: true; value: ValidatedSmsContact } | { ok: false; error: string } {
  if (rawConsent !== undefined && typeof rawConsent !== 'boolean') {
    return { ok: false, error: 'Invalid SMS consent choice' }
  }
  if (rawPhone != null && typeof rawPhone !== 'string') {
    return { ok: false, error: 'Enter a valid US mobile phone number' }
  }

  const phone = typeof rawPhone === 'string' ? rawPhone.trim() : ''
  const consent = rawConsent === true
  if (!phone) {
    return consent
      ? { ok: false, error: 'Add your mobile phone number to receive texts' }
      : { ok: true, value: { phoneE164: null, consent: false } }
  }

  const phoneE164 = normalizeUsPhoneNumber(phone)
  if (!phoneE164) return { ok: false, error: 'Enter a valid US mobile phone number' }
  return { ok: true, value: { phoneE164, consent } }
}

/** Only the server decides which notice was accepted and when. */
export function smsConsentAnswers(contact: ValidatedSmsContact, now = new Date()) {
  return {
    sms_phone_e164: contact.phoneE164,
    sms_consent: contact.consent,
    sms_consent_notice: contact.consent ? SMS_CONSENT_NOTICE : null,
    sms_consent_notice_version: contact.consent ? SMS_CONSENT_NOTICE_VERSION : null,
    sms_consented_at: contact.consent ? now.toISOString() : null,
  }
}
