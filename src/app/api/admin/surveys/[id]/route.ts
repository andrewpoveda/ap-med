export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'

// Survey lifecycle actions (ascenso-prm.md §5.12). PATCH `open` publishes a
// survey to the cohort's dashboards (status → open, opens_at stamped); PATCH
// `close` ends it (status → closed, closes_at stamped). A survey can be reopened
// (closed → open) while its cohort is active. DELETE removes a survey ONLY
// while it has zero responses — a survey with responses is the record and must
// not be destroyable — which also lets a mis-created draft be cleared so the
// unique(cohort_id, wave) slot frees up. Same posture as the other admin routes:
// 401 anon, 404 non-admin / wrong cohort / unknown survey, non-probeable.

type SurveyRow = {
  id: string
  cohort_id: string
  status: string
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireSurvey(ctx)
    if ('response' in gate) return gate.response
    const { admin, adminUser, survey } = gate

    const body = await request.json().catch(() => ({}))
    const action = String(body.action ?? '')

    if (action === 'open') {
      return mutateSurvey(admin, survey, adminUser.id, 'open')
    }
    if (action === 'close') {
      return mutateSurvey(admin, survey, adminUser.id, 'close')
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('Survey action crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireSurvey(ctx)
    if ('response' in gate) return gate.response
    const { admin, adminUser, survey } = gate

    return mutateSurvey(admin, survey, adminUser.id, 'delete')
  } catch (err) {
    console.error('Survey delete crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Shared gate: admin session → survey row → cohort access. Non-probeable 404s. */
async function requireSurvey(ctx: { params: Promise<{ id: string }> }): Promise<
  | { response: NextResponse }
  | { admin: SupabaseClient; adminUser: { id: string }; survey: SurveyRow }
> {
  const session = await resolveAdminSession()
  if (session.status === 'unauthenticated') {
    return { response: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  }
  if (session.status === 'not_admin') {
    return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }

  const { id } = await ctx.params
  const admin = getSupabaseAdmin()
  // Malformed uuid → lookup error → same 404 as a miss.
  const { data, error } = await admin
    .from('surveys')
    .select('id, cohort_id, status')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) {
    return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  const survey = data as SurveyRow

  if (!canAccessCohort(session.adminUser, survey.cohort_id)) {
    return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  return { admin, adminUser: session.adminUser, survey }
}

async function mutateSurvey(
  admin: SupabaseClient,
  survey: SurveyRow,
  actorId: string,
  action: 'open' | 'close' | 'delete',
) {
  const nextStatus = action === 'delete' ? null : action === 'close' ? 'closed' : 'open'
  if (nextStatus && survey.status === nextStatus) {
    return NextResponse.json(
      { error: nextStatus === 'open' ? 'This survey is already open' : 'This survey is already closed' },
      { status: 409 },
    )
  }
  // The RPC acquires the cohort lock before the survey lock. Direct UPDATE or
  // DELETE would reverse closeout's lock order and can deadlock with it.
  const { data, error } = await admin.rpc('ascenso_mutate_survey', {
    p_id: survey.id,
    p_cohort: survey.cohort_id,
    p_actor: actorId,
    p_action: action,
    p_expected_status: survey.status,
  })
  if (error) {
    if (error.code === 'P0002' || error.code === '42501') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (error.code === '23514' || error.code === '23503') {
      let message = 'Survey changed; refresh before updating'
      if (error.message === 'Closed cohorts cannot change surveys') {
        message = action === 'open' ? 'Closed cohorts cannot reopen surveys' : 'Closed cohorts cannot change surveys'
      } else if (error.message === 'Discarded cohorts cannot change surveys' ||
          error.message === 'This survey has responses and cannot be deleted' ||
          error.message === 'This survey is already open' ||
          error.message === 'This survey is already closed') {
        message = error.message
      } else if (error.code === '23503') {
        message = 'This survey has responses and cannot be deleted'
      }
      return NextResponse.json({ error: message }, { status: 409 })
    }
    console.error('Survey mutation failed:', error.message)
    return NextResponse.json({ error: action === 'delete' ? 'Could not delete the survey' : 'Could not update the survey' }, { status: 500 })
  }
  if (data !== (nextStatus ?? 'deleted')) {
    console.error('Survey mutation returned an unexpected result:', data)
    return NextResponse.json({ error: action === 'delete' ? 'Could not delete the survey' : 'Could not update the survey' }, { status: 500 })
  }
  return NextResponse.json(nextStatus ? { success: true, status: nextStatus } : { success: true })
}
