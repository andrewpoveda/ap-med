/** Immutable released vocabulary. Add a new version instead of editing v1's meaning. */
export const ASCENSO_V1 = {
  version: 'ascenso-v1',
  applicationVersion: 'ascenso-application-v1',
  tagVocabularyVersion: 'ap-med-exact-tags-v1',
  tracks: ['ms_premed', 'resident_ms', 'attending_ms', 'attending_resident'],
  surveyWaves: ['mid_year', 'end_year'],
  milestones: {
    mentor: [{ key: 'orientation', label: 'Orientation' }, { key: 'mentor_training', label: 'Mentor training' }],
    mentee: [{ key: 'orientation', label: 'Orientation' }, { key: 'mentee_training', label: 'Mentee training' }],
  },
  matching: { identity: 0.40, specialty: 0.35, canHelpWith: 0.25 },
  sameTrackRequired: true,
  liveAssignmentsPerParticipation: 1,
} as const

/** Unknown versions fail closed; a new policy requires explicit implementation. */
export function readProgramDefinition(version: string) {
  if (version !== ASCENSO_V1.version) throw new Error('Unsupported program definition')
  return ASCENSO_V1
}
