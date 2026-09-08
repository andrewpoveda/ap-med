import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './test-support.mjs'

test('program sender labels cannot change the verified address or inject headers', () => {
  const { programEmailFrom } = loadTs('src/lib/program-brand.ts')
  assert.equal(programEmailFrom('Program'), '"Program via AP MED" <mentors@ap-med.org>')
  const value = programEmailFrom('Unsafe\r\n" <other@example.org>')
  assert.ok(!value.includes('\n') && !value.includes('\r'))
  assert.equal((value.match(/</g) ?? []).length, 1)
  assert.ok(value.endsWith('<mentors@ap-med.org>'))
})

test('released policy preserves exact track, wave and deterministic score semantics', () => {
  const { ASCENSO_V1, readProgramDefinition } = loadTs('src/lib/program-definition.ts')
  assert.equal(readProgramDefinition('ascenso-v1'), ASCENSO_V1)
  assert.throws(() => readProgramDefinition('unreleased'))
  assert.deepEqual(ASCENSO_V1.tracks, ['ms_premed', 'resident_ms', 'attending_ms', 'attending_resident'])
  assert.deepEqual(ASCENSO_V1.surveyWaves, ['mid_year', 'end_year'])
  const { scoreMentor } = loadTs('src/lib/match.ts')
  const preferences = { identity: ['I'], interests: ['S'], help_with: ['H'] }
  assert.equal(scoreMentor({ identity: ['I'], specialty: [], can_help_with: [] }, preferences), 40)
  assert.equal(scoreMentor({ identity: [], specialty: ['S'], can_help_with: [] }, preferences), 35)
  assert.equal(scoreMentor({ identity: [], specialty: [], can_help_with: ['H'] }, preferences), 25)
})
