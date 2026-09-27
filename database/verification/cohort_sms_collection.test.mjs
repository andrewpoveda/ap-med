import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './test-support.mjs'

const {
  cohortSmsCollectionAnswers,
  getCohortSmsCollectionMode,
  validateCohortSmsCollectionInput,
} = loadTs('src/lib/cohort-sms-collection.ts')

test('collection mode defaults off for missing or malformed cohort configuration', () => {
  for (const config of [undefined, null, '', [], {}, { sms_phone_collection: true }, { sms_phone_collection: 'OTHER' }]) {
    assert.equal(getCohortSmsCollectionMode(config), 'off')
  }
  assert.equal(getCohortSmsCollectionMode({ sms_phone_collection: 'off' }), 'off')
  assert.equal(getCohortSmsCollectionMode({ sms_phone_collection: 'optional' }), 'optional')
  assert.equal(getCohortSmsCollectionMode({ sms_phone_collection: 'required' }), 'required')
})

test('disabled collection ignores forged input and omits all SMS application answers', () => {
  const result = validateCohortSmsCollectionInput('off', '2015550123', 'forged')
  assert.deepEqual(result, { ok: true, value: null })
  assert.deepEqual(cohortSmsCollectionAnswers(result.value), {})
})

test('optional and required collection validate phone while keeping consent optional', () => {
  assert.deepEqual(validateCohortSmsCollectionInput('optional', undefined, undefined), {
    ok: true, value: { phoneE164: null, consent: false },
  })
  assert.equal(validateCohortSmsCollectionInput('required', '', false).ok, false)
  assert.deepEqual(validateCohortSmsCollectionInput('required', '2015550123', false), {
    ok: true, value: { phoneE164: '+12015550123', consent: false },
  })
  assert.equal(validateCohortSmsCollectionInput('required', '2015550123', 'true').ok, false)
})
