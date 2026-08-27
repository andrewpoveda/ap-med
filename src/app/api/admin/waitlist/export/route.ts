export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveAdminSession } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { toCsv } from '@/lib/csv'

type WaitlistRow = {
  id: string
  email: string
  created_at: string
}

const PAGE_SIZE = 1000

export async function GET() {
  try {
    const session = await resolveAdminSession()
    if (session.status === 'unauthenticated') {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    if (session.status === 'not_admin' || session.adminUser.role !== 'super') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const admin = getSupabaseAdmin()
    const entries: WaitlistRow[] = []
    const snapshotTime = new Date().toISOString()
    let cursor: Pick<WaitlistRow, 'created_at' | 'id'> | null = null

    for (;;) {
      let query = admin
        .from('waitlist')
        .select('id, email, created_at')
        .lte('created_at', snapshotTime)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE)

      if (cursor) {
        query = query.or(
          `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
        )
      }

      const { data, error } = await query

      if (error) {
        console.error('Waitlist export fetch failed:', error.message)
        return NextResponse.json({ error: 'Could not build the export' }, { status: 500 })
      }

      const batch = (data as WaitlistRow[] | null) ?? []
      entries.push(...batch)
      if (batch.length < PAGE_SIZE) break

      const lastEntry = batch[batch.length - 1]
      cursor = { created_at: lastEntry.created_at, id: lastEntry.id }
    }

    const csv = toCsv(
      ['Email', 'Joined at'],
      entries.map((entry) => [entry.email, entry.created_at]),
    )
    const date = new Date().toISOString().slice(0, 10)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ap-med-mentors-waitlist-${date}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Waitlist export crashed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
