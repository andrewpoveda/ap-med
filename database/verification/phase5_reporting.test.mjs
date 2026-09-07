import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs, database } from './test-support.mjs'

const stubs = { '@/lib/cohort-dashboard': { MILESTONE_CATALOG: { mentor: [], mentee: [] } } }
test('future bookings and partner logs do not prove individual activity', async () => {
  const db = database({
    mentor: [{ id: 'm', cohort_id: 'c', first_name: 'Mentor' }],
    mentees: [{ id: 'n', cohort_id: 'c', full_name: 'Mentee' }],
    cohort_matches: [{ id: 'pair', cohort_id: 'c', mentor_id: 'm', mentee_id: 'n', status: 'active' }],
    meeting_logs: [
      { cohort_id: 'c', match_id: 'pair', met_at: '2026-09-01', created_at: '2026-09-01T10:00:00Z', logged_by_type: 'mentor', logged_by_id: 'm' },
      { cohort_id: 'c', match_id: 'pair', met_at: '2027-01-01', created_at: '2026-09-01T10:00:00Z', logged_by_type: 'mentee', logged_by_id: 'n' },
      { cohort_id: 'other', match_id: 'pair', met_at: '2026-09-01', logged_by_type: 'mentee', logged_by_id: 'n' },
    ],
    sessions: [
      { mentor_id: 'm', mentee_id: 'n', scheduled_at: '2026-09-10T10:00:00Z', status: 'scheduled' },
      { mentor_id: 'm', mentee_id: 'n', scheduled_at: '2026-09-02T10:00:00Z', status: 'completed' },
      { mentor_id: 'm', mentee_id: 'other', scheduled_at: '2026-09-10T10:00:00Z', status: 'scheduled' },
    ],
  })
  const { getCohortAnalytics } = loadTs('src/lib/cohort-analytics.ts', stubs)
  const result = await getCohortAnalytics(db, { id: 'c', created_at: '2026-01-01', config: {} }, new Date('2026-09-07T12:00:00Z'))
  assert.equal(result.meetingTotals.total, 1)
  assert.deepEqual(result.sessionCounts, { upcoming: 1, completed: 1 })
  assert.deepEqual(result.inactiveMembers.map(m => m.memberId), ['n'])
})

test('match export preserves approval separately from unknown activation and stable IDs', async () => {
  const db = database({ cohort_matches: [{ id: 'match', cohort_id: 'c', mentor_id: 'm', mentee_id: 'n', approved_at: '2026-01-01T12:00:00Z', activated_at: null, status: 'ended', ended_at: '2026-02-01T12:00:00Z', end_reason: 'Requested' }] })
  const { buildCohortExport } = loadTs('src/lib/cohort-export.ts', stubs)
  const result = await buildCohortExport(db, 'c', 'matches')
  const row = Object.fromEntries(result.headers.map((h, i) => [h, result.rows[0][i]]))
  assert.equal(row['Match ID'], 'match'); assert.equal(row['Approved (UTC)'], '2026-01-01 12:00')
  assert.equal(row['Activated (UTC; blank if unknown)'], ''); assert.equal(row['End reason'], 'Requested')
})

test('survey export is named and scoped, with questions retained to interpret answers', async () => {
  const db = database({ surveys: [{ id: 's', cohort_id: 'c', title: 'Feedback', wave: 'early', questions: [{ id: 'useful' }] }],
    survey_responses: [{ id: 'r', cohort_id: 'c', survey_id: 's', member_id: 'm', answers: { useful: 4 } }, { id: 'other', cohort_id: 'other', survey_id: 's', answers: {} }] })
  const { buildCohortExport } = loadTs('src/lib/cohort-export.ts', stubs)
  const result = await buildCohortExport(db, 'c', 'surveys')
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0][0], 'r')
  assert.equal(result.rows[0][6], '[{"id":"useful"}]'); assert.equal(result.rows[0][7], '{"useful":4}')
})
