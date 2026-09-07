import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs, database } from './test-support.mjs'

const request = action => new Request('https://example.org/api/sessions/s', { method: 'PATCH', body: JSON.stringify({ action }) })
const ctx = { params: Promise.resolve({ id: 's' }) }
function cancellation(db, options = {}) {
  return loadTs('src/app/api/sessions/[id]/route.ts', {
    'next/server': { NextResponse: { json: (b, o) => Response.json(b, o) } },
    '@/lib/supabase-server': { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.anonymous ? null : { id: 'u' } } }) } }) },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/mentor-link': { getMentorForUser: async () => options.noMentor ? null : { id: 'm' } },
    '@/lib/sessions': { getMentorAccessToken: async () => options.disconnected ? null : 'token' },
    '@/lib/google': { deleteCalendarEvent: async () => {
      assert.equal(db.tables.sessions[0].status, 'cancelled', 'Database cancellation must precede the provider write')
      if (options.providerFails) throw new Error('Unavailable')
    } },
  }).PATCH
}
const row = () => ({ id: 's', mentor_id: 'm', status: 'scheduled', google_event_id: 'event', calendar_cleanup_pending: false })

test('cancellation retains recovery after provider failure or missing connection', async () => {
  for (const options of [{ providerFails: true }, { disconnected: true }]) {
    const db = database({ sessions: [row()] })
    const res = await cancellation(db, options)(request('cancel'), ctx)
    assert.equal(res.status, 200)
    assert.equal((await res.json()).calendarCleanupPending, true)
    assert.equal(db.tables.sessions[0].status, 'cancelled')
    assert.equal(db.tables.sessions[0].calendar_cleanup_pending, true)
    const retry = await cancellation(db)(request('retry_calendar_cleanup'), ctx)
    assert.equal((await retry.json()).calendarCleanupPending, false)
    assert.equal(db.tables.sessions[0].calendar_cleanup_pending, false)
  }
})

test('anonymous, mentee and unrelated mentor cannot cancel', async () => {
  for (const [options, owner, status] of [[{ anonymous: true }, 'm', 401], [{ noMentor: true }, 'm', 403], [{}, 'other', 404]]) {
    const db = database({ sessions: [{ ...row(), mentor_id: owner }] })
    assert.equal((await cancellation(db, options)(request('cancel'), ctx)).status, status)
    assert.ok(db.calls.every(c => c.action === 'read'))
  }
})

test('completed sessions and completion races cannot be cancelled', async () => {
  const db = database({ sessions: [{ ...row(), status: 'completed' }] })
  assert.equal((await cancellation(db)(request('cancel'), ctx)).status, 409)
  const racing = database({ sessions: [row()] }, { beforeUpdate(tables) { tables.sessions[0].status = 'completed' } })
  assert.equal((await cancellation(racing)(request('cancel'), ctx)).status, 409)
  assert.equal(racing.tables.sessions[0].status, 'completed')
})

test('support config validates fallback and encodes a useful human support request', () => {
  const { readCohortSupport, supportMailto } = loadTs('src/lib/cohort-support.ts')
  const fallback = readCohortSupport({ support: { email: 'javascript:bad' } })
  assert.equal(fallback.email, 'mentors@ap-med.org')
  const support = readCohortSupport({ support: { name: 'Program Office', email: 'help@example.org', instructions: 'Contact the coordinator.' } })
  assert.equal(support.name, 'Program Office')
  const url = supportMailto(support, 'Test & Program', 'member-ref')
  assert.ok(url.startsWith('mailto:help@example.org?subject='))
  assert.ok(decodeURIComponent(url).includes('member-ref'))
  assert.ok(url.includes('Test%20%26%20Program'))
})

test('support updates require a scoped admin and valid email', async () => {
  for (const [session, status] of [[{ status: 'unauthenticated' }, 401], [{ status: 'not_admin' }, 404], [{ status: 'admin', adminUser: { cohort_id: 'other' } }, 404]]) {
    const { PATCH } = loadTs('src/app/api/admin/cohorts/[id]/support/route.ts', {
      'next/server': { NextResponse: { json: (b, o) => Response.json(b, o) } },
      '@/lib/admin': { resolveAdminSession: async () => session, canAccessCohort: (a, c) => a.cohort_id === c },
      '@/lib/supabase-admin': { getSupabaseAdmin: () => assert.fail('Must not reach the database') },
    })
    assert.equal((await PATCH(request('unused'), ctx)).status, status)
  }
})

test('either participant can log an off-platform meeting, but unrelated and cross-cohort members cannot', async () => {
  for (const type of ['mentor', 'mentee']) {
    for (const allowed of [true, false]) {
      const db = database({ cohort_matches: [{ id: 'pair', cohort_id: allowed ? 'cohort' : 'other', mentor_id: 'mentor', mentee_id: 'mentee', status: 'active' }] })
      const { POST } = loadTs('src/app/api/meeting-logs/route.ts', {
        'next/server': { NextResponse: { json: (b, o) => Response.json(b, o) } },
        '@/lib/supabase-server': { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } }) },
        '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
        '@/lib/mentor-link': { getMentorForUser: async () => type === 'mentor' ? { id: 'mentor', cohort_id: 'cohort' } : null },
        '@/lib/mentee-link': { getCohortMenteeForUser: async () => ({ id: 'mentee', cohort_id: 'cohort' }) },
      })
      const res = await POST(new Request('https://example.org/api/meeting-logs', { method: 'POST', body: JSON.stringify({ matchId: 'pair', metAt: '2026-01-01', mode: 'phone' }) }))
      assert.equal(res.status, allowed ? 200 : 404)
      if (allowed) assert.equal(db.tables.meeting_logs[0].logged_by_type, type)
      else assert.ok(db.calls.every(c => c.action === 'read'))
    }
  }
})
