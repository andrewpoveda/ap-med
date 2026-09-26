import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifySmsKeyword,
  createSmsReplyReference,
  parseSmsCheckInReply,
  resolveInboundSms,
} from '../../src/lib/sms/domain.ts'

const now = new Date('2026-09-26T16:00:00.000Z')
const intent = {
  id: 'intent-1', kind: 'checkin', cohortId: 'cohort-1',
  matchId: 'match-1', sessionId: 'session-1', memberType: 'mentee', memberId: 'member-1',
  recipientPhoneE164: '+12025550101', senderPhoneE164: '+12025550999',
  body: 'How did your meeting go? Reply A1B2C3D4E5F6 followed by your answer.',
  replyReference: 'A1B2C3D4E5F6', replyExpiresAt: '2026-09-27T16:00:00.000Z',
  replyStatus: 'open',
}
const event = {
  externalMessageId: 'incoming-1', fromPhoneE164: '+12025550101',
  toPhoneE164: '+12025550999', body: 'A1B2C3D4E5F6 It went well.',
}

test('reply reference has the required format', () => {
  assert.match(createSmsReplyReference(), /^[A-F0-9]{12}$/)
})

test('whole-message opt-out, opt-in and help words are classified without attributing a check-in', () => {
  assert.equal(classifySmsKeyword(' stop '), 'opt_out')
  assert.equal(classifySmsKeyword('Unsubscribe'), 'opt_out')
  assert.equal(classifySmsKeyword('START'), 'opt_in')
  assert.equal(classifySmsKeyword('help'), 'help')
  assert.equal(classifySmsKeyword('Stop please'), null)
  assert.deepEqual(resolveInboundSms({ ...event, body: '  STOP  ' }, [intent], new Set(), now), {
    kind: 'opt_out',
  })
})

test('a reply needs an exact leading reference and nonempty answer', () => {
  assert.deepEqual(parseSmsCheckInReply('a1b2c3d4e5f6  It went well.'), {
    reference: 'A1B2C3D4E5F6', answer: 'It went well.',
  })
  for (const body of ['It went well.', 'A1B2C3D4E5F6', 'A1B2C3D4E5F6   ',
    'It went well A1B2C3D4E5F6', 'A1B2C3D4E5F7 It went well']) {
    const decision = resolveInboundSms({ ...event, body }, [intent], new Set(), now)
    assert.equal(decision.kind, 'unmatched')
  }
})

test('reply text respects the shared check-in limit without truncation', () => {
  const maximum = 'a'.repeat(2000)
  assert.equal(parseSmsCheckInReply(`A1B2C3D4E5F6 ${maximum}`)?.answer, maximum)
  assert.equal(parseSmsCheckInReply(`A1B2C3D4E5F6 ${maximum}a`), null)
  assert.equal(parseSmsCheckInReply(`A1B2C3D4E5F6 ${'😀'.repeat(2000)}`)?.answer,
    '😀'.repeat(2000))
  assert.deepEqual(resolveInboundSms({ ...event, body: `A1B2C3D4E5F6 ${maximum}a` },
    [intent], new Set(), now), { kind: 'unmatched', reason: 'missing_reference' })
})

test('an answer maps to its exact member, pair, cohort and session intent', () => {
  assert.deepEqual(resolveInboundSms(event, [intent], new Set(), now), {
    kind: 'check_in_reply', intent, answer: 'It went well.',
  })
})

test('wrong sender, destination, closed or expired prompt, and duplicate inbound ID fail closed', () => {
  const cases = [
    [{ ...event, fromPhoneE164: '+12025550102' }, [intent], new Set(), 'no_match'],
    [{ ...event, toPhoneE164: '+12025550998' }, [intent], new Set(), 'no_match'],
    [event, [{ ...intent, replyStatus: 'answered' }], new Set(), 'no_match'],
    [event, [{ ...intent, replyExpiresAt: '2026-09-26T16:00:00.000Z' }], new Set(), 'no_match'],
    [event, [{ ...intent, kind: 'reminder' }], new Set(), 'no_match'],
    [event, [intent], new Set(['incoming-1']), 'duplicate_message'],
  ]
  for (const [incoming, intents, seenIds, reason] of cases) {
    assert.deepEqual(resolveInboundSms(incoming, intents, seenIds, now), {
      kind: 'unmatched', reason,
    })
  }
})

test('ambiguous prompts and malformed inbound events are never attributed', () => {
  assert.deepEqual(resolveInboundSms(event, [intent, { ...intent, id: 'intent-2' }], new Set(), now), {
    kind: 'unmatched', reason: 'ambiguous_match',
  })
  assert.deepEqual(resolveInboundSms({ ...event, fromPhoneE164: '2025550101' }, [intent], new Set(), now), {
    kind: 'unmatched', reason: 'invalid_message',
  })
})
