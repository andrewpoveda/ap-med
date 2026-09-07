import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isValidEmail } from '@/lib/validate'

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await resolveAdminSession()
  if (session.status === 'unauthenticated') return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (session.status !== 'admin') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { id } = await ctx.params
  if (!canAccessCohort(session.adminUser, id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 150 ||
      typeof body.email !== 'string' || !isValidEmail(body.email.trim()) ||
      typeof body.instructions !== 'string' || body.instructions.length > 2000) {
    return NextResponse.json({ error: 'Provide a support name, valid email and instructions up to 2000 characters.' }, { status: 400 })
  }
  const { error } = await getSupabaseAdmin().rpc('ascenso_update_support', {
    p_cohort: id, p_actor: session.adminUser.id,
    p_support: { name: body.name.trim(), email: body.email.trim(), instructions: body.instructions.trim() },
  })
  return error ? NextResponse.json({ error: 'Could not save support configuration' }, { status: 500 }) : NextResponse.json({ success: true })
}
