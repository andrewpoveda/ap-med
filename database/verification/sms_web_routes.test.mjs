import assert from 'node:assert/strict'
import test from 'node:test'
import { database, loadTs } from './test-support.mjs'

const actor = { type: 'mentor', id: 'mentor-1', cohortId: 'cohort-1' }
const request = (path, method, body) => new Request(`https://ap-med.test${path}`, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

function route(path, db, options = {}) {
  const user = options.user === undefined ? { id: 'user-1' } : options.user
  return loadTs(path, {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/supabase-server': { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/goals': { resolveActingMember: async () => options.actor === undefined ? actor : options.actor },
    '@/lib/cohort-sms': { isCohortSmsEnabled: async () => options.enabled ?? true },
  })
}

test('new SMS member routes reject signed-out users before database access', async () => {
  for (const [path, method, body] of [
    ['src/app/api/meeting-checkins/route.ts', 'POST', { sessionId: 'session-1', response: 'Great' }],
    ['src/app/api/cohort-sms-preferences/route.ts', 'PUT', { phoneNumber: '2015550123', smsConsent: true }],
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
  const response = await route(path, db).PUT(request('/api/cohort-sms-preferences', 'PUT', body))
  assert.equal(response.status, 409)
  assert.equal(db.tables.cohort_sms_contacts?.length ?? 0, 0)
})
