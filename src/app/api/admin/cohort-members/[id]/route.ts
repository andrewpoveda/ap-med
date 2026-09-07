import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
export const runtime = 'nodejs'

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await resolveAdminSession()
  if (session.status === 'unauthenticated') return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (session.status !== 'admin') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { id } = await ctx.params
  const body = await request.json().catch(() => ({}))
  if (typeof body.cohortId !== 'string' || !canAccessCohort(session.adminUser, body.cohortId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const allowed = body.role === 'mentor' ? ['first_name', 'last_name', 'institution', 'current_role', 'bio', 'membership_status']
    : body.role === 'mentee' ? ['full_name', 'school', 'membership_status'] : []
  const changes = body.changes
  if (!allowed.length || !changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length ||
    Object.entries(changes).some(([key, value]) => !allowed.includes(key) || typeof value !== 'string' || value.length > (key === 'bio' ? 2000 : 500)) ||
    (changes.membership_status && !['active', 'withdrawn', 'offboarded'].includes(changes.membership_status)) ||
    ['first_name', 'full_name'].some(k => k in changes && !changes[k].trim()) ||
    typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 2000) {
    return NextResponse.json({ error: 'Provide valid profile fields, a membership status and a reason. Identity fields cannot be changed here.' }, { status: 400 })
  }
  const admin = getSupabaseAdmin()
  const { data: member, error } = await admin.from(body.role === 'mentor' ? 'mentor' : 'mentees').select('id').eq('id', id).eq('cohort_id', body.cohortId).maybeSingle()
  if (error || !member) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { error: updateError } = await admin.rpc('ascenso_change_member', {
    p_id: id, p_cohort: body.cohortId, p_role: body.role, p_actor: session.adminUser.id,
    p_changes: changes, p_reason: body.reason.trim(), p_expected: body.expected ?? null,
  })
  if (updateError) return NextResponse.json({ error: updateError.code === '23514' ? updateError.message : 'Could not save changes; refresh and try again' }, { status: 409 })
  return NextResponse.json({ success: true })
}
