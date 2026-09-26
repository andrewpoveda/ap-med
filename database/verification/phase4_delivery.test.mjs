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

test('closed cohorts reject announcements before resolving recipients', async () => {
  const db = database({ cohorts: [{ id: 'cohort', name: 'Pilot', status: 'closed' }] })
  const { POST } = loadTs('src/app/api/admin/announcements/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'actor' } }), canAccessCohort: () => true },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/validate': { cap: value => String(value ?? ''), LIMITS: { name: 200, text: 2000 } },
    '@/lib/email': {}, '@/lib/cohort-delivery': {},
  })
  const result = await POST(new Request('https://example.org/api/admin/announcements?test=1', {
    method: 'POST', body: JSON.stringify({ cohortId: 'cohort', subject: 'Subject', body: 'Message', audience: 'all' }),
  }))
  assert.equal(result.status, 409)
  assert.match((await result.json()).error, /cohort is closed/i)
  assert.deepEqual(db.calls, [{ table: 'cohorts', action: 'read' }])
})

test('a closeout race gets a specific conflict response and never invokes the sender', async () => {
  const db = database({
    cohorts: [{ id: 'cohort', name: 'Pilot', status: 'active' }],
    mentor: [{ cohort_id: 'cohort', membership_status: 'active', email: 'mentor@example.org' }],
  })
  db.rpc = async (name) => {
    assert.equal(name, 'ascenso_queue_announcement')
    return { data: null, error: { code: '23514', message: 'Closed cohorts cannot queue announcements' } }
  }
  const { POST } = loadTs('src/app/api/admin/announcements/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'actor' } }), canAccessCohort: () => true },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/complete-query': { completeQuery: async query => await query },
    '@/lib/validate': { cap: value => String(value ?? ''), LIMITS: { name: 200, text: 2000 }, isValidEmail: () => true },
    '@/lib/email': { buildAnnouncementMessage: to => ({ to }) },
    '@/lib/cohort-delivery': { sendCohortDeliveries: () => assert.fail('No delivery after closeout') },
  })
  const result = await POST(new Request('https://example.org/api/admin/announcements', {
    method: 'POST', body: JSON.stringify({ cohortId: 'cohort', subject: 'Subject', body: 'Message', audience: 'all',
      requestId: '11111111-1111-4111-8111-111111111111' }),
  }))
  assert.equal(result.status, 409)
  assert.match((await result.json()).error, /cohort is closed/i)
})
