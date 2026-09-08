import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs, database } from './test-support.mjs'

test('bulk messages use stored content and claims before any provider effect', async () => {
  const order = []
  const db = database({ cohort_delivery: [
    { id: 'accepted', source_id: 'campaign', cohort_id: 'cohort', state: 'accepted' },
    { id: 'pending', source_id: 'campaign', cohort_id: 'cohort', state: 'pending', kind: 'announcement', message: { subject: 'Frozen' } },
  ] })
  db.rpc = async (name, args) => {
    order.push(name)
    if (name === 'ascenso_claim_delivery') return { data: { message: args.p_message, attempt_key: 'stable', claim_token: 'token' } }
    assert.equal(args.p_provider_id, 'provider-id')
    return { data: true }
  }
  const { sendCohortDeliveries } = loadTs('src/lib/cohort-delivery.ts', {
    'server-only': {}, '@/lib/email': {
      buildCohortOperationalEmail: () => assert.fail('Do not rebuild a bulk message'),
      sendCohortOperationalEmail: async (message, key) => {
        assert.equal(message.subject, 'Frozen'); assert.equal(key, 'ascenso/stable')
        order.push('provider'); return 'provider-id'
      },
    },
  })
  assert.equal(await sendCohortDeliveries(db, 'campaign', 'cohort'), true)
  assert.deepEqual(order, ['ascenso_claim_delivery', 'provider', 'ascenso_finish_delivery'])
})

test('no capacity sends nothing; provider uncertainty records failure without deleting intent', async () => {
  for (const capacity of [false, true]) {
    let sent = 0, finished = 0
    const db = { rpc: async (name, args) => {
      if (name === 'ascenso_delivery_queue') return { data: [{ id: 'd', state: 'pending', message: {} }] }
      if (name === 'ascenso_claim_delivery') return { data: capacity ? { message: {}, attempt_key: 'same', claim_token: 't' } : null }
      assert.equal(args.p_provider_id, null); finished++; return { data: true }
    } }
    const { drainCohortDeliveryQueue } = loadTs('src/lib/cohort-delivery.ts', {
      'server-only': {}, '@/lib/email': { sendCohortOperationalEmail: async () => { sent++; throw new Error('Uncertain') } },
    })
    assert.equal(await drainCohortDeliveryQueue(db), false)
    assert.equal(sent, capacity ? 1 : 0); assert.equal(finished, sent)
  }
})

test('announcement authorization denies requests before recipient resolution', async () => {
  for (const [session, expected] of [[{ status: 'unauthenticated' }, 401], [{ status: 'not_admin' }, 404], [{ status: 'admin', adminUser: {} }, 404]]) {
    const { POST } = loadTs('src/app/api/admin/announcements/route.ts', {
      'next/server': { NextResponse: { json: (b, o) => Response.json(b, o) } },
      '@/lib/admin': { resolveAdminSession: async () => session, canAccessCohort: () => false },
      '@/lib/supabase-admin': { getSupabaseAdmin: () => assert.fail('No database access') },
      '@/lib/email': {}, '@/lib/cohort-delivery': {},
    })
    const result = await POST(new Request('https://example.org', { method: 'POST', body: JSON.stringify({ cohortId: 'other', subject: 'Subject', body: 'Message', audience: 'all' }) }))
    assert.equal(result.status, expected)
  }
})
