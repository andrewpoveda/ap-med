import { NextResponse } from 'next/server'
import { resolveAdminSession } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizeEmail } from '@/lib/email-identity'
import { isValidEmail } from '@/lib/validate'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await resolveAdminSession()
  if (session.status === 'unauthenticated') return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (session.status !== 'admin' || session.adminUser.role !== 'super') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  if (!isValidEmail(body.email) || typeof body.cohortId !== 'string' || typeof body.grant !== 'boolean' || typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 2000) return NextResponse.json({ error: 'Cohort, email, grant action and reason required' }, { status: 400 })
  const { error } = await getSupabaseAdmin().rpc('ascenso_manage_grant', {
    p_actor: session.adminUser.id, p_cohort: body.cohortId, p_email: normalizeEmail(body.email), p_grant: body.grant, p_reason: body.reason.trim(),
  })
  if (error) return NextResponse.json({ error: 'Could not change this grant. Global or disabled administrator identities require operator management.' }, { status: 409 })
  return NextResponse.json({ success: true })
}
