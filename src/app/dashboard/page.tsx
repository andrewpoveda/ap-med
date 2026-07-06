import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getMentorForUser, linkMentorByEmail } from '@/lib/mentor-link'
import SignOutButton from './SignOutButton'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mentor Dashboard | AP MED Mentors',
  robots: { index: false, follow: false },
}

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(26,26,46,0.04)',
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const admin = getSupabaseAdmin()
  let mentor = await getMentorForUser(admin, user.id)

  // Fallback link attempt: covers the case where the mentor row was created (or
  // its email corrected) after the user's first sign-in, so the callback never
  // linked it.
  if (!mentor && user.email) {
    const result = await linkMentorByEmail(admin, user.id, user.email)
    if (result.status === 'linked') {
      mentor = await getMentorForUser(admin, user.id)
    }
  }

  return (
    <section>
      <p
        style={{
          color: '#c8a96e',
          fontSize: '0.75rem',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          fontWeight: 600,
          marginBottom: '0.75rem',
        }}
      >
        Mentor Dashboard
      </p>
      <h1
        className="text-[#1a1a2e]"
        style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400 }}
      >
        {mentor ? `Welcome, ${mentor.first_name}` : 'Welcome'}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-[#6b6b6b]" style={{ fontSize: '0.9rem' }}>
          Signed in as {user.email}
        </span>
        <SignOutButton />
      </div>

      {mentor ? (
        <div className="mt-8 space-y-6">
          <div style={cardStyle}>
            <p
              style={{
                fontSize: '0.7rem',
                color: '#9a948a',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                margin: '0 0 0.5rem',
              }}
            >
              Your mentor profile
            </p>
            <h2
              className="text-[#1a1a2e]"
              style={{ fontSize: '1.25rem', fontWeight: 500, margin: 0 }}
            >
              {mentor.first_name} {mentor.last_name}
              {mentor.credentials ? `, ${mentor.credentials}` : ''}
            </h2>
            <p className="text-[#4a4a5a]" style={{ margin: '0.35rem 0 0', fontSize: '0.95rem' }}>
              {[mentor.current_role, mentor.institution].filter(Boolean).join(' · ')}
            </p>
            <p
              style={{
                margin: '1rem 0 0',
                fontSize: '0.85rem',
                color: mentor.approved ? '#2f8f5f' : '#8a6d1f',
              }}
            >
              {mentor.approved
                ? '● Your profile is live in the mentor directory.'
                : '● Your profile is pending review and not yet public.'}
            </p>
          </div>

          <div style={cardStyle}>
            <p
              style={{
                fontSize: '0.7rem',
                color: '#9a948a',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                margin: '0 0 0.5rem',
              }}
            >
              Scheduling
            </p>
            <p className="text-[#4a4a5a]" style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6 }}>
              Google Calendar and Meet scheduling is coming soon. You&apos;ll be
              able to connect your calendar and see upcoming mentee sessions
              here.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-8" style={cardStyle}>
          <p
            style={{
              fontSize: '0.7rem',
              color: '#9a948a',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              margin: '0 0 0.5rem',
            }}
          >
            No linked profile
          </p>
          <p className="text-[#4a4a5a]" style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6 }}>
            We couldn&apos;t find a mentor profile for{' '}
            <strong>{user.email}</strong>. If you&apos;re an AP MED mentor, reach
            us at{' '}
            <a href="mailto:apmedpodcast@gmail.com" style={{ color: '#8a6a2f' }}>
              apmedpodcast@gmail.com
            </a>{' '}
            to get linked — or{' '}
            <Link href="/mentor-onboarding" style={{ color: '#8a6a2f' }}>
              apply to become a mentor
            </Link>
            .
          </p>
        </div>
      )}
    </section>
  )
}
