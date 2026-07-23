export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort, type AdminUser } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'

// Survey lifecycle actions (ascenso-prm.md §5.12). PATCH `open` publishes a
// survey to the cohort's dashboards (status → open, opens_at stamped); PATCH
// `close` ends it (status → closed, closes_at stamped). A survey can be reopened
// (closed → open) if the board wants more time. DELETE removes a survey ONLY
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
    const { admin, survey } = gate

    const body = await request.json().catch(() => ({}))
    const action = String(body.action ?? '')

    if (action === 'open') {
      return setStatus(admin, survey, 'open', { opens_at: new Date().toISOString() })
    }
    if (action === 'close') {
      return setStatus(admin, survey, 'closed', { closes_at: new Date().toISOString() })
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
    const { admin, survey } = gate

    // A survey with responses is the record — never deletable. Only a survey
    // nobody has answered yet can be removed (e.g. a mis-typed draft).
    const { count, error: countError } = await admin
      .from('survey_responses')
      .select('id', { count: 'exact', head: true })
      .eq('survey_id', survey.id)
    if (countError) {
      console.error('Survey response count failed:', countError.message)
      return NextResponse.json({ error: 'Could not delete the survey' }, { status: 500 })
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'This survey has responses and cannot be deleted' },
        { status: 409 },
      )
    }

    const { error } = await admin.from('surveys').delete().eq('id', survey.id)
    if (error) {
      console.error('Survey delete failed:', error.message)
      return NextResponse.json({ error: 'Could not delete the survey' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Survey delete crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Shared gate: admin session → survey row → cohort access. Non-probeable 404s. */
async function requireSurvey(ctx: { params: Promise<{ id: string }> }): Promise<
  | { response: NextResponse }
  | { admin: SupabaseClient; adminUser: AdminUser; survey: SurveyRow }
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

async function setStatus(
  admin: SupabaseClient,
  survey: SurveyRow,
  status: 'open' | 'closed',
  extra: Record<string, unknown>,
) {
  if (survey.status === status) {
    return NextResponse.json(
      { error: status === 'open' ? 'This survey is already open' : 'This survey is already closed' },
      { status: 409 },
    )
  }
  const { error } = await admin
    .from('surveys')
    .update({ status, ...extra })
    .eq('id', survey.id)
  if (error) {
    console.error('Survey status update failed:', error.message)
    return NextResponse.json({ error: 'Could not update the survey' }, { status: 500 })
  }
  return NextResponse.json({ success: true, status })
}
