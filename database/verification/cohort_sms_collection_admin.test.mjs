import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './test-support.mjs'

const framework = { 'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } } }
const cohortId = '11111111-1111-4111-8111-111111111111'
const context = { params: Promise.resolve({ id: cohortId }) }
const request = (body = { mode: 'optional', reason: 'Pilot phone collection', expectedVersion: 4 }) =>
  new Request('https://example.org', { method: 'PATCH', body: JSON.stringify(body) })

test('cohort phone collection settings reject unauthenticated and out-of-scope writes', async () => {
  for (const [session, status] of [
    [{ status: 'unauthenticated' }, 401],
    [{ status: 'not_admin' }, 404],
    [{ status: 'admin', adminUser: { id: 'other', role: 'cohort_admin' } }, 404],
  ]) {
    const { PATCH } = loadTs('src/app/api/admin/cohorts/[id]/sms-phone-collection/route.ts', {
      ...framework,
      '@/lib/admin': { resolveAdminSession: async () => session, canAccessCohort: () => false },
      '@/lib/supabase-admin': { getSupabaseAdmin: () => assert.fail('Denied request reached database') },
    })
    assert.equal((await PATCH(request(), context)).status, status)
  }
})

test('cohort phone collection settings validate mode, reason and version before database access', async () => {
  const { PATCH } = loadTs('src/app/api/admin/cohorts/[id]/sms-phone-collection/route.ts', {
    ...framework,
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'admin' } }), canAccessCohort: () => true },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => assert.fail('Invalid request reached database') },
  })
  for (const body of [
    { mode: 'on', reason: 'Valid reason', expectedVersion: 4 },
    { mode: 'required', reason: 'x', expectedVersion: 4 },
    { mode: 'optional', reason: 'Valid reason', expectedVersion: -1 },
    { mode: 'optional', reason: 'Valid reason', expectedVersion: 1.5 },
  ]) assert.equal((await PATCH(request(body), context)).status, 400)
})

test('cohort phone collection setting forwards actor and version to guarded RPC', async () => {
  const calls = []
  const { PATCH } = loadTs('src/app/api/admin/cohorts/[id]/sms-phone-collection/route.ts', {
    ...framework,
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'admin' } }), canAccessCohort: () => true },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({ rpc: async (name, args) => {
      calls.push({ name, args })
      return { data: 5, error: null }
    } }) },
  })
  const response = await PATCH(request(), context)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, version: 5 })
  assert.deepEqual(calls, [{ name: 'cohort_set_sms_phone_collection', args: {
    p_cohort: cohortId, p_actor: 'admin', p_mode: 'optional', p_reason: 'Pilot phone collection', p_expected_version: 4,
  } }])
})

test('cohort phone collection setting hides authorization and stale-version details', async () => {
  let error = { code: '42501', message: 'private admin detail' }
  const { PATCH } = loadTs('src/app/api/admin/cohorts/[id]/sms-phone-collection/route.ts', {
    ...framework,
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'admin' } }), canAccessCohort: () => true },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({ rpc: async () => ({ error }) }) },
  })
  assert.equal((await PATCH(request(), context)).status, 404)
  error = { code: '23514', message: 'private conflict detail' }
  const stale = await PATCH(request(), context)
  assert.equal(stale.status, 409)
  assert.equal(JSON.stringify(await stale.json()).includes(error.message), false)
})
