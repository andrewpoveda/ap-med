import assert from 'node:assert/strict'
import test from 'node:test'
import { database, loadTs } from './test-support.mjs'

const actor = { type: 'mentor', id: 'mentor-1', cohortId: 'cohort-1' }
const request = (path, method, body) => new Request(`https://ap-med.test${path}`, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const preferenceRequest = (db, body, snapshot) => {
  const current = db.tables.cohort_sms_contacts?.[0] ?? null
  const observed = snapshot === undefined
    ? { id: current?.id ?? null, revision: current?.revision ?? null }
    : snapshot
  return request('/api/cohort-sms-preferences', 'PUT', {
    ...body,
    expectedContactId: observed.id,
    expectedContactRevision: observed.revision,
  })
}

function route(path, db, options = {}) {
  const user = options.user === undefined ? { id: 'user-1' } : options.user
  return loadTs(path, {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/supabase-server': { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/goals': { resolveActingMember: async () => options.actor === undefined ? actor : options.actor },
    '@/lib/cohort-sms': {
      isCohortSmsEnabled: async () => options.enabled ?? true,
      isCohortMeetingCheckinsEnabled: async () => options.checkinsEnabled ?? options.enabled ?? true,
    },
  })
}

test('new SMS member routes reject signed-out users before database access', async () => {
  for (const [path, method, body] of [
    ['src/app/api/meeting-checkins/route.ts', 'POST', { sessionId: 'session-1', response: 'Great' }],
    ['src/app/api/cohort-sms-preferences/route.ts', 'PUT', { phoneNumber: '2015550123', smsConsent: true,
      expectedContactId: null, expectedContactRevision: null }],
  ]) {
    const db = database()
    const response = await route(path, db, { user: null })[method](request('/api/test', method, body))
    assert.equal(response.status, 401)
    assert.equal(db.calls.length, 0)
  }
})

test('meeting check-in requires the cohort switch and the member side of a past session', async () => {
  const db = database({
    sessions: [{ id: 'session-1', cohort_id: 'cohort-1', match_id: 'match-1', mentor_id: 'someone-else', mentee_id: 'mentee-1', scheduled_at: '2020-01-01T12:00:00Z', status: 'scheduled' }],
  })
  const path = 'src/app/api/meeting-checkins/route.ts'
  const body = { sessionId: 'session-1', response: 'We did not meet.' }
  assert.equal((await route(path, db, { enabled: false }).POST(request('/api/meeting-checkins', 'POST', body))).status, 404)
  assert.equal(db.calls.length, 0)
  assert.equal((await route(path, db).POST(request('/api/meeting-checkins', 'POST', body))).status, 404)
  assert.equal(db.tables.meeting_checkins?.length ?? 0, 0)
})

test('a global SMS pause leaves opted-in web check-ins available', async () => {
  const { isCohortSmsEnabled, isCohortMeetingCheckinsEnabled } = loadTs('src/lib/cohort-sms.ts')
  const original = process.env.SMS_FEATURE_ENABLED
  try {
    delete process.env.SMS_FEATURE_ENABLED
    const db = database({ cohorts: [{ id: 'cohort-1', sms_enabled: true, status: 'active' }] })
    assert.equal(await isCohortSmsEnabled(db, 'cohort-1'), false)
    assert.equal(await isCohortMeetingCheckinsEnabled(db, 'cohort-1'), true)
    db.tables.cohorts[0].sms_enabled = false
    assert.equal(await isCohortMeetingCheckinsEnabled(db, 'cohort-1'), false)
  } finally {
    if (original === undefined) delete process.env.SMS_FEATURE_ENABLED
    else process.env.SMS_FEATURE_ENABLED = original
  }
})

test('web check-in writes the channel-neutral response without logging attendance', async () => {
  const db = database({
    sessions: [{ id: 'session-1', cohort_id: 'cohort-1', match_id: 'match-1', mentor_id: 'mentor-1', mentee_id: 'mentee-1', scheduled_at: '2020-01-01T12:00:00Z', status: 'scheduled' }],
    cohort_matches: [{ id: 'match-1', cohort_id: 'cohort-1', mentor_id: 'mentor-1', mentee_id: 'mentee-1', status: 'active' }],
  })
  const response = await route('src/app/api/meeting-checkins/route.ts', db).POST(
    request('/api/meeting-checkins', 'POST', { sessionId: 'session-1', response: 'We did not meet.' }),
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true })
  assert.equal(db.tables.meeting_checkins.length, 1)
  assert.equal(db.tables.meeting_checkins[0].response_channel, 'web')
  assert.equal(db.tables.meeting_checkins[0].member_id, 'mentor-1')
  assert.equal(db.tables.meeting_logs?.length ?? 0, 0)
})

test('phone preference requires active membership and respects global STOP', async () => {
  const db = database({
    mentor: [{ id: 'mentor-1', cohort_id: 'cohort-1', person_id: 'person-1', membership_status: 'active' }],
    sms_phone_suppressions: [{ phone_e164: '+12015550123', opted_out_at: '2026-01-01T00:00:00Z', resumed_at: null }],
  })
  const path = 'src/app/api/cohort-sms-preferences/route.ts'
  const body = { phoneNumber: '2015550123', smsConsent: true }
  const response = await route(path, db).PUT(preferenceRequest(db, body))
  assert.equal(response.status, 409)
  assert.equal(db.tables.cohort_sms_contacts?.length ?? 0, 0)
})

test('phone saved without consent also uses the guarded contact transaction', async () => {
  const db = database({
    mentor: [{ id: 'mentor-1', cohort_id: 'cohort-1', person_id: 'person-1', membership_status: 'active' }],
  })
  db.rpc = async (name, args) => {
    assert.equal(name, 'sms_save_contact_without_consent')
    assert.equal(args.p_phone_e164, '+12015550123')
    assert.equal(args.p_expected_contact_id, null)
    assert.equal(args.p_expected_contact_revision, null)
    assert.equal(args.p_allow_new_phone, true)
    return { data: 'saved', error: null }
  }
  const response = await route('src/app/api/cohort-sms-preferences/route.ts', db).PUT(
    preferenceRequest(db, { phoneNumber: '2015550123', smsConsent: false }),
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, phoneE164: '+12015550123' })
})

test('preference writes require the dashboard version snapshot', async () => {
  const db = database({
    mentor: [{ id: 'mentor-1', cohort_id: 'cohort-1', person_id: 'person-1', membership_status: 'active' }],
  })
  const response = await route('src/app/api/cohort-sms-preferences/route.ts', db).PUT(request(
    '/api/cohort-sms-preferences', 'PUT', { phoneNumber: '2015550123', smsConsent: false },
  ))
  assert.equal(response.status, 400)
  assert.equal(db.tables.cohort_sms_contacts?.length ?? 0, 0)
})

test('dashboard opt-in saves through the revision-checked SMS transaction', async () => {
  const db = database({
    mentor: [{ id: 'mentor-1', cohort_id: 'cohort-1', person_id: 'person-1', membership_status: 'active' }],
    sms_phone_suppressions: [{ phone_e164: '+12015550123', revision: 4,
      opted_out_at: '2026-09-20T12:00:00Z', resumed_at: '2026-09-20T12:01:00Z' }],
  })
  let call
  db.rpc = async (name, args) => {
    call = { name, args }
    return { data: 'saved', error: null }
  }
  const response = await route('src/app/api/cohort-sms-preferences/route.ts', db).PUT(preferenceRequest(
    db, { phoneNumber: '2015550123', smsConsent: true },
  ))
  assert.equal(response.status, 200)
  assert.equal(call.name, 'sms_save_contact_consent')
  assert.equal(call.args.p_cohort_id, 'cohort-1')
  assert.equal(call.args.p_person_id, 'person-1')
  assert.equal(call.args.p_phone_e164, '+12015550123')
  assert.equal(call.args.p_expected_revision, 4)
  assert.equal(call.args.p_expected_contact_id, null)
  assert.equal(call.args.p_expected_phone_e164, null)
  assert.equal(call.args.p_expected_consented_at, null)
  assert.equal(call.args.p_expected_opted_out_at, null)
  assert.match(call.args.p_consent_notice, /Reply STOP/)
  assert.equal(db.tables.cohort_sms_contacts.length, 0)
})

test('a STOP and START after the dashboard read rejects the stale opt-in', async () => {
  const db = database({
    mentor: [{ id: 'mentor-1', cohort_id: 'cohort-1', person_id: 'person-1', membership_status: 'active' }],
  })
  db.rpc = async (name, args) => {
    assert.equal(name, 'sms_save_contact_consent')
    assert.equal(args.p_expected_revision, null)
    return { data: 'changed', error: null }
  }
  const response = await route('src/app/api/cohort-sms-preferences/route.ts', db).PUT(preferenceRequest(
    db, { phoneNumber: '2015550123', smsConsent: true },
  ))
  assert.equal(response.status, 409)
  assert.equal(db.tables.cohort_sms_contacts.length, 0)
})

test('dashboard opt-in sends the prior contact snapshot so newer revocation wins', async () => {
  const previous = { id: 'contact-1', revision: 1, cohort_id: 'cohort-1', person_id: 'person-1',
    phone_e164: '+12015550123', consented_at: '2026-09-20T12:00:00Z',
    opted_out_at: null, consent_source: 'cohort_application',
    consent_notice: 'Original notice', consent_notice_version: 'v1' }
  const db = database({
    mentor: [{ id: 'mentor-1', cohort_id: 'cohort-1', person_id: 'person-1', membership_status: 'active' }],
    cohort_sms_contacts: [previous],
  })
  db.rpc = async (name, args) => {
    assert.equal(name, 'sms_save_contact_consent')
    assert.equal(args.p_expected_contact_id, previous.id)
    assert.equal(args.p_expected_phone_e164, previous.phone_e164)
    assert.equal(args.p_expected_consented_at, previous.consented_at)
    assert.equal(args.p_expected_opted_out_at, previous.opted_out_at)
    return { data: 'changed', error: null }
  }
  const response = await route('src/app/api/cohort-sms-preferences/route.ts', db).PUT(preferenceRequest(
    db, { phoneNumber: '2015550123', smsConsent: true },
  ))
  assert.equal(response.status, 409)
  assert.deepEqual(db.tables.cohort_sms_contacts[0], previous)
})

test('an older dashboard tab cannot revoke or replace a newer phone and consent', async () => {
  const row = { id: 'contact-1', revision: 3, cohort_id: 'cohort-1', person_id: 'person-1',
    phone_e164: '+12015550124', consented_at: '2026-09-22T12:00:00Z', opted_out_at: null }
  const db = database({
    mentor: [{ id: 'mentor-1', cohort_id: 'cohort-1', person_id: 'person-1', membership_status: 'active' }],
    cohort_sms_contacts: [row],
  })
  db.rpc = async () => { throw new Error('stale request must stop before a write') }
  for (const body of [
    { phoneNumber: '+12015550123', smsConsent: false },
    { phoneNumber: '', smsConsent: false },
    { phoneNumber: '+12015550123', smsConsent: true },
  ]) {
    const response = await route('src/app/api/cohort-sms-preferences/route.ts', db).PUT(
      preferenceRequest(db, body, { id: row.id, revision: 2 }),
    )
    assert.equal(response.status, 409)
  }
  assert.deepEqual(db.tables.cohort_sms_contacts[0], row)
})

test('a concurrent preference write returns a conflict instead of a successful revocation', async () => {
  const row = { id: 'contact-1', revision: 1, cohort_id: 'cohort-1', person_id: 'person-1',
    phone_e164: '+12015550123', consented_at: '2026-09-20T12:00:00Z', opted_out_at: null }
  const db = database({
    mentor: [{ id: 'mentor-1', cohort_id: 'cohort-1', person_id: 'person-1', membership_status: 'active' }],
    cohort_sms_contacts: [row],
  })
  db.rpc = async (name, args) => {
    assert.equal(name, 'sms_save_contact_without_consent')
    assert.equal(args.p_expected_contact_revision, 1)
    db.tables.cohort_sms_contacts[0] = { ...row, revision: 2, phone_e164: '+12015550124' }
    return { data: 'changed', error: null }
  }
  const response = await route('src/app/api/cohort-sms-preferences/route.ts', db).PUT(
    preferenceRequest(db, { phoneNumber: '', smsConsent: false }),
  )
  assert.equal(response.status, 409)
  assert.equal(db.tables.cohort_sms_contacts[0].phone_e164, '+12015550124')
})

test('an existing member can revoke consent and remove a saved phone while SMS is paused', async () => {
  const path = 'src/app/api/cohort-sms-preferences/route.ts'
  const seed = {
    mentor: [{ id: 'mentor-1', cohort_id: 'cohort-1', person_id: 'person-1', membership_status: 'active' }],
    cohort_sms_contacts: [{ id: 'contact-1', revision: 1, cohort_id: 'cohort-1', person_id: 'person-1',
      phone_e164: '+12015550123', consented_at: '2026-09-20T12:00:00Z',
      consent_source: 'cohort_application', consent_notice: 'Original notice',
      consent_notice_version: 'v1', opted_out_at: null }],
  }
  const db = database(seed)
  db.rpc = async (name, args) => {
    assert.equal(name, 'sms_save_contact_without_consent')
    assert.equal(args.p_allow_new_phone, false)
    const row = db.tables.cohort_sms_contacts[0]
    assert.equal(args.p_expected_contact_id, row.id)
    assert.equal(args.p_expected_contact_revision, row.revision)
    row.phone_e164 = args.p_phone_e164
    row.opted_out_at = '2026-09-21T12:00:00Z'
    if (!args.p_phone_e164) row.consented_at = null
    row.revision++
    return { data: 'saved', error: null }
  }
  const revoke = await route(path, db, { enabled: false }).PUT(preferenceRequest(
    db, { phoneNumber: '+12015550123', smsConsent: false },
  ))
  assert.equal(revoke.status, 200)
  assert.equal(db.tables.cohort_sms_contacts[0].phone_e164, '+12015550123')
  assert.ok(db.tables.cohort_sms_contacts[0].opted_out_at)

  const remove = await route(path, db, { enabled: false }).PUT(preferenceRequest(
    db, { phoneNumber: '', smsConsent: false },
  ))
  assert.equal(remove.status, 200)
  assert.equal(db.tables.cohort_sms_contacts[0].phone_e164, null)
  assert.equal(db.tables.cohort_sms_contacts[0].consented_at, null)
})

test('a paused cohort cannot gain consent or change the stored phone', async () => {
  const path = 'src/app/api/cohort-sms-preferences/route.ts'
  const db = database({
    mentor: [{ id: 'mentor-1', cohort_id: 'cohort-1', person_id: 'person-1', membership_status: 'active' }],
    cohort_sms_contacts: [{ id: 'contact-1', revision: 1, cohort_id: 'cohort-1', person_id: 'person-1',
      phone_e164: '+12015550123', consented_at: null, consent_source: null,
      consent_notice: null, consent_notice_version: null, opted_out_at: '2026-09-20T12:00:00Z' }],
  })
  for (const body of [
    { phoneNumber: '+12015550123', smsConsent: true },
    { phoneNumber: '+12015550124', smsConsent: false },
  ]) {
    const response = await route(path, db, { enabled: false }).PUT(preferenceRequest(db, body))
    assert.equal(response.status, 404)
  }
  assert.equal(db.tables.cohort_sms_contacts[0].phone_e164, '+12015550123')
  assert.equal(db.tables.cohort_sms_contacts[0].consented_at, null)

  const noContact = database({
    mentor: [{ id: 'mentor-1', cohort_id: 'cohort-1', person_id: 'person-1', membership_status: 'active' }],
  })
  const response = await route(path, noContact, { enabled: false }).PUT(preferenceRequest(
    noContact, { phoneNumber: '', smsConsent: false },
  ))
  assert.equal(response.status, 404)
  assert.equal(noContact.tables.cohort_sms_contacts.length, 0)
})

test('a suppression read outage still shows the stored phone for removal', async () => {
  const db = database({
    mentor: [{ id: 'mentor-1', cohort_id: 'cohort-1', person_id: 'person-1', membership_status: 'active' }],
    cohort_sms_contacts: [{ id: 'contact-1', revision: 1, cohort_id: 'cohort-1', person_id: 'person-1',
      phone_e164: '+12015550123', consented_at: '2026-09-20T12:00:00Z', opted_out_at: null }],
  })
  const originalFrom = db.from.bind(db)
  db.from = table => table === 'sms_phone_suppressions'
    ? { select() { return this }, eq() { return this },
        maybeSingle: async () => ({ data: null, error: { code: '08006' } }) }
    : originalFrom(table)
  const { getMemberSmsPreference } = loadTs('src/lib/cohort-sms.ts')
  assert.deepEqual(await getMemberSmsPreference(db, {
    type: 'mentor', memberId: 'mentor-1', cohortId: 'cohort-1',
  }), { contactId: 'contact-1', revision: 1, phoneE164: '+12015550123', consented: true })
})
