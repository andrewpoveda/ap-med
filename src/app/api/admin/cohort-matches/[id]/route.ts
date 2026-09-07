export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendCohortDeliveries } from '@/lib/cohort-delivery'
import { isMutationDryRunAllowed } from '@/lib/test-mode'
import { cap, LIMITS } from '@/lib/validate'
import type { AdminUser } from '@/lib/admin'
import type { CohortMatch } from '@/types/cohort'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const url = new URL(request.url)
    const dryRun = url.searchParams.get('test') === '1'
    if (dryRun && !isMutationDryRunAllowed(process.env.NODE_ENV)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const gate = await requireMatch(ctx)
    if ('response' in gate) return gate.response
    const { admin, adminUser, match } = gate

    const body = await request.json().catch(() => ({}))
    const action = String(body.action ?? '')

    if (action === 'approve') {
      return approveMatch(admin, adminUser, match)
    }
    if (action === 'activate' || action === 'end') {
      if (dryRun) return NextResponse.json({ success: true, dryRun: true })
      const { data: status, error } = await admin.rpc('ascenso_match_action', {
        p_id: match.id, p_actor: adminUser.id, p_action: action,
        p_reason: cap(body.reason, LIMITS.text).trim(),
      })
      if (error) return NextResponse.json({ error: error.code === '23514' ? error.message : 'Could not update match; refresh and try again' }, { status: 409 })
      const sent = action === 'activate' ? await sendCohortDeliveries(admin, match.id) : true
      return NextResponse.json({ success: true, status,
        ...(!sent ? { warning: 'Match is active. Introduction acceptance is incomplete; use delivery recovery below.' } : {}) })
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('Match action crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireMatch(ctx)
    if ('response' in gate) return gate.response
    const { admin, match } = gate

    // Conditional delete: an active/ended match is history (and meeting logs
    // may reference it) — only unactivated selections can be removed.
    const { data: deleted, error } = await admin
      .from('cohort_matches')
      .delete()
      .eq('id', match.id)
      .in('status', ['proposed', 'board_approved'])
      .select('id')

    if (error) {
      console.error('Match delete failed:', error.message)
      return NextResponse.json({ error: 'Could not remove the match' }, { status: 500 })
    }
    if (!deleted || deleted.length === 0) {
      return NextResponse.json(
        { error: 'Only a not-yet-active selection can be removed' },
        { status: 409 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Match delete crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Shared gate: admin session → match row → cohort access. Non-probeable 404s. */
async function requireMatch(ctx: { params: Promise<{ id: string }> }): Promise<
  | { response: NextResponse }
  | { admin: SupabaseClient; adminUser: AdminUser; match: CohortMatch }
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
    .from('cohort_matches')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) {
    return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  const match = data as CohortMatch

  if (!canAccessCohort(session.adminUser, match.cohort_id)) {
    return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  return { admin, adminUser: session.adminUser, match }
}

async function approveMatch(
  admin: SupabaseClient,
  adminUser: AdminUser,
  match: CohortMatch,
) {
  // Conditional update = race guard: only a proposed row can be approved.
  const { data: updated, error } = await admin
    .from('cohort_matches')
    .update({
      status: 'board_approved',
      approved_by: adminUser.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', match.id)
    .eq('status', 'proposed')
    .select('id')

  if (error) {
    console.error('Match approve failed:', error.message)
    return NextResponse.json({ error: 'Could not approve the match' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: 'Only a proposed match can be board-approved' },
      { status: 409 },
    )
  }
  return NextResponse.json({ success: true, status: 'board_approved' })
}
