import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendCohortDeliveries } from '@/lib/cohort-delivery'
export const runtime = 'nodejs'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await resolveAdminSession()
  if (session.status === 'unauthenticated') return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (session.status !== 'admin') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { id } = await ctx.params
  const admin = getSupabaseAdmin()
  const { data: delivery, error } = await admin.from('cohort_delivery').select('id, cohort_id, source_id').eq('id', id).maybeSingle()
  if (error || !delivery || !canAccessCohort(session.adminUser, delivery.cohort_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  if (body.action === 'confirm_accepted' || body.action === 'confirm_not_sent') {
    if (typeof body.reason !== 'string' || body.reason.trim().length < 10 || body.reason.length > 2000) {
      return NextResponse.json({ error: 'Describe the provider check (10–2000 characters)' }, { status: 400 })
    }
    const { error: resolveError } = await admin.rpc('ascenso_resolve_delivery', {
      p_id: id, p_actor: session.adminUser.id, p_accepted: body.action === 'confirm_accepted', p_reason: body.reason.trim(),
    })
    if (resolveError) return NextResponse.json({ error: 'Could not record the provider check; refresh and verify no send is still in progress' }, { status: 409 })
    return NextResponse.json({ success: true })
  }
  if (body.action !== 'retry') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  const complete = await sendCohortDeliveries(admin, delivery.source_id, delivery.cohort_id)
  return NextResponse.json({ success: true, warning: complete ? null : 'Some emails still need attention. Refresh delivery status below.' })
}
