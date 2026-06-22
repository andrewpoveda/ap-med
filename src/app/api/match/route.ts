import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyMentorOfMatch } from '@/lib/email'
import type { Mentor, ScoredMentor } from '@/types/mentor'

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
  identity: string[]
  help_with: string[]
  notes?: string
  linkedin_url?: string
}

const WEIGHTS = {
  identity: 0.40,
  specialty: 0.35,
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
  const specialtyScore = scoreOverlap(mentee.interests, Array.isArray(mentor.specialty) ? mentor.specialty : [])
  const identityScore = scoreOverlap(mentee.identity, Array.isArray(mentor.identity) ? mentor.identity : [])
  const helpScore = scoreOverlap(mentee.help_with, Array.isArray(mentor.can_help_with) ? mentor.can_help_with : [])

  const raw =
    specialtyScore * WEIGHTS.specialty +
    identityScore * WEIGHTS.identity +
    helpScore * WEIGHTS.canHelpWith

  return Math.round(raw * 100)
}

export async function POST(request: Request) {
  try {
    const dryRun = new URL(request.url).searchParams.get('test') === '1'
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

    // Notify top match via email (non-blocking — don't fail the response if email fails).
    // Skipped entirely in dry-run mode (?test=1) so prod test-submits don't email real mentors.
    const topMatch = scored[0]
    if (dryRun) {
      console.log(`[dry-run] Skipped mentor notification email to ${topMatch?.email ?? '(none)'}`)
    } else if (topMatch?.email && mentee.email) {
      notifyMentorOfMatch(topMatch, mentee).catch(err =>
        console.error('Mentor email failed (non-fatal):', err)
      )
    }

    return NextResponse.json({ mentors: scored, dryRun })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
