import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SMS_CONSENT_NOTICE,
  SMS_CONSENT_NOTICE_VERSION,
  normalizeUsPhoneNumber,
  smsConsentAnswers,
  validateSmsContactInput,
} from '../../src/lib/sms-consent.ts'

test('US phone input is normalized without accepting another country or letters', () => {
  assert.equal(normalizeUsPhoneNumber('(201) 555-0123'), '+12015550123')
  assert.equal(normalizeUsPhoneNumber('1-201-555-0123'), '+12015550123')
  assert.equal(normalizeUsPhoneNumber('+1 201 555 0123'), '+12015550123')
  assert.equal(normalizeUsPhoneNumber('+44 20 7946 0958'), null)
  assert.equal(normalizeUsPhoneNumber('+2015550123'), null)
  assert.equal(normalizeUsPhoneNumber('201-555-CALL'), null)
  assert.equal(normalizeUsPhoneNumber('101-555-0123'), null)
  assert.equal(normalizeUsPhoneNumber('201-155-0123'), null)
})

test('SMS contact is optional, but a checked consent needs a valid phone', () => {
  assert.deepEqual(validateSmsContactInput(undefined, undefined), {
    ok: true,
    value: { phoneE164: null, consent: false },
  })
  assert.deepEqual(validateSmsContactInput('', false), {
    ok: true,
    value: { phoneE164: null, consent: false },
  })
  assert.equal(validateSmsContactInput('', true).ok, false)
  assert.equal(validateSmsContactInput('not a number', true).ok, false)
  assert.equal(validateSmsContactInput('2015550123', 'true').ok, false)
  assert.deepEqual(validateSmsContactInput('2015550123', false), {
    ok: true,
    value: { phoneE164: '+12015550123', consent: false },
  })
  assert.deepEqual(validateSmsContactInput('2015550123', true), {
    ok: true,
    value: { phoneE164: '+12015550123', consent: true },
  })
})

test('consent evidence is server-created only for an explicit opt-in', () => {
  const at = new Date('2026-09-26T14:00:00.000Z')
  assert.deepEqual(smsConsentAnswers({ phoneE164: '+12015550123', consent: true }, at), {
    sms_phone_e164: '+12015550123',
    sms_consent: true,
    sms_consent_notice: SMS_CONSENT_NOTICE,
    sms_consent_notice_version: SMS_CONSENT_NOTICE_VERSION,
    sms_consented_at: '2026-09-26T14:00:00.000Z',
  })
  assert.deepEqual(smsConsentAnswers({ phoneE164: '+12015550123', consent: false }, at), {
    sms_phone_e164: '+12015550123',
    sms_consent: false,
    sms_consent_notice: null,
    sms_consent_notice_version: null,
    sms_consented_at: null,
  })
})
