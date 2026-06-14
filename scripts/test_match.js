const path = require('path')
const mentors = require(path.join(__dirname, '..', 'src', 'data', 'mentors.json'))

const WEIGHTS = {
  specialty: 0.40,
  identity: 0.35,
  canHelpWith: 0.25,
}

function scoreOverlap(menteePrefs, mentorTags) {
  if (!menteePrefs || menteePrefs.length === 0) return 1
  if (!mentorTags || mentorTags.length === 0) return 0
  const matches = menteePrefs.filter(p => mentorTags.includes(p)).length
  return matches / menteePrefs.length
}

function scoreMentor(mentor, mentee) {
  const mentorSpecialty = Array.isArray(mentor.specialty) ? mentor.specialty : [mentor.specialty]
  const mentorIdentity = mentor.identity || []
  const mentorCanHelp = mentor.openTo || mentor.can_help_with || []

  const specialtyScore = scoreOverlap(mentee.interests, mentorSpecialty)
  const identityScore = scoreOverlap(mentee.preferred_identity, mentorIdentity)
  const helpScore = scoreOverlap(mentee.help_with, mentorCanHelp)

  const raw =
    specialtyScore * WEIGHTS.specialty +
    identityScore * WEIGHTS.identity +
    helpScore * WEIGHTS.canHelpWith

  return Math.round(raw * 100)
}

// Sample mentee input — adjust as needed
const sampleMentee = {
  full_name: 'Andrew Poveda',
  email: 'andrew@example.com',
  school: 'Montclair State University',
  current_stage: 'pre-med',
  interests: ['Cardiology'],
  preferred_identity: ['Latino'],
  help_with: ['PS Review', 'Mock Interviews'],
}

const scored = mentors.map((m, i) => ({
  id: i + 1,
  name: m.name,
  matchPercent: scoreMentor(m, sampleMentee),
  raw: m,
}))
  .sort((a, b) => b.matchPercent - a.matchPercent)

console.log('Top matches for', sampleMentee.full_name)
console.log('-------------------------')
scored.slice(0, 10).forEach((s, idx) => {
  console.log(`#${idx + 1}: ${s.name} — ${s.matchPercent}%`)
})

console.log('\nTop 3 detailed:')
console.log(scored.slice(0, 3).map(s => ({ name: s.name, matchPercent: s.matchPercent, identity: s.raw.identity, specialty: s.raw.specialty, openTo: s.raw.openTo })))
