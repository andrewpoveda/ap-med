export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveAdminSession } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// The Ascenso visibility switch, written from the /admin toggle so flipping it
// never requires the Supabase SQL editor. Read side is src/lib/app-settings.ts;
// the row is the singleton created by migration 0008.
//
// SUPER ADMINS ONLY. Every other admin route scopes by cohort via
// canAccessCohort, but this flag is site-wide (it moves the homepage panel and
// the sitemap, not one cohort's data), so there is no cohort to scope to and a
// cohort_admin has no business throwing it. A non-super admin gets the same
// 404 as a non-admin — the same non-probeable posture as the rest of /admin.
export async function PATCH(request: Request) {
  try {
    const session = await resolveAdminSession()
    if (session.status === 'unauthenticated') {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    if (session.status === 'not_admin' || session.adminUser.role !== 'super') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    // Strict boolean: a missing or string value must not be coerced into a
    // site-visibility change.
    if (typeof body.ascensoVisible !== 'boolean') {
      return NextResponse.json(
        { error: 'ascensoVisible must be true or false' },
        { status: 400 },
      )
    }
    const ascensoVisible: boolean = body.ascensoVisible

    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('app_settings')
      .update({ ascenso_visible: ascensoVisible })
      .eq('id', 1)
      .select('ascenso_visible, updated_at')
      .maybeSingle()

    if (error) {
      console.error('app_settings update failed:', error.message)
      return NextResponse.json(
        { error: 'Could not update the setting' },
        { status: 500 },
      )
    }
    // Zero rows updated — the singleton row is missing. Worth naming precisely:
    // the reader fails closed, so without this the symptom would be a toggle
    // that silently never sticks. Only a super admin ever sees this string.
    if (!data) {
      return NextResponse.json(
        { error: 'Settings row missing — run migration 0008_app_settings.sql' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      ascensoVisible: data.ascenso_visible === true,
      updatedAt: data.updated_at ?? null,
    })
  } catch (err) {
    console.error('app_settings update crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
