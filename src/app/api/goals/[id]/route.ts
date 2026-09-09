export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { cap, LIMITS } from '@/lib/validate'
import {
  resolveActingMember,
  checkPartyToMatch,
  parseTargetDate,
  isGoalStatus,
} from '@/lib/goals'

/**
 * Either participant may update a goal on their own match. Resolve the actor
 * and the goal's actual match before writing; foreign and unknown goals share a
 * non-probeable 404. Require at least one valid field.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
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

    const { id: goalId } = await ctx.params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Build the update from whichever fields were supplied. At least one is
    // required. updated_at is bumped on every write (§4 keeps it for item 13).
    const update: Record<string, unknown> = {}

    if ('status' in body) {
      if (!isGoalStatus(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      update.status = body.status
    }

    if ('title' in body) {
      const title = cap(body.title, LIMITS.name).trim()
      if (!title) {
        return NextResponse.json({ error: 'A goal needs a title' }, { status: 400 })
      }
      update.title = title
    }

    if ('targetDate' in body) {
      const targetDate = parseTargetDate(body.targetDate)
      if (!targetDate.ok) {
        return NextResponse.json({ error: 'Invalid target date' }, { status: 400 })
      }
      update.target_date = targetDate.value
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }
    update.updated_at = new Date().toISOString()

    // Resolve the goal to its match, then party-check THAT match. A malformed id
    // lands here as a lookup miss → the same non-probeable 404 as a real miss.
    const { data: goal, error: goalErr } = await admin
      .from('goals')
      .select('id, cohort_id, match_id')
      .eq('id', goalId)
      .maybeSingle()
    if (goalErr) {
      console.error('Goal lookup failed:', goalErr.message)
      return NextResponse.json({ error: 'Could not update the goal' }, { status: 500 })
    }
    if (!goal || goal.cohort_id !== actor.cohortId) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    const party = await checkPartyToMatch(admin, actor, goal.match_id as string)
    if (party === 'error') {
      return NextResponse.json({ error: 'Could not update the goal' }, { status: 500 })
    }
    if (party === 'not_party') {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    // Scoped by id AND cohort_id — defense in depth on top of the party check.
    const { data: updated, error: updErr } = await admin
      .from('goals')
      .update(update)
      .eq('id', goalId)
      .eq('cohort_id', actor.cohortId)
      .select('id')
    if (updErr) {
      console.error('Goal update failed:', updErr.message)
      return NextResponse.json({ error: 'Could not update the goal' }, { status: 500 })
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Goal update crashed:', err)
    return NextResponse.json({ error: 'Could not update the goal' }, { status: 500 })
  }
}
