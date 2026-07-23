export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { cap, LIMITS } from '@/lib/validate'
import { isSurveyWave, validateQuestions } from '@/lib/surveys'

// Create a cohort survey (ascenso-prm.md §5.12 / §7.15). The admin picks a wave
// (mid_year | end_year), a title, and an ordered list of questions; the survey
// lands as `draft` and opens later via PATCH. Everything consequential is
// re-derived/validated server-side: question ids are assigned in validateQuestions,
// never trusted from the client. Same non-probeable posture as the other admin
// routes: 401 anon, 404 non-admin / wrong cohort / unknown cohort. unique
// (cohort_id, wave) means each wave can exist once — a second create is 409.
export async function POST(request: Request) {
  try {
    const session = await resolveAdminSession()
    if (session.status === 'unauthenticated') {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    if (session.status === 'not_admin') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const { adminUser } = session

    const body = await request.json().catch(() => ({}))
    const cohortId = String(body.cohortId ?? '')
    const wave = body.wave
    const title = cap(body.title, LIMITS.name).trim()

    if (!cohortId) {
      return NextResponse.json({ error: 'Missing cohort' }, { status: 400 })
    }
    if (!isSurveyWave(wave)) {
      return NextResponse.json({ error: 'Invalid wave' }, { status: 400 })
    }
    if (!title) {
      return NextResponse.json({ error: 'A survey needs a title' }, { status: 400 })
    }
    const questions = validateQuestions(body.questions)
    if (!questions.ok) {
      return NextResponse.json({ error: questions.error }, { status: 400 })
    }

    if (!canAccessCohort(adminUser, cohortId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const admin = getSupabaseAdmin()
    // Malformed uuid → lookup error → same 404 as a miss.
    const { data: cohort, error: cohortError } = await admin
      .from('cohorts')
      .select('id')
      .eq('id', cohortId)
      .maybeSingle()
    if (cohortError || !cohort) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { data: created, error: insertError } = await admin
      .from('surveys')
      .insert([
        {
          cohort_id: cohortId,
          wave,
          title,
          questions: questions.value,
          status: 'draft',
        },
      ])
      .select('id')
      .single()

    if (insertError || !created) {
      // unique (cohort_id, wave) → this wave already has a survey.
      if (insertError?.code === '23505') {
        return NextResponse.json(
          { error: 'A survey for this wave already exists — open or delete it first' },
          { status: 409 },
        )
      }
      console.error('Survey insert failed:', insertError?.message)
      return NextResponse.json({ error: 'Could not create the survey' }, { status: 500 })
    }

    return NextResponse.json({ success: true, surveyId: created.id })
  } catch (err) {
    console.error('Survey create crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
