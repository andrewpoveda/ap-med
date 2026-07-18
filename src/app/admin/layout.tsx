import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { requireAdminSession } from '@/lib/admin'
import SignOutButton from '@/app/dashboard/SignOutButton'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin | AP MED Mentors',
  robots: { index: false, follow: false },
}

// Shell for the whole /admin segment: gates on session email ∈ admin_users and
// renders the admin header. Pages under /admin still call requireAdminSession()
// themselves before fetching data — the layout is chrome plus defense in depth,
// not the sole gate.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { email, adminUser } = await requireAdminSession()

  return (
    <section>
      <div
        className="flex flex-wrap items-center justify-between gap-3"
        style={{ borderBottom: '1px solid #e8e4dc', paddingBottom: '1rem' }}
      >
        <p
          style={{
            color: '#c8a96e',
            fontSize: '0.75rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            fontWeight: 600,
            margin: 0,
          }}
        >
          AP MED Admin
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[#6b6b6b]" style={{ fontSize: '0.85rem' }}>
            {adminUser.display_name ?? email}
          </span>
          <Link
            href="/dashboard"
            style={{ color: '#8a6a2f', fontSize: '0.85rem' }}
          >
            Mentor dashboard →
          </Link>
          <SignOutButton />
        </div>
      </div>
      <div className="mt-8">{children}</div>
    </section>
  )
}
