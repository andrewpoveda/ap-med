import assert from 'node:assert/strict'
import test from 'node:test'
import { database, loadTs } from './test-support.mjs'

const cohortId = '11111111-1111-4111-8111-111111111111'
const applicationId = '22222222-2222-4222-8222-222222222222'
const adminId = '33333333-3333-4333-8333-333333333333'
const application = {
  id: applicationId, cohort_id: cohortId, role: 'mentor', status: 'submitted',
  email: 'member@example.org', member_id: 'mentor-1', sms_handoff_state: null,
  answers: { sms_phone_e164: '+12015550123', sms_consent: false },
}

const request = (action) => new Request('https://ap-med.test/api/admin/cohort-applications/' + applicationId, {
  method: 'PATCH', body: JSON.stringify({ action, notes: '' }),
})

function approvalDatabase() {
  const db = database({
    cohort_applications: [application],
    mentor: [{ id: 'mentor-1', cohort_id: cohortId, person_id: 'person-1' }],
  })
  const from = db.from.bind(db)
  db.from = (table) => {
    const query = from(table)
    if (table === 'cohort_sms_contacts') {
      query.upsert = async () => ({ error: { code: '08006' } })
    }
    return query
  }
  return db
}

test('optional applications without a phone never start an SMS handoff', async () => {
  const { hasApplicationSmsContact, completeApplicationSmsHandoff } = loadTs('src/lib/cohort-application-sms.ts')
  const noPhone = { ...application, answers: { sms_phone_e164: null, sms_consent: false } }
  assert.equal(hasApplicationSmsContact(noPhone.answers), false)
  assert.equal(await completeApplicationSmsHandoff({
    from: () => assert.fail('No SMS database read expected'),
    rpc: () => assert.fail('No SMS state update expected'),
  }, noPhone, adminId), null)
})

test('failed approval contact copy is recorded as needs_review', async () => {
  const db = approvalDatabase()
  const calls = []
  db.rpc = async (name, args) => {
    calls.push({ name, args })
    if (name === 'ascenso_review_application') {
      db.tables.cohort_applications[0].status = 'approved'
      db.tables.cohort_applications[0].sms_handoff_state = 'pending'
      return { data: 'approved', error: null }
    }
    assert.equal(name, 'sms_record_application_handoff')
    assert.equal(db.tables.cohort_applications[0].sms_handoff_state, 'pending')
    db.tables.cohort_applications[0].sms_handoff_state = args.p_state
    return { data: args.p_state, error: null }
  }
  const { PATCH } = loadTs('src/app/api/admin/cohort-applications/[id]/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: adminId } }), canAccessCohort: () => true },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/cohort-delivery': { sendCohortDeliveries: async () => true },
  })
  const originalError = console.error
  console.error = () => {}
  let response
  try {
    response = await PATCH(request('approve'), { params: Promise.resolve({ id: applicationId }) })
  } finally {
    console.error = originalError
  }
  assert.equal(response.status, 200)
  assert.match((await response.json()).warning, /SMS phone enrollment could not be confirmed/)
  assert.equal(db.tables.cohort_applications[0].sms_handoff_state, 'needs_review')
  assert.equal(calls.at(-1).args.p_actor, adminId)
  assert.equal(calls.at(-1).args.p_state, 'needs_review')
})

test('admin retry checks authorization and skips review and decision email', async () => {
  const db = database({ cohort_applications: [{ ...application, status: 'approved', sms_handoff_state: 'needs_review' }] })
  let completed = 0
  const route = (session, allowed) => loadTs('src/app/api/admin/cohort-applications/[id]/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/admin': { resolveAdminSession: async () => session, canAccessCohort: () => allowed },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/cohort-delivery': { sendCohortDeliveries: () => assert.fail('Retry resent decision email') },
    '@/lib/cohort-application-sms': {
      hasApplicationSmsContact: () => true,
      completeApplicationSmsHandoff: async () => { completed++; return null },
    },
  })
  const ctx = { params: Promise.resolve({ id: applicationId }) }
  assert.equal((await route({ status: 'unauthenticated' }, false).PATCH(request('retry_sms_handoff'), ctx)).status, 401)
  assert.equal((await route({ status: 'admin', adminUser: { id: adminId } }, false).PATCH(request('retry_sms_handoff'), ctx)).status, 404)
  assert.equal(completed, 0)
  db.rpc = () => assert.fail('Retry repeated the approval RPC')
  const response = await route({ status: 'admin', adminUser: { id: adminId } }, true)
    .PATCH(request('retry_sms_handoff'), ctx)
  assert.equal(response.status, 200)
  assert.equal(completed, 1)
  assert.deepEqual(await response.json(), { success: true, status: 'approved' })
})

test('failed status write still warns and leaves an approval retryable', async () => {
  const db = approvalDatabase()
  db.tables.cohort_applications[0].status = 'approved'
  db.tables.cohort_applications[0].sms_handoff_state = 'pending'
  db.rpc = async (name) => {
    assert.equal(name, 'sms_record_application_handoff')
    return { data: null, error: { code: '08006' } }
  }
  const { completeApplicationSmsHandoff } = loadTs('src/lib/cohort-application-sms.ts')
  const originalError = console.error
  console.error = () => {}
  let warning
  try {
    warning = await completeApplicationSmsHandoff(db, application, adminId)
  } finally {
    console.error = originalError
  }
  assert.match(warning, /SMS phone enrollment could not be confirmed/)
  assert.equal(db.tables.cohort_applications[0].sms_handoff_state, 'pending')
})

test('a retry confirms a matching contact but preserves a newer different phone', async () => {
  const { completeApplicationSmsHandoff, SMS_HANDOFF_CONFLICT_WARNING } =
    loadTs('src/lib/cohort-application-sms.ts')
  for (const [savedPhone, expectedState] of [
    ['+12015550123', 'complete'],
    ['+12015550124', 'conflict'],
  ]) {
    const approved = { ...application, status: 'approved', sms_handoff_state: 'pending' }
    const db = database({
      cohort_applications: [approved],
      mentor: [{ id: 'mentor-1', cohort_id: cohortId, person_id: 'person-1' }],
      cohort_sms_contacts: [{ cohort_id: cohortId, person_id: 'person-1',
        phone_e164: savedPhone, consented_at: null, opted_out_at: null }],
    })
    const from = db.from.bind(db)
    db.from = (table) => {
      const query = from(table)
      if (table === 'cohort_sms_contacts') query.upsert = async () => ({ error: null })
      return query
    }
    db.rpc = async (name, args) => {
      assert.equal(name, 'sms_record_application_handoff')
      db.tables.cohort_applications[0].sms_handoff_state = args.p_state
      return { data: args.p_state, error: null }
    }
    const warning = await completeApplicationSmsHandoff(db, approved, adminId)
    assert.equal(db.tables.cohort_applications[0].sms_handoff_state, expectedState)
    assert.equal(db.tables.cohort_sms_contacts[0].phone_e164, savedPhone)
    assert.equal(warning, expectedState === 'complete' ? null : SMS_HANDOFF_CONFLICT_WARNING)
  }
})
