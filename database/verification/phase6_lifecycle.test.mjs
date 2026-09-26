import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs, database } from './test-support.mjs'
const framework = { 'next/server': { NextResponse: { json: (b, o) => Response.json(b, o) } } }

test('admin identity grants allow multiple cohorts and revocation is effective on the next lookup', async () => {
  const db = database({ admin_users: [{ id: 'a', email: 'director@example.org', role: 'cohort_admin', cohort_id: 'legacy', disabled_at: null }],
    admin_cohort_grants: [{ admin_id: 'a', cohort_id: 'one', revoked_at: null }, { admin_id: 'a', cohort_id: 'two', revoked_at: null }] })
  const { getAdminUserByEmail, canAccessCohort } = loadTs('src/lib/admin.ts', {
    react: { cache: fn => fn }, 'next/navigation': {}, '@/lib/supabase-server': {}, '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
  })
  const first = await getAdminUserByEmail(' DIRECTOR@example.org ')
  assert.equal(canAccessCohort(first, 'one'), true); assert.equal(canAccessCohort(first, 'two'), true)
  assert.equal(canAccessCohort(first, 'legacy'), false); assert.equal(canAccessCohort(first, 'other'), false)
  db.tables.admin_cohort_grants[0].revoked_at = '2026-01-01'
  const second = await getAdminUserByEmail('director@example.org')
  assert.equal(canAccessCohort(second, 'one'), false); assert.equal(canAccessCohort(second, 'two'), true)
  db.tables.admin_cohort_grants[1].revoked_at = '2026-01-01'
  assert.equal(await getAdminUserByEmail('director@example.org'), null)
  db.tables.admin_users[0].role = 'super'; db.tables.admin_users[0].disabled_at = '2026-01-01'
  assert.equal(await getAdminUserByEmail('director@example.org'), null)
})

test('only supers manage grants or create cohorts; wrong-cohort configuration is denied', async () => {
  for (const route of ['cohort-grants', 'cohorts']) {
    for (const session of [{ status: 'unauthenticated' }, { status: 'not_admin' }, { status: 'admin', adminUser: { role: 'cohort_admin', cohort_ids: ['one'] } }]) {
      const { POST } = loadTs(`src/app/api/admin/${route}/route.ts`, { ...framework,
        '@/lib/admin': { resolveAdminSession: async () => session, canAccessCohort: () => false },
        '@/lib/supabase-admin': { getSupabaseAdmin: () => assert.fail('Unauthorized database call') },
      })
      const result = await POST(new Request('https://example.org', { method: 'POST', body: JSON.stringify({ id: 'other' }) }))
      assert.equal(result.status, session.status === 'unauthenticated' ? 401 : 404)
    }
  }
})

test('cohort configuration rejects invalid dates and passes expected state to the transaction', async () => {
  const cohortId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const { POST } = loadTs('src/app/api/admin/cohorts/route.ts', { ...framework,
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'a', role: 'super' } }), canAccessCohort: () => true },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({ rpc: async (name, args) => {
      assert.equal(name, 'ascenso_configure_cohort_guarded'); assert.equal(args.p_expected, 'setup');
      assert.equal(args.p_expected_version, 4); assert.equal(args.p_actor, 'a'); return { data: 'c' }
    } }) },
  })
  const body = { id: cohortId, name: 'Program', org: 'University', status: 'applications_open', expected: 'setup', expectedVersion: 4, reason: 'Opening intake', orientation: '2026-02-30' }
  const req = () => new Request('https://example.org', { method: 'POST', body: JSON.stringify(body) })
  assert.equal((await POST(req())).status, 400)
  body.orientation = '2026-03-01'
  assert.equal((await POST(req())).status, 200)
  body.id = 'bad-id'
  assert.equal((await POST(req())).status, 400)
  body.id = cohortId
  body.expected = 'unknown'
  assert.equal((await POST(req())).status, 400)
  body.expected = 'setup'
  body.expectedVersion = -1
  assert.equal((await POST(req())).status, 400)
})

test('cohort creation requires a stable request ID and forwards it to the guarded transaction', async () => {
  const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  let calls = 0
  const { POST } = loadTs('src/app/api/admin/cohorts/route.ts', { ...framework,
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'a', role: 'super' } }), canAccessCohort: () => true },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({ rpc: async (name, args) => {
      calls++
      assert.equal(name, 'ascenso_configure_cohort_guarded')
      assert.equal(args.p_create_request, requestId)
      assert.equal(args.p_expected_version, null)
      return { data: 'created-cohort' }
    } }) },
  })
  const body = { name: 'Program', org: 'University', status: 'setup', reason: 'Initial setup', orientation: '' }
  const req = () => new Request('https://example.org', { method: 'POST', body: JSON.stringify(body) })
  assert.equal((await POST(req())).status, 400)
  body.createRequestId = requestId
  assert.equal((await POST(req())).status, 200)
  assert.equal((await POST(req())).status, 200)
  assert.equal(calls, 2)
})

test('cohort configuration reports the actual closeout guard or stale settings', async () => {
  const cohortId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  let message = 'Cancel future sessions and resolve calendar cleanup before closeout'
  const { POST } = loadTs('src/app/api/admin/cohorts/route.ts', { ...framework,
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'a', role: 'super' } }), canAccessCohort: () => true },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({ rpc: async () => ({ error: { code: '23514', message } }) }) },
  })
  const body = { id: cohortId, name: 'Program', org: 'University', status: 'closed', expected: 'active', expectedVersion: 4, reason: 'Close program', orientation: '' }
  const req = () => new Request('https://example.org', { method: 'POST', body: JSON.stringify(body) })
  const closeout = await POST(req())
  assert.equal(closeout.status, 409)
  assert.equal((await closeout.json()).error, message)
  message = 'Cohort settings changed; refresh'
  const stale = await POST(req())
  assert.equal(stale.status, 409)
  assert.equal((await stale.json()).error, message)
})

test('cohort configuration hides unexpected database errors and returns a reference', async () => {
  const error = { code: '23503', message: 'sensitive database detail', details: 'sensitive', hint: null }
  const { POST } = loadTs('src/app/api/admin/cohorts/route.ts', { ...framework,
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'a', role: 'super' } }), canAccessCohort: () => true },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({ rpc: async () => ({ error }) }) },
  })
  const body = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Program', org: 'University', status: 'active', expected: 'active', expectedVersion: 4, reason: 'Update settings', orientation: '' }
  const prior = console.error
  let logged
  console.error = (...args) => { logged = args }
  try {
    const response = await POST(new Request('https://example.org', { method: 'POST', body: JSON.stringify(body) }))
    assert.equal(response.status, 500)
    const result = await response.json()
    assert.match(result.error, /Reference: [0-9a-f-]{36}$/)
    assert.equal(result.error.includes(error.message), false)
    assert.equal(logged?.[0], 'Could not configure cohort')
    assert.deepEqual(Object.keys(logged[1]).sort(), ['code', 'operation', 'reference'])
    assert.equal(logged[1].code, error.code)
    assert.equal(logged[1].operation, 'update')
  } finally {
    console.error = prior
  }
})
