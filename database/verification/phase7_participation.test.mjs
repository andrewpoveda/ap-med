import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs, database } from './test-support.mjs'

function owned() {
  return database({ people: [{ id: 'p', auth_user_id: 'owner' }, { id: 'other', auth_user_id: 'victim' }],
    mentor: [
      { id: 'general', person_id: 'p', cohort_id: null, first_name: 'Owner', last_name: '', membership_status: 'active' },
      { id: 'cohort-mentor', person_id: 'p', cohort_id: 'one', first_name: 'Owner', last_name: '', membership_status: 'active' },
      { id: 'victim', person_id: 'other', cohort_id: 'one', membership_status: 'active' },
    ], mentees: [
      { id: 'cohort-mentee', person_id: 'p', cohort_id: 'two', full_name: 'Owner', membership_status: 'active' },
      { id: 'inactive', person_id: 'p', cohort_id: 'three', membership_status: 'offboarded' },
      { id: 'general-mentee', person_id: null, cohort_id: null },
    ] })
}
const cookies = selected => ({ 'next/headers': { cookies: async () => ({ get: () => selected ? { value: selected } : undefined }) } })

test('selected participation is owned and active, with mentor-first default and no general mentee account', async () => {
  const db = owned()
  for (const [selected, expected] of [[undefined, 'general'], ['mentor:cohort-mentor', 'cohort-mentor'], ['mentee:cohort-mentee', 'cohort-mentee'], ['mentor:victim', null], ['mentee:inactive', null], ['mentee:general-mentee', null]]) {
    const { selectedParticipation } = loadTs('src/lib/participation.ts', cookies(selected))
    assert.equal((await selectedParticipation(db, 'owner'))?.id ?? null, expected)
  }
})

test('a selected mentee role does not fall through to another program mentor role', async () => {
  const db = owned()
  const stubs = cookies('mentee:cohort-mentee')
  const { getMentorForUser } = loadTs('src/lib/mentor-link.ts', stubs)
  const { getCohortMenteeForUser } = loadTs('src/lib/mentee-link.ts', stubs)
  const { resolveActingMember } = loadTs('src/lib/goals.ts', stubs)
  assert.equal(await getMentorForUser(db, 'owner'), null)
  assert.equal((await getCohortMenteeForUser(db, 'owner')).id, 'cohort-mentee')
  assert.deepEqual(await resolveActingMember(db, 'owner'), { type: 'mentee', id: 'cohort-mentee', cohortId: 'two' })
})

test('removed participation fails on the next lookup and cannot act on another cohort match', async () => {
  const db = owned()
  const { resolveActingMember, checkPartyToMatch } = loadTs('src/lib/goals.ts', cookies('mentor:cohort-mentor'))
  const actor = await resolveActingMember(db, 'owner')
  db.tables.cohort_matches = [{ id: 'target', cohort_id: 'two', mentor_id: actor.id, mentee_id: 'other', status: 'active' }]
  assert.equal(await checkPartyToMatch(db, actor, 'target'), 'not_party')
  db.tables.mentor[1].membership_status = 'withdrawn'
  assert.equal(await resolveActingMember(db, 'owner'), null)
})

test('admin retry remains scoped when one person has digest sources in multiple cohorts', async () => {
  const db = database({ cohort_delivery: [
    { id: 'one', source_id: 'person', cohort_id: 'one', state: 'pending', message: { subject: 'Own' } },
    { id: 'two', source_id: 'person', cohort_id: 'two', state: 'pending', message: { subject: 'Other' } },
  ] })
  db.rpc = async (name, args) => name === 'ascenso_claim_delivery' ? { data: { message: args.p_message, attempt_key: args.p_id, claim_token: 'token' } } : { data: true }
  const sent = []
  const { sendCohortDeliveries } = loadTs('src/lib/cohort-delivery.ts', { 'server-only': {}, '@/lib/email': { sendCohortOperationalEmail: async message => { sent.push(message.subject); return 'provider' } } })
  assert.equal(await sendCohortDeliveries(db, 'person', 'one'), true)
  assert.deepEqual(sent, ['Own'])
})

test('participation chooser rejects forged or removed membership before setting a cookie', async () => {
  const db = owned()
  const { POST } = loadTs('src/app/api/participation/route.ts', {
    'next/server': { NextResponse: { json: (b, o) => Response.json(b, o) } },
    '@/lib/supabase-server': { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } }) },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
  })
  for (const participation of ['mentor:victim', 'mentee:inactive', 'mentee:general-mentee']) {
    const response = await POST(new Request('https://example.org', { method: 'POST', body: JSON.stringify({ participation }) }))
    assert.equal(response.status, 404); assert.equal(response.headers.get('set-cookie'), null)
  }
})

test('Calendar callback refuses a participation switch before exchanging or storing credentials', async () => {
  const jar = { google_oauth_state: 'state', google_oauth_participation: 'started-as' }
  const { GET } = loadTs('src/app/api/google/callback/route.ts', {
    'next/server': { NextResponse: { redirect: url => Response.redirect(url) } },
    'next/headers': { cookies: async () => ({ get: key => ({ value: jar[key] }), set: (key, value) => { jar[key] = value } }) },
    '@/lib/supabase-server': { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } }) },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({}) },
    '@/lib/mentor-link': { getMentorForUser: async () => ({ id: 'switched-to' }) },
    '@/lib/google': { exchangeCodeForTokens: () => assert.fail('No provider exchange after context switch') },
    '@/lib/crypto': {}, '@/lib/site': {},
  })
  const response = await GET(new Request('https://example.org/api/google/callback?code=code&state=state'))
  assert.equal(response.headers.get('location'), 'https://example.org/dashboard?calendar=no_profile')
  assert.equal(jar.google_oauth_state, ''); assert.equal(jar.google_oauth_participation, '')
})

test('digest content and cooldown remain separate across programs sharing one person', async () => {
  const now = new Date('2026-09-08T12:00:00Z')
  const db = database({ cohorts: [{ id: 'one', name: 'Program One', status: 'active', config: {} }, { id: 'two', name: 'Program Two', status: 'active', config: {} }],
    mentor: [
      { id: 'm1', person_id: 'owner', cohort_id: 'one', first_name: 'Owner', email: 'owner@example.org', membership_status: 'active' },
      { id: 'm2', person_id: 'peer2', cohort_id: 'two', first_name: 'PeerTwo', email: 'peer2@example.org', membership_status: 'active' },
    ], mentees: [
      { id: 'n1', person_id: 'peer1', cohort_id: 'one', full_name: 'PeerOne', email: 'peer1@example.org', membership_status: 'active' },
      { id: 'n2', person_id: 'owner', cohort_id: 'two', full_name: 'Owner', email: 'owner@example.org', membership_status: 'active' },
    ], cohort_matches: [
      { id: 'pair1', cohort_id: 'one', mentor_id: 'm1', mentee_id: 'n1', status: 'active' },
      { id: 'pair2', cohort_id: 'two', mentor_id: 'm2', mentee_id: 'n2', status: 'active' },
    ], email_log: [{ cohort_id: 'one', recipient_email: 'owner@example.org', kind: 'digest', sent_at: now.toISOString() }],
  })
  const { computeDigestRecipients, applyDigestCooldown } = loadTs('src/lib/digest.ts', { '@/lib/cohort-dashboard': { MILESTONE_CATALOG: { mentor: [], mentee: [] } } })
  const recipients = (await computeDigestRecipients(db, now)).filter(r => r.personId === 'owner')
  assert.equal(recipients.length, 2)
  assert.ok(recipients.find(r => r.cohortId === 'one').items.every(i => !i.text.includes('PeerTwo')))
  assert.ok(recipients.find(r => r.cohortId === 'two').items.every(i => !i.text.includes('PeerOne')))
  const filtered = await applyDigestCooldown(db, recipients, now, 7)
  assert.deepEqual(filtered.toSend.map(r => r.cohortId), ['two'])
})
