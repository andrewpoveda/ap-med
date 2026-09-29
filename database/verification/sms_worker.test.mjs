import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { loadTs } from './test-support.mjs'

const {
  buildCheckinSms,
  buildReminderSms,
  isSmsPhoneSuppressed,
  runSmsWorker,
  sendPendingSmsIntents,
  smsDueWindows,
} = loadTs('src/lib/sms/worker.ts', { 'node:crypto': { randomBytes } })

const senderPhoneE164 = '+12025550999'
const claim = {
  id: 'intent-1', kind: 'checkin', phone_e164: '+12025550101',
  sender_phone_e164: senderPhoneE164, body: 'AP MED check-in',
  reply_code: 'A1B2C3D4E5F6',
}

test('SMS due windows cannot backfill historical meetings', () => {
  const window = smsDueWindows(new Date('2026-09-26T12:00:00Z'))
  assert.deepEqual(window, {
    reminderFrom: '2026-09-27T06:00:00.000Z',
    reminderThrough: '2026-09-27T18:00:00.000Z',
    checkinFrom: '2026-09-25T11:00:00.000Z',
    checkinThrough: '2026-09-26T11:00:00.000Z',
  })
  assert.throws(() => smsDueWindows(new Date('invalid')))
})

test('SMS messages name AP MED, include STOP, and give exact check-in reply format', () => {
  const reminder = buildReminderSms()
  const checkin = buildCheckinSms('A1B2C3D4E5F6')
  for (const body of [reminder, checkin]) {
    assert.match(body, /^AP MED:/)
    assert.match(body, /Reply STOP to unsubscribe\./)
    assert.ok(body.length <= 1600)
  }
  assert.match(checkin, /Reply A1B2C3D4E5F6 then your answer/)
  assert.match(checkin, /No patient information/)
  assert.throws(() => buildCheckinSms('bad-code'))
})

test('STOP remains effective until newer consent, even after START', () => {
  const stopped = { opted_out_at: '2026-09-25T12:00:00Z', resumed_at: null }
  assert.equal(isSmsPhoneSuppressed(stopped, '2026-09-24T12:00:00Z'), true)
  assert.equal(isSmsPhoneSuppressed({ ...stopped, resumed_at: '2026-09-26T12:00:00Z' },
    '2026-09-24T12:00:00Z'), true)
  assert.equal(isSmsPhoneSuppressed({ ...stopped, resumed_at: '2026-09-26T12:00:00Z' },
    '2026-09-26T13:00:00Z'), false)
  assert.equal(isSmsPhoneSuppressed({ ...stopped, opted_out_at: 'bad' },
    '2026-09-26T13:00:00Z'), true)
})

test('a duplicate cron run cannot send an unclaimed intent', async () => {
  const rpcCalls = []
  let sendCount = 0
  const admin = { rpc: async (name, args) => {
    rpcCalls.push([name, args])
    return { data: null, error: null }
  } }
  const provider = {
    name: 'twilio', senderPhoneE164,
    send: async () => { sendCount++; return { kind: 'accepted', externalMessageId: 'SM123', fromPhoneE164: senderPhoneE164 } },
  }
  const result = await sendPendingSmsIntents(admin, provider, ['intent-1', 'intent-1'])
  assert.equal(sendCount, 0)
  assert.deepEqual(rpcCalls.map(call => call[0]), ['sms_claim_outbox'])
  assert.equal(result.skippedChanged, 1)
})

test('provider acceptance records a durable ID once; uncertainty never retries', async () => {
  const calls = []
  let sendCount = 0
  let claimed = false
  const admin = { rpc: async (name, args) => {
    calls.push([name, args])
    if (name === 'sms_claim_outbox') {
      if (claimed) return { data: null, error: null }
      claimed = true
      return { data: claim, error: null }
    }
    if (name === 'sms_check_claim_eligible') return { data: true, error: null }
    return { data: { id: claim.id }, error: null }
  } }
  const provider = {
    name: 'twilio', senderPhoneE164,
    send: async () => {
      sendCount++
      return { kind: 'accepted', externalMessageId: 'SM123', fromPhoneE164: senderPhoneE164 }
    },
  }
  const first = await sendPendingSmsIntents(admin, provider, [claim.id])
  const second = await sendPendingSmsIntents(admin, provider, [claim.id])
  assert.equal(sendCount, 1)
  assert.equal(first.accepted, 1)
  assert.equal(second.skippedChanged, 1)
  assert.deepEqual(calls[2], ['sms_finish_outbox', {
    p_id: claim.id, p_outcome: 'accepted', p_provider: 'twilio',
    p_provider_message_id: 'SM123', p_detail: 'Provider accepted SMS',
  }])
})

test('a thrown provider call becomes needs_review with no automatic retry', async () => {
  const calls = []
  const admin = { rpc: async (name, args) => {
    calls.push([name, args])
    return { data: name === 'sms_claim_outbox' ? claim :
      name === 'sms_check_claim_eligible' ? true : { id: claim.id }, error: null }
  } }
  const result = await sendPendingSmsIntents(admin, {
    name: 'twilio', senderPhoneE164,
    send: async () => { throw new Error('private provider payload') },
  }, [claim.id])
  assert.equal(result.needsReview, 1)
  assert.equal(result.accepted, 0)
  assert.equal(calls[2][1].p_outcome, 'unknown')
  assert.doesNotMatch(calls[2][1].p_detail, /private provider payload/)
})

test('a STOP detected after claim supersedes the intent without a provider call', async () => {
  const calls = []
  let sendCount = 0
  const admin = { rpc: async (name, args) => {
    calls.push([name, args])
    return { data: name === 'sms_claim_outbox' ? claim :
      name === 'sms_check_claim_eligible' ? false : { id: claim.id }, error: null }
  } }
  const result = await sendPendingSmsIntents(admin, {
    name: 'twilio', senderPhoneE164,
    send: async () => { sendCount++; return { kind: 'accepted', externalMessageId: 'SM123', fromPhoneE164: senderPhoneE164 } },
  }, [claim.id])
  assert.equal(sendCount, 0)
  assert.equal(result.skippedChanged, 1)
  assert.equal(calls[2][1].p_outcome, 'skipped')
})

test('eligibility RPC failure releases the unsent claim for retry and fails the run', async () => {
  let sendCount = 0
  const calls = []
  const admin = { rpc: async (name, args) => {
    calls.push([name, args])
    if (name === 'sms_claim_outbox') return { data: claim, error: null }
    if (name === 'sms_check_claim_eligible') return { data: null, error: { message: 'unavailable' } }
    if (name === 'sms_release_unsent_claim') return { data: true, error: null }
    throw new Error(`Unexpected RPC: ${name}`)
  } }
  const result = await sendPendingSmsIntents(admin, {
    name: 'twilio', senderPhoneE164,
    send: async () => { sendCount++; return { kind: 'accepted', externalMessageId: 'SM123', fromPhoneE164: senderPhoneE164 } },
  }, [claim.id])
  assert.equal(sendCount, 0)
  assert.equal(result.needsReview, 0)
  assert.equal(result.pending, 1)
  assert.equal(result.complete, false)
  assert.deepEqual(calls.map(([name]) => name), [
    'sms_claim_outbox', 'sms_check_claim_eligible', 'sms_release_unsent_claim',
  ])
})

test('failed release after eligibility outage is visible and never calls the provider', async () => {
  let sendCount = 0
  const admin = { rpc: async name => {
    if (name === 'sms_claim_outbox') return { data: claim, error: null }
    if (name === 'sms_check_claim_eligible') return { data: null, error: { message: 'unavailable' } }
    if (name === 'sms_release_unsent_claim') return { data: false, error: null }
    throw new Error(`Unexpected RPC: ${name}`)
  } }
  const result = await sendPendingSmsIntents(admin, {
    name: 'twilio', senderPhoneE164,
    send: async () => { sendCount++; return { kind: 'unknown' } },
  }, [claim.id])
  assert.equal(sendCount, 0)
  assert.equal(result.needsReview, 1)
  assert.equal(result.complete, false)
})

test('global SMS flag defaults off before any database or provider access', async () => {
  const prior = process.env.SMS_FEATURE_ENABLED
  delete process.env.SMS_FEATURE_ENABLED
  try {
    const result = await runSmsWorker({
      rpc: async () => { throw new Error('DB must stay untouched') },
      from: () => { throw new Error('DB must stay untouched') },
    }, { name: 'twilio', senderPhoneE164,
      send: async () => { throw new Error('Provider must stay untouched') },
    })
    assert.equal(result.enabled, false)
  } finally {
    if (prior === undefined) delete process.env.SMS_FEATURE_ENABLED
    else process.env.SMS_FEATURE_ENABLED = prior
  }
})

test('stale sending attempts become needs_review before reading active cohorts', async () => {
  const prior = process.env.SMS_FEATURE_ENABLED
  process.env.SMS_FEATURE_ENABLED = 'true'
  const calls = []
  const cohortQuery = {
    select() { return this }, eq() { return this },
    limit() { return Promise.resolve({ data: [], error: null }) },
  }
  try {
    const result = await runSmsWorker({
      rpc: async (name, args) => {
        calls.push([name, args])
        return { data: 2, error: null }
      },
      from: table => { assert.equal(table, 'cohorts'); return cohortQuery },
    }, { name: 'twilio', senderPhoneE164,
      send: async () => { throw new Error('Provider must stay untouched') },
    }, new Date('2026-09-26T12:00:00Z'))
    assert.equal(result.reconciledStale, 2)
    assert.equal(calls[0][0], 'sms_reconcile_stale_outbox')
    assert.equal(calls[0][1].p_before, '2026-09-26T11:45:00.000Z')
  } finally {
    if (prior === undefined) delete process.env.SMS_FEATURE_ENABLED
    else process.env.SMS_FEATURE_ENABLED = prior
  }
})

function fakeSmsDatabase(scheduledAt, answered = false, status = 'scheduled') {
  const rows = {
    cohorts: [{ id: 'cohort-1', sms_enabled: true, status: 'active' }],
    cohort_sms_contacts: [{ id: 'contact-1', cohort_id: 'cohort-1', person_id: 'person-1',
      phone_e164: '+12025550101', consented_at: '2026-09-20T12:00:00Z', opted_out_at: null }],
    sms_phone_suppressions: [],
    sessions: [{ id: 'session-1', cohort_id: 'cohort-1', match_id: 'match-1',
      mentor_id: 'mentor-1', mentee_id: 'mentee-1', scheduled_at: scheduledAt, status }],
    mentor: [{ id: 'mentor-1', person_id: 'person-1', membership_status: 'active' }],
    mentees: [{ id: 'mentee-1', person_id: 'person-2', membership_status: 'active' }],
    cohort_matches: [{ id: 'match-1', cohort_id: 'cohort-1', mentor_id: 'mentor-1',
      mentee_id: 'mentee-1', status: 'active' }],
    meeting_checkins: answered ? [{ id: 'checkin-1', session_id: 'session-1',
      member_type: 'mentor', member_id: 'mentor-1', responded_at: '2026-09-26T11:30:00Z' }] : [],
    sms_outbox: [],
  }
  const rpcCalls = []
  const inCalls = []
  const admin = {
    from(table) {
      assert.ok(table in rows, `Unexpected SMS table: ${table}`)
      const filters = []
      let take = Infinity
      let start = 0
      let end = Infinity
      const query = {
        select() { return this },
        eq(field, value) { filters.push(row => row[field] === value); return this },
        neq(field, value) { filters.push(row => row[field] !== value); return this },
        in(field, values) {
          inCalls.push({ table, field, size: values.length })
          filters.push(row => values.includes(row[field])); return this
        },
        not(field, operator, value) {
          assert.equal(operator, 'is'); assert.equal(value, null)
          filters.push(row => row[field] !== null); return this
        },
        is(field, value) { filters.push(row => row[field] === value); return this },
        gte(field, value) { filters.push(row => row[field] >= value); return this },
        lte(field, value) { filters.push(row => row[field] <= value); return this },
        order() { return this },
        limit(value) { take = value; return this },
        range(from, to) { start = from; end = to + 1; return this },
        then(resolve, reject) {
          return Promise.resolve({ data: rows[table].filter(row => filters.every(test => test(row)))
            .slice(start, Math.min(end, take)), error: null }).then(resolve, reject)
        },
        insert(value) {
          const created = { id: table === 'sms_outbox' ? `intent-${rows[table].length + 1}` :
            `checkin-${rows[table].length + 1}`,
            state: table === 'sms_outbox' ? 'pending' : undefined,
            first_attempt_at: null, provider: null, provider_message_id: null,
            sent_at: null, detail: null, ...value }
          rows[table].push(created)
          return { select() { return { maybeSingle: async () => ({ data: created, error: null }) } } }
        },
      }
      return query
    },
    async rpc(name, args) {
      rpcCalls.push([name, args])
      if (name === 'sms_reconcile_stale_outbox') return { data: 0, error: null }
      if (name === 'sms_claim_outbox') {
        const intent = rows.sms_outbox.find(row => row.id === args.p_id)
        if (!intent || intent.state !== 'pending') return { data: null, error: null }
        intent.state = 'sending'
        intent.first_attempt_at = new Date().toISOString()
        return { data: { ...intent, sender_phone_e164: args.p_sender_phone_e164 }, error: null }
      }
      if (name === 'sms_check_claim_eligible') return { data: true, error: null }
      if (name === 'sms_release_unsent_claim') {
        const intent = rows.sms_outbox.find(row => row.id === args.p_id)
        if (!intent || intent.state !== 'sending' || !intent.first_attempt_at) {
          return { data: false, error: null }
        }
        intent.state = 'pending'
        intent.first_attempt_at = null
        intent.detail = 'Eligibility check unavailable before provider call; retry pending'
        return { data: true, error: null }
      }
      if (name === 'sms_supersede_stale_pending_outbox') {
        const intent = rows.sms_outbox.find(row => row.id === args.p_id)
        const contact = rows.cohort_sms_contacts.find(row => row.id === intent?.contact_id)
        const expiresSoon = intent?.kind === 'checkin' && intent.reply_expires_at &&
          Date.parse(intent.reply_expires_at) <= Date.parse('2026-09-26T12:00:00Z') + 60_000
        if (!intent || !contact || intent.state !== 'pending' ||
            (intent.phone_e164 === contact.phone_e164 && !expiresSoon)) return { data: false, error: null }
        intent.state = 'superseded'
        return { data: true, error: null }
      }
      if (name === 'sms_finish_outbox') {
        const intent = rows.sms_outbox.find(row => row.id === args.p_id)
        assert.ok(intent)
        intent.state = args.p_outcome === 'accepted' ? 'accepted' :
          args.p_outcome === 'skipped' ? 'superseded' : 'needs_review'
        intent.detail = args.p_detail
        return { data: { state: intent.state }, error: null }
      }
      throw new Error(`Unexpected SMS RPC: ${name}`)
    },
  }
  return { admin, rows, rpcCalls, inCalls }
}

function failSmsInsert(admin, failedTable) {
  const originalFrom = admin.from
  admin.from = table => {
    const query = originalFrom(table)
    if (table === failedTable) {
      query.insert = () => ({ select: () => ({
        maybeSingle: async () => ({ data: null, error: { code: '08006', message: 'private failure detail' } }),
      }) })
    }
    return query
  }
}

test('check-in persistence failure fails the worker instead of silently skipping a due prompt', async () => {
  const prior = process.env.SMS_FEATURE_ENABLED
  process.env.SMS_FEATURE_ENABLED = 'true'
  const { admin, rows } = fakeSmsDatabase('2026-09-26T10:00:00.000Z')
  failSmsInsert(admin, 'meeting_checkins')
  let sendCount = 0
  try {
    await assert.rejects(runSmsWorker(admin, {
      name: 'twilio', senderPhoneE164,
      send: async () => { sendCount++; return { kind: 'unknown' } },
    }, new Date('2026-09-26T12:00:00Z')), /Could not persist SMS meeting check-in/)
    assert.equal(sendCount, 0)
    assert.equal(rows.sms_outbox.length, 0)
  } finally {
    if (prior === undefined) delete process.env.SMS_FEATURE_ENABLED
    else process.env.SMS_FEATURE_ENABLED = prior
  }
})

test('outbox persistence failure fails the worker instead of silently skipping a due reminder', async () => {
  const prior = process.env.SMS_FEATURE_ENABLED
  process.env.SMS_FEATURE_ENABLED = 'true'
  const { admin, rows } = fakeSmsDatabase('2026-09-27T12:00:00.000Z')
  failSmsInsert(admin, 'sms_outbox')
  let sendCount = 0
  try {
    await assert.rejects(runSmsWorker(admin, {
      name: 'twilio', senderPhoneE164,
      send: async () => { sendCount++; return { kind: 'unknown' } },
    }, new Date('2026-09-26T12:00:00Z')), /Could not persist SMS send intent/)
    assert.equal(sendCount, 0)
    assert.equal(rows.sms_outbox.length, 0)
  } finally {
    if (prior === undefined) delete process.env.SMS_FEATURE_ENABLED
    else process.env.SMS_FEATURE_ENABLED = prior
  }
})

test('one consented member gets one due reminder with an atomic claim', async () => {
  const prior = process.env.SMS_FEATURE_ENABLED
  process.env.SMS_FEATURE_ENABLED = 'true'
  const { admin, rows, rpcCalls } = fakeSmsDatabase('2026-09-27T12:00:00.000Z')
  const sent = []
  try {
    const result = await runSmsWorker(admin, {
      name: 'twilio', senderPhoneE164,
      send: async input => {
        sent.push(input)
        return { kind: 'accepted', externalMessageId: 'SM123', fromPhoneE164: senderPhoneE164 }
      },
    }, new Date('2026-09-26T12:00:00Z'))
    assert.equal(result.queued, 1)
    assert.equal(result.accepted, 1)
    assert.equal(rows.sms_outbox.length, 1)
    assert.equal(rows.sms_outbox[0].kind, 'reminder')
    assert.equal(rows.sms_outbox[0].contact_id, 'contact-1')
    assert.deepEqual(sent, [{ toPhoneE164: '+12025550101', body: buildReminderSms() }])
    assert.deepEqual(rpcCalls.map(call => call[0]), [
      'sms_reconcile_stale_outbox', 'sms_claim_outbox',
      'sms_check_claim_eligible', 'sms_finish_outbox',
    ])
  } finally {
    if (prior === undefined) delete process.env.SMS_FEATURE_ENABLED
    else process.env.SMS_FEATURE_ENABLED = prior
  }
})

test('a check-in released at the 25-hour edge retries after the due window without duplicating', async () => {
  const prior = process.env.SMS_FEATURE_ENABLED
  process.env.SMS_FEATURE_ENABLED = 'true'
  // At noon this meeting was 24h59m ago; two minutes later it is outside the
  // scheduler's 1–25h discovery window, but its prompt remains unanswered.
  const { admin, rows, rpcCalls } = fakeSmsDatabase('2026-09-25T11:01:00.000Z')
  const originalRpc = admin.rpc.bind(admin)
  let eligibilityChecks = 0
  admin.rpc = async (name, args) => {
    if (name === 'sms_check_claim_eligible' && eligibilityChecks++ === 0) {
      rpcCalls.push([name, args])
      return { data: null, error: { message: 'eligibility database unavailable' } }
    }
    return originalRpc(name, args)
  }
  const sent = []
  const provider = { name: 'twilio', senderPhoneE164,
    send: async input => {
      sent.push(input)
      return { kind: 'accepted', externalMessageId: 'SM123', fromPhoneE164: senderPhoneE164 }
    },
  }
  try {
    const first = await runSmsWorker(admin, provider, new Date('2026-09-26T12:00:00Z'))
    assert.equal(first.queued, 1)
    assert.equal(first.pending, 1)
    assert.equal(first.complete, false)
    assert.equal(sent.length, 0)
    assert.equal(rows.sms_outbox[0].state, 'pending')
    assert.match(rows.sms_outbox[0].detail, /Eligibility check unavailable before provider call/)

    const second = await runSmsWorker(admin, provider, new Date('2026-09-26T12:02:00Z'))
    assert.equal(second.dueSessions, 0)
    assert.equal(second.queued, 0)
    assert.equal(second.accepted, 1)
    assert.equal(eligibilityChecks, 2)
    assert.equal(sent.length, 1)
    assert.equal(rows.sms_outbox.length, 1)
    assert.equal(rows.sms_outbox[0].state, 'accepted')

    await runSmsWorker(admin, provider, new Date('2026-09-26T13:00:00Z'))
    assert.equal(sent.length, 1)
    assert.equal(rpcCalls.filter(([name]) => name === 'sms_claim_outbox').length, 2)
  } finally {
    if (prior === undefined) delete process.env.SMS_FEATURE_ENABLED
    else process.env.SMS_FEATURE_ENABLED = prior
  }
})

test('an out-of-window deferred check-in still requires confirmed eligibility', async () => {
  const prior = process.env.SMS_FEATURE_ENABLED
  process.env.SMS_FEATURE_ENABLED = 'true'
  const { admin, rows } = fakeSmsDatabase('2026-09-25T11:01:00.000Z')
  rows.sms_outbox.push({ id: 'deferred-intent', cohort_id: 'cohort-1',
    contact_id: 'contact-1', session_id: 'session-1', kind: 'checkin',
    state: 'pending', phone_e164: '+12025550101', first_attempt_at: null,
    provider: null, provider_message_id: null, sent_at: null,
    detail: 'Eligibility check unavailable before provider call; retry pending' })
  const originalRpc = admin.rpc.bind(admin)
  admin.rpc = (name, args) => name === 'sms_check_claim_eligible'
    ? Promise.resolve({ data: false, error: null }) : originalRpc(name, args)
  let sendCount = 0
  try {
    const result = await runSmsWorker(admin, {
      name: 'twilio', senderPhoneE164,
      send: async () => { sendCount++; return { kind: 'unknown' } },
    }, new Date('2026-09-26T12:02:00Z'))
    assert.equal(result.dueSessions, 0)
    assert.equal(result.skippedChanged, 1)
    assert.equal(sendCount, 0)
    assert.equal(rows.sms_outbox[0].state, 'superseded')
  } finally {
    if (prior === undefined) delete process.env.SMS_FEATURE_ENABLED
    else process.env.SMS_FEATURE_ENABLED = prior
  }
})

test('ordinary pending intents outside the due window are not discovered as retries', async () => {
  const prior = process.env.SMS_FEATURE_ENABLED
  process.env.SMS_FEATURE_ENABLED = 'true'
  const { admin, rows, rpcCalls } = fakeSmsDatabase('2026-09-25T11:01:00.000Z')
  rows.sms_outbox.push({ id: 'ordinary-intent', cohort_id: 'cohort-1',
    contact_id: 'contact-1', session_id: 'session-1', kind: 'checkin',
    state: 'pending', phone_e164: '+12025550101', first_attempt_at: null,
    provider: null, provider_message_id: null, sent_at: null, detail: null })
  let sendCount = 0
  try {
    const result = await runSmsWorker(admin, {
      name: 'twilio', senderPhoneE164,
      send: async () => { sendCount++; return { kind: 'unknown' } },
    }, new Date('2026-09-26T12:02:00Z'))
    assert.equal(result.dueSessions, 0)
    assert.equal(sendCount, 0)
    assert.equal(rows.sms_outbox[0].state, 'pending')
    assert.equal(rpcCalls.filter(([name]) => name === 'sms_claim_outbox').length, 0)
  } finally {
    if (prior === undefined) delete process.env.SMS_FEATURE_ENABLED
    else process.env.SMS_FEATURE_ENABLED = prior
  }
})

test('a pending old-phone intent is retired before queueing the new phone', async () => {
  const prior = process.env.SMS_FEATURE_ENABLED
  process.env.SMS_FEATURE_ENABLED = 'true'
  const { admin, rows, rpcCalls } = fakeSmsDatabase('2026-09-27T12:00:00.000Z')
  rows.sms_outbox.push({ id: 'old-intent', session_id: 'session-1',
    contact_id: 'contact-1', kind: 'reminder', state: 'pending',
    phone_e164: '+12025550102' })
  const sent = []
  try {
    const result = await runSmsWorker(admin, {
      name: 'twilio', senderPhoneE164,
      send: async input => {
        sent.push(input)
        return { kind: 'accepted', externalMessageId: 'SM123', fromPhoneE164: senderPhoneE164 }
      },
    }, new Date('2026-09-26T12:00:00Z'))
    assert.equal(result.queued, 1)
    assert.equal(result.accepted, 1)
    assert.equal(rows.sms_outbox.find(row => row.id === 'old-intent').state, 'superseded')
    assert.deepEqual(sent.map(message => message.toPhoneE164), ['+12025550101'])
    assert.equal(rpcCalls.filter(([name]) => name === 'sms_supersede_stale_pending_outbox').length, 1)
  } finally {
    if (prior === undefined) delete process.env.SMS_FEATURE_ENABLED
    else process.env.SMS_FEATURE_ENABLED = prior
  }
})

test('a definitively unsent superseded check-in can get a fresh prompt', async () => {
  const prior = process.env.SMS_FEATURE_ENABLED
  process.env.SMS_FEATURE_ENABLED = 'true'
  const { admin, rows } = fakeSmsDatabase('2026-09-26T10:00:00.000Z')
  rows.meeting_checkins.push({ id: 'checkin-1', session_id: 'session-1',
    member_type: 'mentor', member_id: 'mentor-1', responded_at: null })
  rows.sms_outbox.push({ id: 'old-prompt', session_id: 'session-1',
    contact_id: 'contact-1', kind: 'checkin', state: 'superseded',
    phone_e164: '+12025550101' })
  try {
    const result = await runSmsWorker(admin, {
      name: 'twilio', senderPhoneE164,
      send: async () => ({ kind: 'accepted', externalMessageId: 'SM123',
        fromPhoneE164: senderPhoneE164 }),
    }, new Date('2026-09-26T12:00:00Z'))
    assert.equal(result.queued, 1)
    assert.equal(result.accepted, 1)
    assert.equal(rows.sms_outbox.length, 2)
    assert.equal(rows.sms_outbox[1].kind, 'checkin')
  } finally {
    if (prior === undefined) delete process.env.SMS_FEATURE_ENABLED
    else process.env.SMS_FEATURE_ENABLED = prior
  }
})

test('a pending check-in expiring after a same-row reschedule gets a fresh prompt', async () => {
  const prior = process.env.SMS_FEATURE_ENABLED
  process.env.SMS_FEATURE_ENABLED = 'true'
  const { admin, rows, rpcCalls } = fakeSmsDatabase('2026-09-26T10:00:00.000Z')
  rows.meeting_checkins.push({ id: 'checkin-1', session_id: 'session-1',
    member_type: 'mentor', member_id: 'mentor-1', responded_at: null })
  rows.sms_outbox.push({ id: 'old-prompt', session_id: 'session-1',
    contact_id: 'contact-1', kind: 'checkin', state: 'pending',
    phone_e164: '+12025550101', reply_expires_at: '2026-09-26T12:00:30Z' })
  try {
    const result = await runSmsWorker(admin, {
      name: 'twilio', senderPhoneE164,
      send: async () => ({ kind: 'accepted', externalMessageId: 'SM123',
        fromPhoneE164: senderPhoneE164 }),
    }, new Date('2026-09-26T12:00:00Z'))
    assert.equal(result.queued, 1)
    assert.equal(result.accepted, 1)
    assert.equal(rows.sms_outbox[0].state, 'superseded')
    assert.equal(rows.sms_outbox[1].kind, 'checkin')
    assert.notEqual(rows.sms_outbox[1].reply_expires_at, rows.sms_outbox[0].reply_expires_at)
    assert.equal(rpcCalls.filter(([name]) => name === 'sms_supersede_stale_pending_outbox').length, 1)
  } finally {
    if (prior === undefined) delete process.env.SMS_FEATURE_ENABLED
    else process.env.SMS_FEATURE_ENABLED = prior
  }
})

test('a web check-in response prevents a post-meeting text', async () => {
  const prior = process.env.SMS_FEATURE_ENABLED
  process.env.SMS_FEATURE_ENABLED = 'true'
  const { admin, rows } = fakeSmsDatabase('2026-09-26T10:00:00.000Z', true)
  let sendCount = 0
  try {
    const result = await runSmsWorker(admin, {
      name: 'twilio', senderPhoneE164,
      send: async () => { sendCount++; return { kind: 'unknown' } },
    }, new Date('2026-09-26T12:00:00Z'))
    assert.equal(result.queued, 0)
    assert.equal(sendCount, 0)
    assert.equal(rows.sms_outbox.length, 0)
  } finally {
    if (prior === undefined) delete process.env.SMS_FEATURE_ENABLED
    else process.env.SMS_FEATURE_ENABLED = prior
  }
})

test('a no-show meeting can receive the neutral shared check-in prompt', async () => {
  const prior = process.env.SMS_FEATURE_ENABLED
  process.env.SMS_FEATURE_ENABLED = 'true'
  const { admin, rows } = fakeSmsDatabase('2026-09-26T10:00:00.000Z', false, 'no_show')
  const sent = []
  try {
    const result = await runSmsWorker(admin, {
      name: 'twilio', senderPhoneE164,
      send: async input => {
        sent.push(input)
        return { kind: 'accepted', externalMessageId: 'SM123', fromPhoneE164: senderPhoneE164 }
      },
    }, new Date('2026-09-26T12:00:00Z'))
    assert.equal(result.queued, 1)
    assert.equal(rows.meeting_checkins.length, 1)
    assert.equal(rows.sms_outbox[0].kind, 'checkin')
    assert.match(sent[0].body, /How did your meeting go\?/)
  } finally {
    if (prior === undefined) delete process.env.SMS_FEATURE_ENABLED
    else process.env.SMS_FEATURE_ENABLED = prior
  }
})

test('large due sets partition meeting IDs and phone filters into bounded requests', async () => {
  const prior = process.env.SMS_FEATURE_ENABLED
  process.env.SMS_FEATURE_ENABLED = 'true'
  const { admin, rows, inCalls } = fakeSmsDatabase('2026-09-27T12:00:00.000Z')
  rows.sessions = Array.from({ length: 126 }, (_, index) => ({
    ...rows.sessions[0], id: `session-${index + 1}`,
  }))
  rows.cohort_sms_contacts.push(...Array.from({ length: 125 }, (_, index) => ({
    ...rows.cohort_sms_contacts[0], id: `other-contact-${index + 1}`,
    person_id: `other-person-${index + 1}`,
    phone_e164: `+1202555${String(index + 1000)}`,
  })))
  try {
    const result = await runSmsWorker(admin, {
      name: 'twilio', senderPhoneE164,
      send: async () => ({ kind: 'accepted', externalMessageId: 'SM123', fromPhoneE164: senderPhoneE164 }),
    }, new Date('2026-09-26T12:00:00Z'))
    assert.equal(result.dueSessions, 126)
    assert.equal(result.queued, 126)
    assert.equal(rows.sms_outbox.length, 126)
    assert.ok(inCalls.filter(call => call.table === 'sms_phone_suppressions').length >= 3)
    assert.ok(inCalls.filter(call => call.field === 'session_id').length >= 6)
    assert.ok(inCalls.filter(call => call.table === 'sms_phone_suppressions' ||
      call.field === 'session_id').every(call => call.size <= 50))
  } finally {
    if (prior === undefined) delete process.env.SMS_FEATURE_ENABLED
    else process.env.SMS_FEATURE_ENABLED = prior
  }
})
