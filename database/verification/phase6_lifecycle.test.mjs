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
  const { POST } = loadTs('src/app/api/admin/cohorts/route.ts', { ...framework,
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'a', role: 'super' } }), canAccessCohort: () => true },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({ rpc: async (name, args) => {
      assert.equal(name, 'ascenso_configure_cohort'); assert.equal(args.p_expected, 'setup'); assert.equal(args.p_actor, 'a'); return { data: 'c' }
    } }) },
  })
  const body = { id: 'c', name: 'Program', org: 'University', status: 'applications_open', expected: 'setup', reason: 'Opening intake', orientation: '2026-02-30' }
  const req = () => new Request('https://example.org', { method: 'POST', body: JSON.stringify(body) })
  assert.equal((await POST(req())).status, 400)
  body.orientation = '2026-03-01'
  assert.equal((await POST(req())).status, 200)
})
