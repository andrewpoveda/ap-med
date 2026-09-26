import assert from 'node:assert/strict'
import test from 'node:test'
import { database, loadTs } from './test-support.mjs'

const future = () => new Date(Date.now() + 86_400_000).toISOString()
const past = () => new Date(Date.now() - 86_400_000).toISOString()
const sessionContext = { params: Promise.resolve({ id: 'session' }) }
const actionRequest = action => new Request('https://example.org/api/sessions/session', {
  method: 'PATCH', body: JSON.stringify({ action }),
})

function sessionAction(db, onDelete = () => {}) {
  return loadTs('src/app/api/sessions/[id]/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/supabase-server': { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) } }) },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/mentor-link': { getMentorForUser: async () => ({ id: 'mentor' }) },
    '@/lib/sessions': { getMentorAccessToken: async () => 'token' },
    '@/lib/google': { deleteCalendarEvent: async () => onDelete(db) },
  }).PATCH
}

test('future bookings cannot be completed or marked no-show while their event remains', async () => {
  for (const action of ['complete', 'no_show']) {
    const db = database({ sessions: [{ id: 'session', mentor_id: 'mentor', status: 'scheduled',
      scheduled_at: future(), google_event_id: 'event', calendar_cleanup_pending: false }] })
    const result = await sessionAction(db)(actionRequest(action), sessionContext)
    assert.equal(result.status, 409)
    assert.equal(db.tables.sessions[0].status, 'scheduled')
    assert.ok(db.calls.every(call => call.action === 'read'))
  }
})

test('past bookings can still be completed or marked no-show', async () => {
  for (const [action, status] of [['complete', 'completed'], ['no_show', 'no_show']]) {
    const db = database({ sessions: [{ id: 'session', mentor_id: 'mentor', status: 'scheduled',
      scheduled_at: past(), google_event_id: 'event', calendar_cleanup_pending: false }] })
    const result = await sessionAction(db)(actionRequest(action), sessionContext)
    assert.equal(result.status, 200)
    assert.equal(db.tables.sessions[0].status, status)
  }
})

test('an older misclassified future booking can be cancelled with durable calendar cleanup', async () => {
  for (const status of ['completed', 'no_show']) {
    const db = database({ sessions: [{ id: 'session', mentor_id: 'mentor', status,
      scheduled_at: future(), google_event_id: 'event', calendar_cleanup_pending: false }] })
    const result = await sessionAction(db, current => {
      assert.equal(current.tables.sessions[0].status, 'cancelled')
      assert.equal(current.tables.sessions[0].calendar_cleanup_pending, true)
    })(actionRequest('cancel'), sessionContext)
    assert.equal(result.status, 200)
    assert.equal(db.tables.sessions[0].status, 'cancelled')
    assert.equal(db.tables.sessions[0].calendar_cleanup_pending, false)
  }
})

test('calendar cleanup stays pending if the event changes during cancellation', async () => {
  const db = database({ sessions: [{ id: 'session', mentor_id: 'mentor', status: 'scheduled',
    scheduled_at: future(), google_event_id: 'original-event', calendar_cleanup_pending: false }] })
  const result = await sessionAction(db, current => {
    current.tables.sessions[0].google_event_id = 'replacement-event'
  })(actionRequest('cancel'), sessionContext)
  assert.equal(result.status, 200)
  assert.equal((await result.json()).calendarCleanupPending, true)
  assert.equal(db.tables.sessions[0].calendar_cleanup_pending, true)
})

test('an uncertain calendar cleanup without an event ID remains pending', async () => {
  const db = database({ sessions: [{ id: 'session', mentor_id: 'mentor', status: 'cancelled',
    scheduled_at: future(), google_event_id: null, calendar_cleanup_pending: true }] })
  const result = await sessionAction(db)(actionRequest('retry_calendar_cleanup'), sessionContext)
  assert.equal(result.status, 200)
  assert.equal((await result.json()).calendarCleanupPending, true)
  assert.equal(db.tables.sessions[0].calendar_cleanup_pending, true)
})

test('mentor upcoming list exposes older future resolved bookings for repair', async () => {
  let filter = ''
  const query = {
    select() { return this },
    eq(column, value) { assert.equal(column, 'mentor_id'); assert.equal(value, 'mentor'); return this },
    or(value) { filter = value; return this },
    async order() { return { data: [{ id: 'session', scheduled_at: future(), status: 'completed',
      meet_link: null, calendar_cleanup_pending: false, mentee: { full_name: 'Test Mentee' } }], error: null } },
  }
  const { getUpcomingSessions } = loadTs('src/lib/sessions.ts', {
    '@/lib/crypto': {}, '@/lib/google': {}, '@/lib/availability': {},
  })
  const sessions = await getUpcomingSessions({ from: table => {
    assert.equal(table, 'sessions')
    return query
  } }, 'mentor')
  assert.match(filter, /status\.eq\.completed/)
  assert.match(filter, /status\.eq\.no_show/)
  assert.match(filter, /calendar_cleanup_pending\.eq\.true/)
  assert.equal(sessions[0].status, 'completed')
})

test('a closed cohort cannot reopen its survey from the admin route', async () => {
  const db = database({ surveys: [{ id: 'survey', cohort_id: 'cohort', status: 'closed' }],
    cohorts: [{ id: 'cohort', status: 'closed' }] })
  let rpcCalls = 0
  db.rpc = async (name, args) => {
    rpcCalls++
    assert.equal(name, 'ascenso_mutate_survey')
    assert.deepEqual(args, { p_id: 'survey', p_cohort: 'cohort', p_actor: 'admin', p_action: 'open', p_expected_status: 'closed' })
    return { data: null, error: { code: '23514', message: 'Closed cohorts cannot change surveys' } }
  }
  const { PATCH } = loadTs('src/app/api/admin/surveys/[id]/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'admin' } }), canAccessCohort: () => true },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
  })
  const result = await PATCH(new Request('https://example.org/api/admin/surveys/survey', {
    method: 'PATCH', body: JSON.stringify({ action: 'open' }),
  }), { params: Promise.resolve({ id: 'survey' }) })
  assert.equal(result.status, 409)
  assert.equal((await result.json()).error, 'Closed cohorts cannot reopen surveys')
  assert.equal(rpcCalls, 1)
  assert.equal(db.tables.surveys[0].status, 'closed')
  assert.ok(db.calls.every(call => call.action === 'read'))
})

test('admin survey edit and delete use the cohort-first mutation RPC', async () => {
  for (const [method, action, result] of [
    ['PATCH', 'close', 'closed'],
    ['DELETE', 'delete', 'deleted'],
  ]) {
    const db = database({ surveys: [{ id: 'survey', cohort_id: 'cohort', status: 'open' }] })
    let called = false
    db.rpc = async (name, args) => {
      called = true
      assert.equal(name, 'ascenso_mutate_survey')
      assert.deepEqual(args, { p_id: 'survey', p_cohort: 'cohort', p_actor: 'admin', p_action: action, p_expected_status: 'open' })
      return { data: result, error: null }
    }
    const route = loadTs('src/app/api/admin/surveys/[id]/route.ts', {
      'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
      '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'admin' } }), canAccessCohort: () => true },
      '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    })
    const response = await route[method](new Request('https://example.org/api/admin/surveys/survey', {
      method, ...(method === 'PATCH' ? { body: JSON.stringify({ action }) } : {}),
    }), { params: Promise.resolve({ id: 'survey' }) })
    assert.equal(response.status, 200)
    assert.equal(called, true)
    assert.ok(db.calls.every(call => call.action === 'read'))
  }
})

test('survey deletion keeps response conflicts and cohort scope private', async () => {
  const db = database({ surveys: [{ id: 'survey', cohort_id: 'cohort', status: 'draft' }] })
  db.rpc = async () => ({ data: null, error: { code: '23514', message: 'This survey has responses and cannot be deleted' } })
  const stubs = {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
  }
  const request = new Request('https://example.org/api/admin/surveys/survey', { method: 'DELETE' })
  const ctx = { params: Promise.resolve({ id: 'survey' }) }
  const { DELETE } = loadTs('src/app/api/admin/surveys/[id]/route.ts', {
    ...stubs,
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'admin' } }), canAccessCohort: () => true },
  })
  const conflict = await DELETE(request, ctx)
  assert.equal(conflict.status, 409)
  assert.equal((await conflict.json()).error, 'This survey has responses and cannot be deleted')

  const { DELETE: unauthorizedDelete } = loadTs('src/app/api/admin/surveys/[id]/route.ts', {
    ...stubs,
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'admin' } }), canAccessCohort: () => false },
  })
  assert.equal((await unauthorizedDelete(request, ctx)).status, 404)
})

test('a member cannot answer an open survey after its cohort closes', async () => {
  const db = database({ surveys: [{ id: 'survey', cohort_id: 'cohort', status: 'open', questions: [] }],
    cohorts: [{ id: 'cohort', status: 'closed' }] })
  const { POST } = loadTs('src/app/api/survey-responses/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/supabase-server': { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) } }) },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/goals': { resolveActingMember: async () => ({ id: 'mentor', type: 'mentor', cohortId: 'cohort' }) },
    '@/lib/surveys': { coerceQuestions: () => [], validateAnswers: () => ({ ok: true, value: {} }) },
  })
  const result = await POST(new Request('https://example.org/api/survey-responses', {
    method: 'POST', body: JSON.stringify({ surveyId: 'survey', answers: {} }),
  }))
  assert.equal(result.status, 409)
  assert.equal(db.tables.survey_responses?.length ?? 0, 0)
})

test('an admin cannot create a draft survey after cohort closeout', async () => {
  const db = database({ cohorts: [{ id: 'cohort', status: 'closed' }] })
  const { POST } = loadTs('src/app/api/admin/surveys/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'admin' } }), canAccessCohort: () => true },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/validate': { cap: value => value, LIMITS: { name: 200 } },
    '@/lib/surveys': { isSurveyWave: () => true, validateQuestions: () => ({ ok: true, value: [] }) },
  })
  const result = await POST(new Request('https://example.org/api/admin/surveys', {
    method: 'POST', body: JSON.stringify({ cohortId: 'cohort', wave: 'mid_year', title: 'Feedback', questions: [] }),
  }))
  assert.equal(result.status, 409)
  assert.equal(db.tables.surveys?.length ?? 0, 0)
})
