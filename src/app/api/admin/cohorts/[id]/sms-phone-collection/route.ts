import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const modes = new Set(['off', 'optional', 'required'])

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await resolveAdminSession()
  if (session.status === 'unauthenticated') return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (session.status !== 'admin') return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { id } = await ctx.params
  if (!uuidPattern.test(id) || !canAccessCohort(session.adminUser, id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const body = await request.json().catch(() => null)
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if (!modes.has(body?.mode) || reason.length < 3 || reason.length > 2000 ||
      !Number.isSafeInteger(body?.expectedVersion) || body.expectedVersion < 0) {
    return NextResponse.json({ error: 'Choose a collection mode and provide a reason with the current cohort version.' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin().rpc('cohort_set_sms_phone_collection', {
    p_cohort: id,
    p_actor: session.adminUser.id,
    p_mode: body.mode,
    p_reason: reason,
    p_expected_version: body.expectedVersion,
  })
  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (error.code === '23514') {
      return NextResponse.json({ error: 'Cohort settings changed or this cohort was discarded. Refresh before saving.' }, { status: 409 })
    }
    console.error('Could not configure cohort SMS phone collection', { code: error.code })
    return NextResponse.json({ error: 'Could not save phone collection settings.' }, { status: 500 })
  }
  return NextResponse.json({ success: true, version: data })
}
