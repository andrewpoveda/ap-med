export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { resolveActingMember } from '@/lib/goals'
import { coerceQuestions, validateAnswers } from '@/lib/surveys'

/**
 * Resolve identity from the session and scope the survey to the member's cohort.
 * Only the member may submit their response. Foreign surveys return a non-probeable
 * 404; closed/draft or already-answered surveys return 409. Database uniqueness
 * prevents duplicate responses; malformed or incomplete answers return 400.
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
