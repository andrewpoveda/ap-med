import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs, database } from './test-support.mjs'

const adminUser = { id: 'admin', role: 'cohort_admin', cohort_id: 'cohort' }
const session = { status: 'admin', adminUser }
const request = (body, method = 'PATCH') => new Request('https://ascenso.test/api', { method, body: JSON.stringify(body) })
const ctx = { params: Promise.resolve({ id: 'target' }) }
function route(path, db, auth = session, extra = {}) {
  return loadTs(path, {
    'server-only': {},
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init), redirect: url => Response.redirect(url) } },
    '@/lib/admin': { resolveAdminSession: async () => auth, canAccessCohort: (a, c) => a.role === 'super' || a.cohort_id === c },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/cohort-delivery': { sendCohortDeliveries: async () => true },
    ...extra,
  })
}

for (const [path, method] of [
  ['src/app/api/admin/cohort-members/[id]/route.ts', 'PATCH'],
  ['src/app/api/admin/cohort-delivery/[id]/route.ts', 'POST'],
  ['src/app/api/admin/cohort-applications/[id]/route.ts', 'PATCH'],
  ['src/app/api/admin/cohort-matches/[id]/route.ts', 'PATCH'],
]) {
  test(`${path}: anonymous and non-admin requests cannot read or write`, async () => {
    for (const [status, code] of [['unauthenticated', 401], ['not_admin', 404]]) {
      const db = database()
      const res = await route(path, db, { status })[method](request({}, method), ctx)
      assert.equal(res.status, code)
      assert.equal(db.calls.length, 0)
    }
  })
  test(`${path}: wrong-cohort access is denied before mutation`, async () => {
    const db = database({
      cohort_delivery: [{ id: 'target', cohort_id: 'other' }],
      cohort_matches: [{ id: 'target', cohort_id: 'other' }],
      cohort_applications: [{ id: 'target', cohort_id: 'other' }],
    })
    db.rpc = () => assert.fail('Wrong cohort invoked a mutation')
    const res = await route(path, db)[method](request({ action: 'approve', cohortId: 'other' }, method), ctx)
    assert.equal(res.status, 404)
  })
}

test('application decision remains saved when notifications are incomplete', async () => {
  const db = database({ cohort_applications: [{ id: 'target', cohort_id: 'cohort', email: ' AlEx_%@Example.org ' }] })
  let args
  db.rpc = async (fn, input) => { assert.equal(fn, 'ascenso_review_application'); args = input; return { data: 'approved' } }
  const res = await route('src/app/api/admin/cohort-applications/[id]/route.ts', db, session, {
    '@/lib/cohort-delivery': { sendCohortDeliveries: async () => false },
  }).PATCH(request({ action: 'approve', notes: 'Review' }), ctx)
  assert.equal(res.status, 200)
  assert.equal(args.p_email, 'alex_%@example.org')
  assert.equal(args.p_actor, 'admin')
  assert.match((await res.json()).warning, /Decision saved/)
})

test('member route rejects ownership/cohort injection and blank names', async () => {
  const db = database()
  for (const changes of [{ auth_user_id: 'attacker' }, { email: 'attacker@example.org' }, { cohort_id: 'other' }, { first_name: ' ' }, { membership_status: 'unknown' }]) {
    const res = await route('src/app/api/admin/cohort-members/[id]/route.ts', db).PATCH(request({ cohortId: 'cohort', role: 'mentor', changes, reason: 'Correction' }), ctx)
    assert.equal(res.status, 400)
  }
  assert.equal(db.calls.length, 0)
})

test('member correction passes scoped identity, reason and original fields to transaction', async () => {
  const db = database({ mentor: [{ id: 'target', cohort_id: 'cohort' }] })
  db.rpc = async (fn, args) => {
    assert.equal(fn, 'ascenso_change_member'); assert.equal(args.p_actor, 'admin')
    assert.deepEqual(args.p_expected, { first_name: 'Original' })
    return { error: null }
  }
  assert.equal((await route('src/app/api/admin/cohort-members/[id]/route.ts', db).PATCH(request({ cohortId: 'cohort', role: 'mentor', changes: { first_name: 'Corrected' }, expected: { first_name: 'Original' }, reason: 'Name typo' }), ctx)).status, 200)
})

for (const table of ['mentor', 'mentees']) {
  test(`${table}: withdrawn/offboarded members cannot claim or use existing sessions`, async () => {
    const lib = loadTs(`src/lib/${table === 'mentor' ? 'mentor' : 'mentee'}-link.ts`)
    for (const membership_status of ['withdrawn', 'offboarded']) {
      const db = database({ people: [{ id: 'p', auth_user_id: 'owner' }], [table]: [{ id: 'm', person_id: 'p', cohort_id: 'cohort', membership_status, normalized_email: 'member@example.org', auth_user_id: 'owner' }] })
      db.rpc = async () => ({ data: null })
      const claim = table === 'mentor' ? lib.linkMentorByEmail : lib.linkCohortMenteeByEmail
      const get = table === 'mentor' ? lib.getMentorForUser : lib.getCohortMenteeForUser
      assert.equal((await claim(db, 'owner', 'member@example.org')).status, 'no-profile')
      assert.equal(await get(db, 'owner'), null)
      assert.ok(db.calls.every(c => c.action === 'read'))
    }
  })
}

test('admin-only OAuth routes to admin while preserving mentor/mentee destinations', async () => {
  for (const [resolution, admin, expected] of [['none', true, '/admin'], ['none', false, '/login?error=no_account'], ['mentor', true, '/dashboard'], ['mentee', true, '/ascenso/dashboard'], ['conflict', true, '/login?error=account_conflict']]) {
    const { signInDestination } = loadTs('src/lib/account-role.ts')
    const auth = { auth: { exchangeCodeForSession: async () => ({}), getUser: async () => ({ data: { user: { id: 'u', email: 'admin@example.org' } } }) } }
    const callback = route('src/app/auth/callback/route.ts', {}, session, {
      '@/lib/supabase-server': { createSupabaseServerClient: async () => auth },
      '@/lib/account-role': { resolveAccountForUser: async () => resolution, signInDestination },
      '@/lib/admin': { getAdminUserByEmail: async () => admin ? adminUser : null },
    })
    const res = await callback.GET(new Request('https://ascenso.test/auth/callback?code=verified'))
    assert.equal(res.headers.get('location'), `https://ascenso.test${expected}`)
  }
})

test('activation persists active state and surfaces a partial-send warning', async () => {
  const db = database({ cohort_matches: [{ id: 'target', cohort_id: 'cohort', status: 'board_approved' }] })
  db.rpc = async (fn, args) => { assert.equal(fn, 'ascenso_match_action'); assert.equal(args.p_actor, 'admin'); return { data: 'active' } }
  const res = await route('src/app/api/admin/cohort-matches/[id]/route.ts', db, session, { '@/lib/cohort-delivery': { sendCohortDeliveries: async () => false } }).PATCH(request({ action: 'activate' }), ctx)
  assert.equal(res.status, 200)
  assert.match((await res.json()).warning, /Match is active/)
  assert.ok(db.calls.every(c => c.action === 'read'))
})

function deliveryWorker(db, send) {
  for (const row of db.tables.cohort_delivery ?? []) row.cohort_id ??= 'cohort'
  return loadTs('src/lib/cohort-delivery.ts', {
    'server-only': {},
    '@/lib/email': { buildCohortOperationalEmail: d => ({ to: d.recipient_email }), sendCohortOperationalEmail: send },
  }).sendCohortDeliveries(db, 'source', 'cohort')
}

test('delivery worker skips accepted/superseded recipients and uses persisted message/key', async () => {
  const db = database({ cohort_delivery: [
    { id: 'ok', source_id: 'source', state: 'accepted' },
    { id: 'old', source_id: 'source', state: 'superseded' },
    { id: 'retry', source_id: 'source', state: 'failed', recipient_email: 'current@example.org' },
  ] })
  const calls = []
  db.rpc = async (fn, args) => {
    calls.push(fn)
    assert.equal(args.p_id, 'retry')
    return fn === 'ascenso_claim_delivery' ? { data: { message: { to: 'frozen@example.org' }, attempt_key: 'fixed-key', claim_token: 'lease' } } : { data: true }
  }
  assert.equal(await deliveryWorker(db, async (message, key) => { assert.equal(message.to, 'frozen@example.org'); assert.equal(key, 'ascenso/fixed-key'); return 'provider-id' }), true)
  assert.deepEqual(calls, ['ascenso_claim_delivery', 'ascenso_finish_delivery'])
})

test('delivery worker handles quota, transport and persistence failures without inventing acceptance', async () => {
  for (const failure of ['quota', 'claim', 'transport', 'finish']) {
    const db = database({ cohort_delivery: [{ id: 'd', source_id: 'source', state: 'pending' }] })
    db.rpc = async (fn, args) => {
      if (fn === 'ascenso_claim_delivery') return failure === 'quota' ? { data: null } : failure === 'claim' ? { error: { message: 'offline' } } : { data: { message: {}, attempt_key: 'key', claim_token: 'token' } }
      if (failure === 'transport') assert.equal(args.p_provider_id, null)
      return failure === 'finish' ? { error: { message: 'offline' } } : { data: true }
    }
    assert.equal(await deliveryWorker(db, async () => { if (failure === 'transport') throw new Error('Timeout'); return 'accepted' }), false)
  }
  assert.equal(await deliveryWorker(database(), () => assert.fail('Historical no-intent state must not send')), false)
})

test('operational email escapes names, preserves brand, and sends a provider idempotency key', async () => {
  let sent
  class Resend { emails = { send: async (message, options) => { sent = { message, options }; return { data: { id: 'accepted' } } } } }
  const { buildCohortOperationalEmail, sendCohortOperationalEmail } = loadTs('src/lib/email.ts', { resend: { Resend }, '@/lib/site': { ascensoAbsoluteUrl: path => `https://ascenso.test${path}` } })
  const message = buildCohortOperationalEmail({ kind: 'decision', variant: 'approved', recipient_email: 'member@example.org', payload: { name: '<script>bad</script>', cohortName: 'Pilot' } })
  assert.ok(!message.html.includes('<script>'))
  assert.ok(message.html.includes('&lt;script&gt;'))
  assert.ok(message.html.includes('https://ascenso.test/login'))
  assert.equal(await sendCohortOperationalEmail(message, 'stable-key'), 'accepted')
  assert.deepEqual(sent.options, { idempotencyKey: 'stable-key' })
})
