import type { Mentor } from '@/types/mentor'

export const WEIGHTS = {
  identity: 0.40,
  specialty: 0.35,
  canHelpWith: 0.25,
}

/**
 * Score overlap between mentee preferences and mentor tags.
 * Returns 0–1. If mentee has no preferences, returns 1 (no preference = full match).
 */
export function scoreOverlap(menteePrefs: string[], mentorTags: string[]): number {
  if (!menteePrefs || menteePrefs.length === 0) return 1
  if (!mentorTags || mentorTags.length === 0) return 0
  const matches = menteePrefs.filter(p => mentorTags.includes(p)).length
  return matches / menteePrefs.length
}

type MenteeScoreInput = {
  interests?: string[]
  identity?: string[]
  help_with?: string[]
}

/**
 * Weighted 0–100 match score between a mentor row and a mentee's preferences.
 * Kept in a shared module so both /api/match and /api/notify compute it
 * server-side from the trusted DB row — never from a client-supplied value.
 */
export function scoreMentor(mentor: Mentor, mentee: MenteeScoreInput): number {
  const specialtyScore = scoreOverlap(mentee.interests ?? [], Array.isArray(mentor.specialty) ? mentor.specialty : [])
  const identityScore = scoreOverlap(mentee.identity ?? [], Array.isArray(mentor.identity) ? mentor.identity : [])
  const helpScore = scoreOverlap(mentee.help_with ?? [], Array.isArray(mentor.can_help_with) ? mentor.can_help_with : [])

  const raw =
    specialtyScore * WEIGHTS.specialty +
    identityScore * WEIGHTS.identity +
    helpScore * WEIGHTS.canHelpWith

  return Math.round(raw * 100)
}
