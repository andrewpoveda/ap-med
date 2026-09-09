import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs, database } from './test-support.mjs'

test('pilot funnel preserves unknown access and distinguishes repeated pair dates from duplicated logs', async () => {
  const db = database({
    cohort_applications: [{ id: 'a', cohort_id: 'c', role: 'mentee', member_id: 'me', status: 'approved', created_at: '2026-01-01', reviewed_at: '2026-01-02' }],
    cohort_matches: [{ id: 'm', cohort_id: 'c', mentee_id: 'me', mentor_id: 'mentor', status: 'proposed', approved_at: null, activated_at: null }],
    meeting_logs: [{ id: '1', cohort_id: 'c', match_id: 'm', met_at: '2026-02-01' }, { id: '2', cohort_id: 'c', match_id: 'm', met_at: '2026-02-01' }, { id: '3', cohort_id: 'c', match_id: 'm', met_at: '2099-01-01' }],
    goals: [{ id: 'g', cohort_id: 'c', match_id: 'm', status: 'done' }],
    survey_responses: [{ id: 's', cohort_id: 'other', member_type: 'mentee', member_id: 'me' }],
  })
  const { buildPilotFunnel } = loadTs('src/lib/pilot-funnel.ts')
  const result = await buildPilotFunnel(db, 'c', new Date('2026-03-01'))
  assert.equal(result.error, null)
  assert.deepEqual(result.rows[0].slice(6), ['', '', '', '2026-02-01', 1, 'no', 1, 1, 0])
  db.tables.cohort_first_access.push({ cohort_id: 'c', member_type: 'mentee', member_id: 'me', first_seen_at: '2026-02-02' })
  db.tables.meeting_logs.push({ id: '4', cohort_id: 'c', match_id: 'm', met_at: '2026-02-03' })
  const next = await buildPilotFunnel(db, 'c', new Date('2026-03-01'))
  assert.equal(next.rows[0][6], '2026-02-02')
  assert.equal(next.rows[0][11], 'yes')
})
