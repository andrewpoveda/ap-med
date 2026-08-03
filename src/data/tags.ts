// Canonical identity + mentorship-need vocabularies — the SINGLE source of truth
// shared by EVERY form that feeds the matcher: mentor onboarding, mentee
// onboarding, and the Ascenso cohort application. Same rationale as
// src/data/specialties.ts: scoreMentor (src/lib/match.ts) computes overlap by
// exact string equality, so a form that emits its own near-miss wording ("LGBTQ"
// vs "LGBTQ+") silently scores 0 on that weight.
//
// The two onboarding forms already carried byte-identical private copies of
// these lists; extracting them is what lets the Ascenso form join the same
// vocabulary instead of starting a third copy that can drift.

// The member's OWN background. Drives the identity weight (0.40 — the heaviest).
export const IDENTITY_OPTIONS = [
  'First-generation',
  'Latino / Hispanic',
  'Black / African American',
  'Asian / Pacific Islander',
  'Native American',
  'Low-income background',
  'LGBTQ+',
  'International / IMG',
  'Non-traditional student',
  'Prefer not to say',
]

// What a mentee needs help with / what a mentor can help with. Drives the
// canHelpWith weight (0.25).
//
// GENERAL PLATFORM ONLY. Every approved mentor row and every general mentee row
// already stores these exact strings, so this list can't be reworded without a
// data migration — a renamed option silently stops matching the rows that
// carry the old wording. Ascenso uses its own, wider vocabulary below.
export const HELP_WITH_OPTIONS = [
  'General guidance',
  'Personal statement review',
  'Application advice',
  'Mock interviews',
  'MCAT advice',
  'Research guidance',
  'Clinical / shadowing advice',
  'Specialty exploration',
  'Identity mentorship',
  'Residency application',
]

// Ascenso's support-needs vocabulary (LMSA-NE program board). Used by BOTH sides
// of the cohort application — a mentor picks what they can help with, a mentee
// picks what they want help with — which is what makes the matcher's 0.25
// canHelpWith weight actually differentiate candidate pairs. If only one side
// answered, scoreOverlap would return a constant 1.0 for every pair.
//
// Deliberately wider than HELP_WITH_OPTIONS above: the general platform is
// premed-facing, while Ascenso runs four tracks up to attending→resident, so it
// needs the later-career items (away rotations, fellowship planning,
// transitioning to independent practice) the general list has no words for.
export const ASCENSO_HELP_WITH_OPTIONS = [
  'Preparing for medical school',
  'Medical school application strategy',
  'Personal statement development',
  'MCAT preparation',
  'Navigating medical school',
  'Study strategies',
  'Clinical rotations',
  'Research opportunities',
  'Finding research mentorship',
  'Leadership development',
  'Specialty exploration',
  'Residency application strategy',
  'Away rotations',
  'Interview preparation',
  'Professional networking',
  'Building confidence',
  'Work-life balance and wellness',
  'Navigating medicine as a first-generation student',
  'Navigating medicine as an international medical graduate',
  'Navigating medicine as a member of an underrepresented community',
  'Fellowship or subspecialty planning',
  'Transitioning to independent practice',
]

// Selectable alongside the list above, with a free-text companion field. The
// free text is stored for the board to read but is NEVER fed to the matcher as
// a tag: overlap is scored by exact string equality, so one person's typed
// phrasing would never match another's. Same treatment as the "Other" specialty
// on the general mentee form.
export const HELP_WITH_OTHER = 'Other'

// ---------------------------------------------------------------------------
// Ascenso application single-selects (LMSA-NE board additions, 2026–27 cycle).
//
// Unlike everything above, these are NOT matcher vocabularies — nothing scores
// them. They live here for the other reason this file exists: the apply form and
// the intake route must allowlist against the same list, and a third private
// copy is what lets an option silently drift out of the permitted set and get
// dropped at insert.
// ---------------------------------------------------------------------------

// Mentee: prior mentorship experience. "Prefer not to answer" is a real choice,
// which is what makes asking for an answer safe to require.
export const ASCENSO_PREVIOUS_MENTOR_OPTIONS = [
  'Yes, and it was a positive experience',
  'Yes, but the relationship was limited or inconsistent',
  'No, this would be my first formal mentorship experience',
  'Prefer not to answer',
]

// Mentor: how many mentees they'd take for the program year.
//
// COLLECTION ONLY — deliberately. Nothing reads this to size a mentor's load:
// the matcher (src/lib/match.ts) and the admin matching surface still assume one
// active mentee per mentor, and whether 2+ is workable is an open program
// question the board hasn't settled. This is an answer the board reads while
// deciding that, not a capacity the system acts on. Wiring it into matching or
// the cohort dashboard needs that decision first.
export const ASCENSO_MENTEE_CAPACITY_OPTIONS = [
  'One',
  'Possibly two, depending on need',
  'Two',
]
