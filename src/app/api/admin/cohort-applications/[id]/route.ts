export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { promoteApplicationToMember } from '@/lib/cohort-members'
import { cap, LIMITS } from '@/lib/validate'
import type { CohortApplication } from '@/types/cohort'

// Board review actions (ascenso-prm.md §5.3): approve / reject / waitlist a
// cohort application, with review notes. Approve also creates-or-claims the
// mentor/mentees row with cohort_id and writes member_id back. Admin-only:
// session email must be in admin_users AND scoped to the application's cohort.
// Non-admins get the same 404 the /admin pages give — this surface should not
// be discoverable by probing.

const STATUS_BY_ACTION: Record<string, string> = {
  approve: 'approved',
  reject: 'rejected',
  waitlist: 'waitlisted',
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await resolveAdminSession()
    if (session.status === 'unauthenticated') {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    if (session.status === 'not_admin') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const { adminUser } = session

    const { id } = await ctx.params
    const body = await request.json().catch(() => ({}))

    const action = String(body.action ?? '')
    const status = STATUS_BY_ACTION[action]
    if (!status) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    const notes = cap(body.notes, LIMITS.text).trim()

    const admin = getSupabaseAdmin()
    // A malformed id lands here as a lookup error → same 404 as a miss.
    const { data: application, error } = await admin
      .from('cohort_applications')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error || !application) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const app = application as CohortApplication

    if (!canAccessCohort(adminUser, app.cohort_id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Approved is terminal for this route: a member row already exists, so
    // walking the status back is a manual DB decision, not a button.
    if (app.status === 'approved') {
      return NextResponse.json(
        { error: 'Application is already approved — changing it requires manual review' },
        { status: 409 },
      )
    }

    const update: Record<string, unknown> = {
      status,
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || null,
    }

    if (action === 'approve') {
      const promoted = await promoteApplicationToMember(admin, app)
      if (promoted.status === 'conflict') {
        return NextResponse.json(
          {
            error:
              'This email already belongs to a member of another cohort — resolve manually before approving',
          },
          { status: 409 },
        )
      }
      if (promoted.status === 'error') {
        return NextResponse.json(
          { error: 'Could not create the member record' },
          { status: 500 },
        )
      }
      update.member_id = promoted.memberId
    }

    // .neq guard: if a concurrent approval landed between our read and this
    // write, don't stomp its member_id/status.
    const { data: updated, error: updateError } = await admin
      .from('cohort_applications')
      .update(update)
      .eq('id', app.id)
      .neq('status', 'approved')
      .select('id')

    if (updateError) {
      console.error('Application review update failed:', updateError.message)
      return NextResponse.json({ error: 'Could not save the review' }, { status: 500 })
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: 'Application is already approved — changing it requires manual review' },
        { status: 409 },
      )
    }

    return NextResponse.json({ success: true, status })
  } catch (err) {
    console.error('Application review crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
