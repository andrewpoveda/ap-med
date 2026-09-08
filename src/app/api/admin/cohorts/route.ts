import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await resolveAdminSession()
  if (session.status === 'unauthenticated') return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (session.status !== 'admin') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : null
  if (id ? !canAccessCohort(session.adminUser, id) : session.adminUser.role !== 'super') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  for (const field of ['name', 'org', 'reason']) {
    if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > (field === 'reason' ? 2000 : 200)) return NextResponse.json({ error: `Valid ${field} required` }, { status: 400 })
  }
  if (body.reason.trim().length < 3 || !['setup', 'applications_open', 'matching', 'active', 'closed'].includes(body.status)) return NextResponse.json({ error: 'Valid status and reason required' }, { status: 400 })
  const orientation = body.orientation || null
  if (orientation !== null && (typeof orientation !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(orientation) || Number.isNaN(Date.parse(orientation)) || new Date(orientation).toISOString().slice(0, 10) !== orientation)) return NextResponse.json({ error: 'Valid orientation date required' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin().rpc('ascenso_configure_cohort', {
    p_id: id, p_actor: session.adminUser.id, p_name: body.name.trim(), p_org: body.org.trim(),
    p_orientation: orientation, p_status: body.status, p_expected: body.expected ?? null, p_reason: body.reason.trim(),
  })
  if (error) return NextResponse.json({ error: 'Could not save. Refresh for current status. Closeout requires ending matches, removing selections, cancelling future sessions, resolving calendar cleanup and uncertain email.' }, { status: 409 })
  return NextResponse.json({ success: true, id: data })
}
