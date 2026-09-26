export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveAdminSession } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAscensoCohortId } from '@/lib/site'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await resolveAdminSession()
  if (session.status === 'unauthenticated') return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (session.status !== 'admin' || session.adminUser.role !== 'super') return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => null)
  const action = body?.action
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  const expectedVersion = body?.expectedVersion
  if ((action !== 'discard' && action !== 'restore') || reason.length < 3 || reason.length > 2000 ||
      !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    return NextResponse.json({ error: 'Action, reason and current cohort version are required' }, { status: 400 })
  }

  if (action === 'discard' && getAscensoCohortId() === id.toLowerCase()) {
    return NextResponse.json({ error: 'This cohort is the configured public application destination. Change that configuration before discarding it.' }, { status: 409 })
  }

  const { error } = await getSupabaseAdmin().rpc('ascenso_set_cohort_discarded', {
    p_id: id,
    p_actor: session.adminUser.id,
    p_discard: action === 'discard',
    p_reason: reason,
    p_expected_version: expectedVersion,
  })
  if (error) {
    console.error('Cohort discard action failed:', error.code, error.message)
    if (error.code === '42501' || error.code === 'P0002') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (error.code === '23514') {
      return NextResponse.json({ error: 'Cohort changed or has linked records. Refresh the cohort list before trying again.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Could not update the cohort. Try again later.' }, { status: 500 })
  }
  return NextResponse.json({ success: true, discarded: action === 'discard' })
}
