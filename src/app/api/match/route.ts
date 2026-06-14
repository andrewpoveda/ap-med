import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyMentorOfMatch } from '@/lib/email'
import type { ScoredMentor } from '@/types/mentor'

export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase server environment variables')
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey)
}

type MenteeInput = {
  full_name: string
  email: string
  school: string
  current_stage: string
  interests: string[]
  preferred_identity: string[]
  help_with: string[]
  notes?: string
  linkedin_url?: string
}

type Mentor = {
  id: string
  first_name: string
  last_name: string
  credentials: string
  current_role: string
  institution: string
  bio: string
  identity: string[]
  specialty: string[]
  can_help_with: string[]
  current_stage: string
  linkedin_url: string
  episode_url: string
  scheduling_url: string
  contact_method: string[]
  mentee_capacity: number
  email: string
}

const WEIGHTS = {
  specialty: 0.40,
  identity: 0.35,
  canHelpWith: 0.25,
}

/**
 * Score overlap between mentee preferences and mentor tags.
 * Returns 0–1. If mentee has no preferences, returns 1 (no preference = full match).
 */
function scoreOverlap(menteePrefs: string[], mentorTags: string[]): number {
  if (!menteePrefs || menteePrefs.length === 0) return 1
  if (!mentorTags || mentorTags.length === 0) return 0
  const matches = menteePrefs.filter(p => mentorTags.includes(p)).length
  return matches / menteePrefs.length
}

function scoreMentor(mentor: Mentor, mentee: MenteeInput): number {
  const specialtyScore = scoreOverlap(mentee.interests, mentor.specialty)
  const identityScore = scoreOverlap(mentee.preferred_identity, mentor.identity)
  const helpScore = scoreOverlap(mentee.help_with, mentor.can_help_with)

  const raw =
    specialtyScore * WEIGHTS.specialty +
    identityScore * WEIGHTS.identity +
    helpScore * WEIGHTS.canHelpWith

  return Math.round(raw * 100)
}

export async function POST(request: Request) {
  try {
    const mentee: MenteeInput = await request.json()
    const supabase = getSupabaseAdmin()

    const { data: mentors, error } = await supabase
      .from('mentor')
      .select('*')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const scored: ScoredMentor[] = (mentors as Mentor[])
      .map(mentor => ({
        ...mentor,
        matchPercent: scoreMentor(mentor, mentee),
      }))
      .sort((a, b) => b.matchPercent - a.matchPercent)

    // Notify top match via email (non-blocking — don't fail the response if email fails)
    const topMatch = scored[0]
    if (topMatch?.email && mentee.email) {
      notifyMentorOfMatch(topMatch, mentee).catch(err =>
        console.error('Mentor email failed (non-fatal):', err)
      )
    }

    return NextResponse.json({ mentors: scored })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
