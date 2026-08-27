import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Waitlist · Admin | AP MED Mentors',
  robots: { index: false, follow: false },
}

type WaitlistRow = {
  id: string
  email: string
  created_at: string
}

const actionStyle = {
  display: 'inline-flex',
  minHeight: '2.75rem',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.65rem 1rem',
  border: '1px solid #c8a96e',
  borderRadius: '9px',
  background: '#c8a96e',
  color: '#1a1a2e',
  fontSize: '0.85rem',
  fontWeight: 600,
  textDecoration: 'none',
} as const

function formatJoinedAt(value: string) {
  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  })
}

export default async function AdminWaitlistPage() {
  const { adminUser } = await requireAdminSession()
  if (adminUser.role !== 'super') notFound()

  const admin = getSupabaseAdmin()
  const { data, error, count } = await admin
    .from('waitlist')
    .select('id, email, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(500)

  if (error) console.error('Admin waitlist fetch failed:', error.message)
  const entries = error ? [] : ((data as WaitlistRow[] | null) ?? [])
  const total = error ? null : (count ?? entries.length)

  return (
    <>
      <Link href="/admin" style={{ color: '#8a6a2f', fontSize: '0.85rem' }}>
        ← Back to cohorts
      </Link>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p
            style={{
              margin: 0,
              color: '#8a6d3b',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            AP MED Mentors
          </p>
          <h1
            className="text-[#1a1a2e]"
            style={{ margin: '0.6rem 0 0', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 400 }}
          >
            Early-access waitlist
          </h1>
          <p className="text-[#6b6b6b]" style={{ margin: '0.75rem 0 0', fontSize: '0.9rem' }}>
            {total === null
              ? 'The waitlist could not be loaded.'
              : `${total} ${total === 1 ? 'person' : 'people'} joined.`}
          </p>
        </div>
        {!error && (
          <a href="/api/admin/waitlist/export" download style={actionStyle}>
            Export CSV
          </a>
        )}
      </div>

      {!error && entries.length === 0 ? (
        <div
          className="mt-8"
          style={{
            padding: '1.5rem',
            border: '1px solid #e8e4dc',
            borderRadius: '12px',
            background: '#ffffff',
          }}
        >
          <p className="text-[#6b6b6b]" style={{ margin: 0, fontSize: '0.9rem' }}>
            No one has joined yet.
          </p>
        </div>
      ) : !error ? (
        <div
          className="mt-8 overflow-x-auto"
          style={{ border: '1px solid #e8e4dc', borderRadius: '12px', background: '#ffffff' }}
        >
          <table style={{ width: '100%', minWidth: '36rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f2ec', textAlign: 'left' }}>
                <th style={{ padding: '0.85rem 1rem', color: '#6b6b6b', fontSize: '0.72rem' }}>
                  Email
                </th>
                <th style={{ padding: '0.85rem 1rem', color: '#6b6b6b', fontSize: '0.72rem' }}>
                  Joined
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} style={{ borderTop: '1px solid #ece8e1' }}>
                  <td style={{ padding: '0.9rem 1rem', color: '#1a1a2e', fontSize: '0.86rem' }}>
                    {entry.email}
                  </td>
                  <td style={{ padding: '0.9rem 1rem', color: '#6b6b6b', fontSize: '0.8rem' }}>
                    {formatJoinedAt(entry.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total !== null && total > entries.length && (
            <p
              className="text-[#6b6b6b]"
              style={{ margin: 0, padding: '0.85rem 1rem', borderTop: '1px solid #ece8e1', fontSize: '0.75rem' }}
            >
              Showing the newest {entries.length}. Export the CSV for the complete list.
            </p>
          )}
        </div>
      ) : null}
    </>
  )
}
