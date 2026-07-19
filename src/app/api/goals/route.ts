export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { cap, LIMITS } from '@/lib/validate'
import { resolveActingMember, checkPartyToMatch, parseTargetDate } from '@/lib/goals'

/**
 * Create a goal on a match (ascenso-prm.md §4 / §7.10). Goals are a shared
 * per-pair list — both the cohort mentor and the cohort mentee create/edit them
 * (PATCH /api/goals/[id] handles status/title/target_date). Same member-write
 * posture as item 9 (§6.3 P0): resolve the acting member from the session to
 * their OWN cohort row, then verify they are a party to the target match before
 * inserting — a member must never write another pair's goals.
 *
 * Posture: 401 anon; 403 signed-in but not a cohort member; 404 for a match the
 * member isn't a party to, or an unknown/pre-activation match (non-probeable);
 * 400 bad title or target date. New goals always start 'active'.
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

    const matchId = typeof body.matchId === 'string' ? body.matchId.trim() : ''
    if (!matchId) {
      return NextResponse.json({ error: 'matchId is required' }, { status: 400 })
    }

    const title = cap(body.title, LIMITS.name).trim()
    if (!title) {
      return NextResponse.json({ error: 'A goal needs a title' }, { status: 400 })
    }

    const targetDate = parseTargetDate(body.targetDate)
    if (!targetDate.ok) {
      return NextResponse.json({ error: 'Invalid target date' }, { status: 400 })
    }

    // Party check (§6.3): the acting member must be this match's own side, in
    // their own cohort, and the match must be active/ended.
    const party = await checkPartyToMatch(admin, actor, matchId)
    if (party === 'error') {
      return NextResponse.json({ error: 'Could not create the goal' }, { status: 500 })
    }
    if (party === 'not_party') {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    const { data: inserted, error: insErr } = await admin
      .from('goals')
      .insert({
        cohort_id: actor.cohortId,
        match_id: matchId,
        title,
        status: 'active',
        target_date: targetDate.value,
      })
      .select('id')
      .single()
    if (insErr || !inserted) {
      console.error('Goal insert failed:', insErr?.message)
      return NextResponse.json({ error: 'Could not create the goal' }, { status: 500 })
    }

    return NextResponse.json({ success: true, goalId: inserted.id })
  } catch (err) {
    console.error('Goal create crashed:', err)
    return NextResponse.json({ error: 'Could not create the goal' }, { status: 500 })
  }
}
