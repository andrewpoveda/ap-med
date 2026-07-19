export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort, type AdminUser } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { MILESTONE_CATALOG, type CohortMemberType } from '@/lib/cohort-dashboard'
import type { SupabaseClient } from '@supabase/supabase-js'

// Admin milestone grid write side (ascenso-prm.md §5.5–5.7): POST marks a
// milestone (insert into member_milestones, marked_by = the acting admin),
// DELETE unmarks it (delete the row). That is the entire feature. Both verbs
// share the same validation: same non-probeable posture as the other admin
// routes (401 anon, 404 non-admin/wrong-cohort/unknown member), and the
// milestone must exist in MILESTONE_CATALOG for the member's role — which also
// keeps derived milestones (account activation, survey completion §5.12) out
// of the write path by construction.

type ValidatedRequest = {
  admin: SupabaseClient
  adminUser: AdminUser
  cohortId: string
  memberType: CohortMemberType
  memberId: string
  milestone: string
}

async function validate(request: Request): Promise<ValidatedRequest | NextResponse> {
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
  const memberType = String(body.memberType ?? '')
  const memberId = String(body.memberId ?? '')
  const milestone = String(body.milestone ?? '')
  if (!cohortId || !memberId) {
    return NextResponse.json({ error: 'Missing ids' }, { status: 400 })
  }
  if (memberType !== 'mentor' && memberType !== 'mentee') {
    return NextResponse.json({ error: 'Invalid member type' }, { status: 400 })
  }
  // Role-aware allowlist: orientation (both), mentor_training (mentors only),
  // mentee_training (mentees only). Anything else — including survey keys —
  // is not writable here.
  if (!MILESTONE_CATALOG[memberType].some((m) => m.key === milestone)) {
    return NextResponse.json(
      { error: 'Invalid milestone for this member type' },
      { status: 400 },
    )
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

  // The member must belong to this cohort. Scoped by cohort_id ONLY — no
  // `approved` filter: promoted cohort mentor rows keep approved=false as
  // defense in depth (public surfaces need approved=true AND cohort_id IS
  // NULL), so filtering on it here would hide every cohort mentor.
  const memberTable = memberType === 'mentor' ? 'mentor' : 'mentees'
  const { data: member, error: memberError } = await admin
    .from(memberTable)
    .select('id')
    .eq('id', memberId)
    .eq('cohort_id', cohortId)
    .maybeSingle()
  if (memberError || !member) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return { admin, adminUser, cohortId, memberType, memberId, milestone }
}

export async function POST(request: Request) {
  try {
    const validated = await validate(request)
    if (validated instanceof NextResponse) return validated
    const { admin, adminUser, cohortId, memberType, memberId, milestone } = validated

    const { error } = await admin.from('member_milestones').insert([
      {
        cohort_id: cohortId,
        member_type: memberType,
        member_id: memberId,
        milestone,
        marked_by: adminUser.id,
      },
    ])
    // unique (cohort_id, member_type, member_id, milestone) → already marked;
    // a re-check is idempotent, not an error.
    if (error && error.code !== '23505') {
      console.error('Milestone insert failed:', error.message)
      return NextResponse.json({ error: 'Could not mark the milestone' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Milestone mark crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const validated = await validate(request)
    if (validated instanceof NextResponse) return validated
    const { admin, cohortId, memberType, memberId, milestone } = validated

    const { error } = await admin
      .from('member_milestones')
      .delete()
      .eq('cohort_id', cohortId)
      .eq('member_type', memberType)
      .eq('member_id', memberId)
      .eq('milestone', milestone)
    // Deleting an already-unmarked milestone matches zero rows — idempotent.
    if (error) {
      console.error('Milestone delete failed:', error.message)
      return NextResponse.json({ error: 'Could not unmark the milestone' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Milestone unmark crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
