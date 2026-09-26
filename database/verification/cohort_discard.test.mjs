import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './test-support.mjs'

const framework = { 'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } } }
const id = '11111111-1111-4111-8111-111111111111'
const context = { params: Promise.resolve({ id }) }
const request = (action = 'discard') => new Request('https://example.org', {
  method: 'POST', body: JSON.stringify({ action, reason: 'QA cleanup', expectedVersion: 3 }),
})

test('only super administrators may discard or restore a cohort', async () => {
  for (const session of [
    { status: 'unauthenticated' },
    { status: 'not_admin' },
    { status: 'admin', adminUser: { id: 'scoped', role: 'cohort_admin' } },
  ]) {
    const { POST } = loadTs('src/app/api/admin/cohorts/[id]/discard/route.ts', {
      ...framework,
      '@/lib/admin': { resolveAdminSession: async () => session },
      '@/lib/supabase-admin': { getSupabaseAdmin: () => assert.fail('Unauthorized database access') },
      '@/lib/site': { getAscensoCohortId: () => null },
    })
    const response = await POST(request(), context)
    assert.equal(response.status, session.status === 'unauthenticated' ? 401 : 404)
  }
})

test('the configured public application cohort cannot be discarded', async () => {
  const { POST } = loadTs('src/app/api/admin/cohorts/[id]/discard/route.ts', {
    ...framework,
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'super', role: 'super' } }) },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => assert.fail('Configured cohort must not reach RPC') },
    '@/lib/site': { getAscensoCohortId: () => id },
  })
  assert.equal((await POST(request(), context)).status, 409)
})

test('discard and restore pass the authenticated actor and report conflicts', async () => {
  const calls = []
  const { POST } = loadTs('src/app/api/admin/cohorts/[id]/discard/route.ts', {
    ...framework,
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'super', role: 'super' } }) },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({ rpc: async (name, args) => {
      calls.push({ name, args })
      return { error: args.p_discard && calls.length === 1 ? { code: '23514', message: 'linked records' } : null }
    } }) },
    '@/lib/site': { getAscensoCohortId: () => null },
  })
  assert.equal((await POST(request(), context)).status, 409)
  const restored = await POST(request('restore'), context)
  assert.equal(restored.status, 200)
  assert.deepEqual(await restored.json(), { success: true, discarded: false })
  assert.equal(calls[0].name, 'ascenso_set_cohort_discarded')
  assert.deepEqual(calls[0].args, { p_id: id, p_actor: 'super', p_discard: true, p_reason: 'QA cleanup', p_expected_version: 3 })
  assert.equal(calls[1].args.p_discard, false)
})
