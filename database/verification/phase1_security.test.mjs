import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInThisContext } from 'node:vm'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// Execute the real TS helpers/routes, replacing only framework/provider edges.
// No provider credentials, network, generated JS files, or new dependencies.
function loadTs(relative, stubs = {}, cache = new Map()) {
  const filename = resolve(root, relative)
  if (cache.has(filename)) return cache.get(filename).exports
  const loaded = { exports: {} }
  cache.set(filename, loaded)
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const require = (name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name]
    assert.ok(name.startsWith('@/'), `Unexpected provider import: ${name}`)
    return loadTs(`src/${name.slice(2)}.ts`, stubs, cache)
  }
  runInThisContext(`(function(require,module,exports){${outputText}\n})`, { filename })(require, loaded, loaded.exports)
  return loaded.exports
}

const normalize = (email) => email.trim().toLowerCase()
function member(id, email, cohort_id = 'cohort', auth_user_id = null) {
  return { id, email, normalized_email: normalize(email), cohort_id, auth_user_id, full_name: id, created_at: id }
}

// Equality-only PostgREST test double. SQL behavior and column generation are
// separately checked in verify_phase1.sh against disposable PostgreSQL 17.
function database(seed = {}, options = {}) {
  const tables = structuredClone(seed)
  const calls = []
  let serial = 0
  return { tables, calls, from(table) {
    const filters = []
    let action = 'read', payload, single = false, sort
    tables[table] ??= []
    const query = {
      select() { return query },
      eq(key, value) { filters.push((r) => r[key] === value); return query },
      is(key, value) { filters.push((r) => r[key] === value); return query },
      not(key, operator, value) { assert.equal(operator, 'is'); filters.push((r) => r[key] !== value); return query },
      gte() { return query },
      order(key, { ascending }) { sort = { key, ascending }; return query },
      maybeSingle() { single = true; return query },
      single() { single = true; return query },
      update(value) { action = 'update'; payload = value; return query },
      insert(value) { action = 'insert'; payload = value; return query },
      then(onFulfilled, onRejected) {
        const execute = () => {
          calls.push({ table, action })
          if (options.failRead && action === 'read') return { data: null, error: { message: 'offline' } }
          if (action === 'update') options.beforeUpdate?.(tables, table)
          let rows = tables[table].filter((r) => filters.every((f) => f(r)))
          if (sort) rows.sort((a, b) => String(a[sort.key]).localeCompare(String(b[sort.key])) * (sort.ascending ? 1 : -1))
          if (action === 'insert') {
            const input = Array.isArray(payload) ? payload : [payload]
            if (table === 'cohort_applications' && input.some((n) => tables[table].some((r) =>
              r.cohort_id === n.cohort_id && r.role === n.role && normalize(r.email) === normalize(n.email)))) {
              return { data: null, error: { code: '23505', message: 'duplicate' } }
            }
            rows = input.map((r) => ({ id: `new-${++serial}`, ...r, ...(r.email ? { normalized_email: normalize(r.email) } : {}) }))
            tables[table].push(...rows)
          } else if (action === 'update') {
            for (const row of rows) Object.assign(row, payload)
          }
          if (single && rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'ambiguous' } }
          return { data: structuredClone(single ? rows[0] ?? null : rows), count: rows.length, error: null }
        }
        return Promise.resolve().then(execute).then(onFulfilled, onRejected)
      },
    }
    return query
  } }
}

const { linkMentorByEmail } = loadTs('src/lib/mentor-link.ts')
const { linkCohortMenteeByEmail, cohortMenteeExistsForEmail } = loadTs('src/lib/mentee-link.ts')
const { promoteApplicationToMember } = loadTs('src/lib/cohort-members.ts')
const paths = [['mentor', linkMentorByEmail], ['mentees', linkCohortMenteeByEmail]]

for (const [table, link] of paths) {
  for (const email of ['alex_smith@example.org', 'alex%smith@example.org', 'alex*smith@example.org', 'alex\\smith@example.org']) {
    test(`${table}: ${email} never claims a dot-address`, async () => {
      const db = database({ [table]: [member('victim', 'alex.smith@example.org')] })
      assert.equal((await link(db, 'attacker', email)).status, 'no-profile')
      assert.equal(db.tables[table][0].auth_user_id, null)
    })
  }
  test(`${table}: exact normalized address wins among wildcard-like alternatives`, async () => {
    const db = database({ [table]: [member('dot', 'alex.smith@example.org'), member('exact', ' AlEx_SmItH@Example.org '), member('percent', 'alex%smith@example.org')] })
    assert.equal((await link(db, 'owner', '\talex_smith@EXAMPLE.ORG\n')).status, 'linked')
    assert.deepEqual(db.tables[table].map((r) => r.auth_user_id), [null, 'owner', null])
    assert.equal((await link(db, 'owner', 'alex_smith@example.org')).status, 'linked')
    assert.equal((await link(db, 'other', 'alex_smith@example.org')).status, 'conflict')
  })
  test(`${table}: ambiguous exact identities and lookup errors fail closed`, async () => {
    const db = database({ [table]: [member('a', 'same@example.org'), member('b', ' SAME@example.org ')] })
    assert.equal((await link(db, 'owner', 'same@example.org')).status, 'error')
    assert.ok(db.tables[table].every((r) => r.auth_user_id === null))
    assert.equal((await link(database({}, { failRead: true }), 'owner', 'same@example.org')).status, 'error')
  })
  test(`${table}: concurrent ownership/email changes cannot be overwritten`, async () => {
    for (const replacement of [{ auth_user_id: 'other' }, { email: 'new@example.org', normalized_email: 'new@example.org' }]) {
      const db = database({ [table]: [member('a', 'same@example.org')] }, {
        beforeUpdate(tables) { Object.assign(tables[table][0], replacement) },
      })
      assert.equal((await link(db, 'owner', 'same@example.org')).status, 'conflict')
      assert.notEqual(db.tables[table][0].auth_user_id, 'owner')
    }
  })
}

test('general mentees cannot be claimed or counted as cohort identities', async () => {
  const db = database({ mentees: [member('general', 'same@example.org', null)] })
  assert.equal((await linkCohortMenteeByEmail(db, 'owner', 'same@example.org')).status, 'no-profile')
  assert.equal(await cohortMenteeExistsForEmail(db, 'same@example.org'), false)
})

test('cohort existence probe uses exact normalized equality', async () => {
  const db = database({ mentees: [member('dot', 'alex.smith@example.org')] })
  assert.equal(await cohortMenteeExistsForEmail(db, 'alex_smith@example.org'), false)
  assert.equal(await cohortMenteeExistsForEmail(db, ' ALEX.SMITH@example.org '), true)
})

for (const [role, table] of [['mentor', 'mentor'], ['mentee', 'mentees']]) {
  test(`${role} promotion claims only the exact address and respects other cohorts`, async () => {
    const db = database({ [table]: [member('dot', 'alex.smith@example.org', null), member('exact', ' ALEX_SMITH@example.org ', null)] })
    const application = { role, email: 'alex_smith@example.org', full_name: 'Alex Smith', cohort_id: 'new-cohort', answers: {} }
    assert.deepEqual(await promoteApplicationToMember(db, application), { status: 'claimed', memberId: 'exact' })
    assert.equal(db.tables[table][0].cohort_id, null)
    assert.equal(db.tables[table][1].cohort_id, 'new-cohort')
    assert.equal((await promoteApplicationToMember(db, { ...application, cohort_id: 'different' })).status, 'conflict')
  })
  test(`${role} promotion does not merge a percent address into another identity`, async () => {
    const db = database({ [table]: [member('dot', 'alex.smith@example.org', null)] })
    const result = await promoteApplicationToMember(db, { role, email: 'alex%smith@example.org', full_name: 'Alex', cohort_id: 'new-cohort', answers: {} })
    assert.equal(result.status, 'created')
    assert.equal(db.tables[table][0].cohort_id, null)
  })
  test(`${role} promotion refuses ambiguous cohort identities`, async () => {
    const db = database({ [table]: [member('a', 'same@example.org'), member('b', ' SAME@example.org ')] })
    const result = await promoteApplicationToMember(db, { role, email: 'same@example.org', cohort_id: 'cohort', answers: {} })
    assert.ok(['error', 'conflict'].includes(result.status))
    assert.ok(db.calls.every((c) => c.action === 'read'))
  })
}

const framework = { 'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } } }
const request = (body) => new Request('https://example.org/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

function legacyRoute(db, sent) {
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
  assert.equal((await legacyRoute(ambiguous, rejected).POST(request({ email: 'same@example.org' }))).status, 500)
  assert.deepEqual(rejected, [])
})

test('administrator identity keeps exact lowercased email semantics', async () => {
  const db = database({ admin_users: [{ email: 'alex.smith@example.org', role: 'cohort_admin', cohort_id: 'a' }] })
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

test('member resolution retains mentor precedence without claiming a second role', async () => {
  const db = database({ mentor: [member('mentor', 'same@example.org')], mentees: [member('mentee', 'same@example.org')] })
  const { resolveAccountForUser, signInDestination } = loadTs('src/lib/account-role.ts')
  assert.equal(await resolveAccountForUser(db, 'owner', 'same@example.org'), 'mentor')
  assert.equal(db.tables.mentees[0].auth_user_id, null)
  assert.equal(signInDestination('mentor'), '/dashboard')
  assert.equal(signInDestination('mentee'), '/ascenso/dashboard')
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
