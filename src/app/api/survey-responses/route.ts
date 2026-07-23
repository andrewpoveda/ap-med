export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { resolveActingMember } from '@/lib/goals'
import { coerceQuestions, validateAnswers } from '@/lib/surveys'

/**
 * Submit a survey response (ascenso-prm.md §5.12 / §7.15). The member's identity
 * comes from the session — NO email matching, NO Turnstile (every cohort member
 * has an account) — and the DB's unique(survey_id, member_id) enforces one
 * response per member. Same member-write posture as items 9/10 (§6.3 P0): resolve
 * the acting member from the session to their OWN cohort row, then verify the
 * survey belongs to that cohort and is open before inserting. A member submits
 * only for themselves and can never read or write another member's response.
 *
 * Posture: 401 anon; 403 signed-in non-member; 404 for a survey that isn't in the
 * member's cohort (non-probeable — cross-cohort isolation); 409 if the survey is
 * closed/draft (a real state conflict on the member's OWN cohort survey — e.g.
 * the form was open when the admin closed it) or already answered; 400 for
 * malformed/incomplete answers.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    const actor = await resolveActingMember(admin, user.id)
    if (!actor) {
      return NextResponse.json({ error: 'No linked cohort member profile' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const surveyId = typeof body.surveyId === 'string' ? body.surveyId.trim() : ''
    if (!surveyId) {
      return NextResponse.json({ error: 'surveyId is required' }, { status: 400 })
    }

    // Malformed uuid → lookup error → same non-probeable 404 as a miss. Scope by
    // the survey id AND the caller's own cohort so a leaked/guessed id from
    // another cohort is indistinguishable from not existing.
    const { data: survey, error: surveyError } = await admin
      .from('surveys')
      .select('id, cohort_id, status, questions')
      .eq('id', surveyId)
      .maybeSingle()
    if (surveyError) {
      console.error('Survey lookup failed:', surveyError.message)
      return NextResponse.json({ error: 'Could not submit your response' }, { status: 500 })
    }
    if (!survey || survey.cohort_id !== actor.cohortId) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }
    if (survey.status !== 'open') {
      return NextResponse.json({ error: 'This survey is closed' }, { status: 409 })
    }

    const questions = coerceQuestions(survey.questions)
    const answers = validateAnswers(questions, body.answers)
    if (!answers.ok) {
      return NextResponse.json({ error: answers.error }, { status: 400 })
    }

    const { error: insertError } = await admin.from('survey_responses').insert([
      {
        survey_id: survey.id,
        cohort_id: actor.cohortId,
        member_type: actor.type,
        member_id: actor.id,
        answers: answers.value,
      },
    ])
    if (insertError) {
      // unique (survey_id, member_id) → the member already responded.
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: "You've already responded to this survey" },
          { status: 409 },
        )
      }
      console.error('Survey response insert failed:', insertError.message)
      return NextResponse.json({ error: 'Could not submit your response' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Survey response crashed:', err)
    return NextResponse.json({ error: 'Could not submit your response' }, { status: 500 })
  }
}
