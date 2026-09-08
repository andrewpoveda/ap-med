import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listParticipations, participationKey, PARTICIPATION_COOKIE } from '@/lib/participation'
import { SUPABASE_COOKIE_OPTIONS } from '@/lib/cookie-options'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const available = await listParticipations(getSupabaseAdmin(), user.id)
  const selected = available.find(p => participationKey(p) === body.participation)
  if (!selected) return NextResponse.json({ error: 'This participation is unavailable. Refresh to see current programs.' }, { status: 404 })
  const response = NextResponse.json({ success: true, destination: selected.type === 'mentor' ? '/dashboard' : '/ascenso/dashboard' })
  response.cookies.set(PARTICIPATION_COOKIE, participationKey(selected), { ...SUPABASE_COOKIE_OPTIONS, httpOnly: true, maxAge: 60 * 60 * 24 * 30 })
  return response
}
