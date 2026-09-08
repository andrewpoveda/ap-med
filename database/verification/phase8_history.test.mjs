import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs, database } from './test-support.mjs'

class NextResponse extends Response {
  static json(body, options) { return Response.json(body, options) }
}

test('export records the scoped request before reading sensitive rows and fails closed on audit failure', async () => {
  for (const fails of [false, true]) {
    const db = database({ cohorts: [{ id: 'c', name: 'Program', definition_version: 'ascenso-v1' }] })
    const sequence = []
    db.rpc = async (name, args) => {
      assert.equal(name, 'ascenso_record_export')
      assert.deepEqual(args, { p_cohort: 'c', p_actor: 'a', p_table: 'members' })
      sequence.push('audit')
      return { error: fails ? { message: 'Unavailable' } : null }
    }
    const { GET } = loadTs('src/app/api/admin/cohorts/[id]/export/route.ts', {
      'next/server': { NextResponse },
      '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'a' } }), canAccessCohort: () => true },
      '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
      '@/lib/cohort-export': { isExportTable: () => true, slugify: () => 'program', buildCohortExport: async () => {
        sequence.push('export'); return { headers: ['Name'], rows: [['Member']] }
      } },
    })
    const result = await GET(new Request('https://example.org?table=members'), { params: Promise.resolve({ id: 'c' }) })
    assert.equal(result.status, fails ? 500 : 200)
    assert.deepEqual(sequence, fails ? ['audit'] : ['audit', 'export'])
    if (!fails) {
      const csv = await result.text()
      assert.ok(csv.includes('Program definition'))
      assert.ok(csv.includes('ascenso-v1'))
    }
  }
})

test('selection removal uses the authenticated actor transaction and preserves active history on rejection', async () => {
  const db = database({ cohort_matches: [{ id: 'm', cohort_id: 'c', status: 'active' }] })
  db.rpc = async (name, args) => {
    assert.equal(name, 'ascenso_selection_action')
    assert.deepEqual(args, { p_id: 'm', p_actor: 'a', p_action: 'remove' })
    return { error: { code: '23514' } }
  }
  const { DELETE } = loadTs('src/app/api/admin/cohort-matches/[id]/route.ts', {
    'next/server': { NextResponse },
    '@/lib/admin': { resolveAdminSession: async () => ({ status: 'admin', adminUser: { id: 'a' } }), canAccessCohort: () => true },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/cohort-delivery': {}, '@/lib/test-mode': {},
  })
  assert.equal((await DELETE(new Request('https://example.org'), { params: Promise.resolve({ id: 'm' }) })).status, 409)
  assert.equal(db.tables.cohort_matches.length, 1)
})
