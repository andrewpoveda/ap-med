import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs, database } from './test-support.mjs'

const normalize = (email) => email.trim().toLowerCase()
function member(id, email, cohort_id = 'cohort', auth_user_id = null) {
  return { person_id: `person-${id}`, membership_status: 'active', id, email, normalized_email: normalize(email), cohort_id, auth_user_id, full_name: id, created_at: id }
}

const { claimPerson } = loadTs('src/lib/participation.ts')
const { cohortMenteeExistsForEmail } = loadTs('src/lib/mentee-link.ts')

// Ownership/concurrency and enrollment integrity now live in the transactional
// person RPC and are exercised against real PostgreSQL by verify_phase7.sh.
for (const email of ['alex_smith@example.org', 'alex%smith@example.org', 'alex*smith@example.org', 'alex\\\\smith@example.org']) {
  test(`identity RPC retains literal exact address: ${email}`, async () => {
    const db = { rpc: async (name, args) => {
      assert.equal(name, 'ascenso_claim_person'); assert.equal(args.p_user, 'owner'); assert.equal(args.p_email, email)
      return { data: null }
    } }
    assert.equal(await claimPerson(db, 'owner', email), 'none')
  })
}
test('identity claim normalizes exactly and fails closed on ownership or database errors', async () => {
  for (const [response, expected] of [[{ data: 'person' }, 'claimed'], [{ error: { code: '42501' } }, 'conflict'], [{ error: { code: '23505' } }, 'conflict'], [{ error: { code: 'offline' } }, 'error']]) {
    const db = { rpc: async (_name, args) => { assert.equal(args.p_email, 'alex@example.org'); return response } }
    assert.equal(await claimPerson(db, 'owner', ' Alex@example.org '), expected)
  }
})
test('cohort existence probe uses exact normalized equality and excludes general mentees', async () => {
  const db = database({ mentees: [member('dot', 'alex.smith@example.org'), member('general', 'general@example.org', null)] })
  assert.equal(await cohortMenteeExistsForEmail(db, 'alex_smith@example.org'), false)
  assert.equal(await cohortMenteeExistsForEmail(db, ' ALEX.SMITH@example.org '), true)
  assert.equal(await cohortMenteeExistsForEmail(db, 'general@example.org'), false)
})

const framework = { 'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } } }
const request = (body) => new Request('https://example.org/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

function legacyRoute(db, sent) {
  db.rpc = async (name, args) => {
    if (name === 'reserve_email_budget') {
      assert.equal(args.p_slots, 1)
      return { data: '11111111-1111-4111-8111-111111111111' }
    }
    assert.equal(name, 'release_email_budget_slots')
    assert.equal(args.p_slots, 1)
    return { data: 0 }
  }
  return loadTs('src/app/api/ascenso/signin-link/route.ts', {
    ...framework,
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/turnstile': { verifyTurnstileToken: async () => true },
    '@/lib/ascenso-auth': { createMenteeSignInLink: async (_db, email) => { sent.push({ credentialFor: email }); return 'https://example.org/auth' } },
    '@/lib/email': { sendAscensoSignInLink: async (args) => { sent.push(args) } },
    '@/lib/cohort-dashboard': { getCohortName: async () => 'Program' },
    '@/lib/site': { ascensoAbsoluteUrl: () => 'https://example.org' },
  })
}

test('legacy link: wildcard inputs cannot issue credentials or mail for another address', async () => {
  for (const email of ['alex_smith@example.org', 'alex%smith@example.org', 'alex*smith@example.org']) {
    const sent = [], db = database({ mentees: [member('victim', 'alex.smith@example.org')] })
    const response = await legacyRoute(db, sent).POST(request({ email }))
    assert.equal(response.status, 200)
    assert.equal(sent.length, 0)
    assert.ok(!(await response.text()).includes('victim'))
  }
})

test('legacy link: exact normalized lookup mails stored recipient; ambiguity sends nothing', async () => {
  const sent = [], db = database({ mentees: [member('a', 'AlEx_Smith@example.org')] })
  assert.equal((await legacyRoute(db, sent).POST(request({ email: ' ALEX_SMITH@example.org ' }))).status, 200)
  assert.equal(sent[1].recipientEmail, 'AlEx_Smith@example.org')
  const ambiguous = database({ mentees: [member('a', 'same@example.org'), member('b', ' SAME@example.org ')] })
  const rejected = []
  assert.equal((await legacyRoute(ambiguous, rejected).POST(request({ email: 'same@example.org' }))).status, 200)
  assert.deepEqual(rejected, [])
})

test('administrator identity keeps exact lowercased email semantics', async () => {
  const db = database({ admin_users: [{ id: 'admin', email: 'alex.smith@example.org', role: 'cohort_admin', cohort_id: 'a' }], admin_cohort_grants: [{ admin_id: 'admin', cohort_id: 'a', revoked_at: null }] })
  const { getAdminUserByEmail, canAccessCohort } = loadTs('src/lib/admin.ts', {
    react: { cache: (fn) => fn }, 'next/navigation': {},
    '@/lib/supabase-server': {}, '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
  })
  assert.equal(await getAdminUserByEmail('alex_smith@example.org'), null)
  const admin = await getAdminUserByEmail(' ALEX.SMITH@example.org ')
  assert.equal(canAccessCohort(admin, 'a'), true)
  assert.equal(canAccessCohort(admin, 'b'), false)
})

const cohortId = '11111111-1111-4111-8111-111111111111'
const tags = loadTs('src/data/tags.ts')
const { SPECIALTIES } = loadTs('src/data/specialties.ts')
function applicationBody(role) {
  return { cohort_id: cohortId, role, track: 'ms_premed', full_name: 'New answers', email: 'victim@example.org',
    institution: 'School', current_position: 'Student', current_location: 'City', motivation: 'Motivation',
    identity: [tags.IDENTITY_OPTIONS[0]], specialty: [SPECIALTIES[0]], preferred_specialty: [SPECIALTIES[0]],
    can_help_with: [tags.ASCENSO_HELP_WITH_OPTIONS[0]], help_with: [tags.ASCENSO_HELP_WITH_OPTIONS[0]],
    mentee_capacity: tags.ASCENSO_MENTEE_CAPACITY_OPTIONS[0], previous_mentor: tags.ASCENSO_PREVIOUS_MENTOR_OPTIONS[0],
    goals_milestones: 'Goals', can_commit: true, agrees_surveys: true, agrees_conduct: true, agrees_participation: true,
  }
}
function intakeRoute(db, captcha = true) {
  return loadTs('src/app/api/cohort-applications/route.ts', { ...framework,
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/turnstile': { verifyTurnstileToken: async () => captcha },
    '@/lib/site': { getAscensoCohortId: () => cohortId },
  })
}
for (const role of ['mentor', 'mentee']) {
  for (const status of ['submitted', 'approved', 'rejected', 'waitlisted']) {
    test(`public ${role} duplicate cannot read/overwrite ${status} answers or history`, async () => {
      const original = { id: 'private-id', email: 'victim@example.org', role, cohort_id: cohortId, status,
        full_name: 'Private original', answers: { motivation: 'PRIVATE ANSWERS' }, previous_submission: { answers: 'PRIVATE HISTORY' } }
      const db = database({ cohorts: [{ id: cohortId, status: 'applications_open' }], cohort_applications: [original] })
      const route = intakeRoute(db)
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await route.POST(request(applicationBody(role)))
        assert.equal(response.status, 409)
        const body = await response.json()
        assert.equal(body.code, 'application_exists')
        assert.match(body.error, /program administrator/)
        assert.doesNotMatch(JSON.stringify(body), /PRIVATE|private-id|Private original/)
      }
      assert.deepEqual(db.tables.cohort_applications, [original])
      assert.ok(db.calls.filter((c) => c.table === 'cohort_applications').every((c) => c.action === 'insert'))
    })
  }
  test(`public ${role} new application still creates a normalized, validated row`, async () => {
    const db = database({ cohorts: [{ id: cohortId, status: 'applications_open' }] })
    const response = await intakeRoute(db).POST(request({ ...applicationBody(role), email: ' VICTIM@example.org ' }))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { success: true })
    assert.equal(db.tables.cohort_applications[0].email, 'victim@example.org')
    assert.equal(db.tables.cohort_applications[0].cohort_id, cohortId)
  })
}

test('intake retains Turnstile, validation, destination and closed-cohort gates', async () => {
  const db = database({ cohorts: [{ id: cohortId, status: 'closed' }] })
  assert.equal((await intakeRoute(db, false).POST(request(applicationBody('mentee')))).status, 400)
  assert.equal((await intakeRoute(db).POST(request({ ...applicationBody('mentee'), agrees_conduct: false }))).status, 400)
  assert.equal((await intakeRoute(db).POST(request({ ...applicationBody('mentee'), cohort_id: 'other' }))).status, 404)
  assert.equal((await intakeRoute(db).POST(request(applicationBody('mentee')))).status, 403)
  assert.ok(db.calls.every((c) => c.action === 'read'))
})

test('member resolution retains mentor-first default with explicit role selection', async () => {
  const { chooseParticipation } = loadTs('src/lib/participation.ts')
  const available = [{ type: 'mentor', id: 'm', cohortId: 'c' }, { type: 'mentee', id: 'n', cohortId: 'c2' }]
  assert.equal(chooseParticipation(available)?.type, 'mentor')
  assert.equal(chooseParticipation(available, 'mentee:n')?.type, 'mentee')
  assert.equal(chooseParticipation(available, 'mentee:other'), null)
})

test('public mentor intake preserves exact duplicate success and does not update private profiles', async (t) => {
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-key' })) {
    const previous = process.env[key]
    process.env[key] = value
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous })
  }
  const db = database({ mentor: [member('dot', 'alex.smith@example.org', null)] })
  const route = loadTs('src/app/api/mentor/route.ts', { ...framework,
    '@supabase/supabase-js': { createClient: () => db },
    '@/lib/turnstile': { verifyTurnstileToken: async () => true },
  })
  const options = loadTs('src/data/mentor-onboarding.ts')
  const body = { first_name: 'Alex', last_name: 'Smith', current_role: 'Student', institution: 'School',
    bio: 'A sufficiently long mentor biography.', current_stage: options.MENTOR_STAGE_OPTIONS[0],
    can_help_with: [tags.HELP_WITH_OPTIONS[0]], mentee_capacity: options.MENTOR_CAPACITY_OPTIONS[0], directory_consent: true }
  assert.equal((await route.POST(request({ ...body, email: ' ALEX.SMITH@example.org ' }))).status, 200)
  assert.equal(db.tables.mentor.length, 1)
  assert.equal((await route.POST(request({ ...body, email: 'alex_smith@example.org' }))).status, 200)
  assert.equal(db.tables.mentor.length, 2)
  assert.equal(db.tables.mentor[0].email, 'alex.smith@example.org')
  assert.ok(db.calls.every((c) => c.action !== 'update'))
})
