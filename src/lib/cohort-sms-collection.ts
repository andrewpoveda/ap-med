import {
  smsConsentAnswers,
  validateSmsContactInput,
  type ValidatedSmsContact,
} from '@/lib/sms-consent'

export type CohortSmsCollectionMode = 'off' | 'optional' | 'required'

/** A missing or unknown setting must never collect a phone number by accident. */
export function getCohortSmsCollectionMode(config: unknown): CohortSmsCollectionMode {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return 'off'
  const mode = (config as Record<string, unknown>).sms_phone_collection
  return mode === 'optional' || mode === 'required' ? mode : 'off'
}

/** Apply the same cohort policy in the form and in the server intake route. */
export function validateCohortSmsCollectionInput(
  mode: CohortSmsCollectionMode,
  rawPhone: unknown,
  rawConsent: unknown,
): { ok: true; value: ValidatedSmsContact | null } | { ok: false; error: string } {
  // Ignore even malformed or forged SMS fields when collection is disabled.
  if (mode === 'off') return { ok: true, value: null }

  const result = validateSmsContactInput(rawPhone, rawConsent)
  if (!result.ok) return result
  if (mode === 'required' && !result.value.phoneE164) {
    return { ok: false, error: 'Add your mobile phone number to continue. If the phone field is missing, reload this page.' }
  }
  return result
}

/** Only enabled collection writes SMS keys to application answers. */
export function cohortSmsCollectionAnswers(contact: ValidatedSmsContact | null, now = new Date()) {
  return contact === null ? {} : smsConsentAnswers(contact, now)
}
