export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendCohortDeliveries } from '@/lib/cohort-delivery'
import { normalizeEmail } from '@/lib/email-identity'
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

    const { data: savedStatus, error: reviewError } = await admin.rpc('ascenso_review_application', {
      p_id: app.id, p_actor: adminUser.id, p_status: status,
      p_notes: notes, p_email: normalizeEmail(app.email),
    })
    if (reviewError) {
      return NextResponse.json({ error: reviewError.code === '23514'
        ? reviewError.message : 'Could not save the review; refresh and try again' }, { status: 409 })
    }
    const sent = await sendCohortDeliveries(admin, app.id)
    return NextResponse.json({ success: true, status: savedStatus,
      ...(!sent ? { warning: 'Decision saved. Email acceptance is incomplete; use delivery recovery below.' } : {}) })
  } catch (err) {
    console.error('Application review crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
