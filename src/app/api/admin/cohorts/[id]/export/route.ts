export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildCohortExport, isExportTable, slugify } from '@/lib/cohort-export'
import { toCsv } from '@/lib/csv'

// Annual-report CSV export (ascenso-prm.md §5.14). A single download route
// serving one CSV per cohort table (?table=members|matches|meetings|goals|
// milestones|applications). Same gate as every other /api/admin/* route —
// session email ∈ admin_users AND canAccessCohort — with the cohort id in the
// path (mirroring the /admin/cohorts/[id]/* pages) rather than the body, since
// a download is a GET. Non-probeable: anon → 401, non-admin or an inaccessible
// / unknown cohort → 404. A failed query 500s rather than handing the board a
// silently-truncated file.

export async function GET(
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

    const { id: cohortId } = await ctx.params
    if (!canAccessCohort(adminUser, cohortId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const table = new URL(request.url).searchParams.get('table') ?? ''
    if (!isExportTable(table)) {
      return NextResponse.json({ error: 'Unknown table' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    // Malformed uuid → lookup error → same 404 as a miss.
    const { data: cohort, error: cohortError } = await admin
      .from('cohorts')
      .select('id, name')
      .eq('id', cohortId)
      .maybeSingle()
    if (cohortError || !cohort) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { headers, rows, error } = await buildCohortExport(admin, cohortId, table)
    if (error) {
      console.error(`Cohort export (${table}) failed:`, error)
      return NextResponse.json({ error: 'Could not build the export' }, { status: 500 })
    }

    const csv = toCsv(headers, rows)
    const date = new Date().toISOString().slice(0, 10)
    const filename = `ascenso-${slugify(cohort.name as string)}-${table}-${date}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('Cohort export crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
