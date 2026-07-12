import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getMentorForUser, linkMentorByEmail } from '@/lib/mentor-link'
import {
  getGoogleTokenRow,
  getUpcomingSessions,
  getRequestedMentees,
  type UpcomingSession,
  type RequestedMentee,
} from '@/lib/sessions'
import SignOutButton from './SignOutButton'
import ScheduleSessionForm from './ScheduleSessionForm'
import SessionsList from './SessionsList'

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

const eyebrowStyle: CSSProperties = {
  fontSize: '0.7rem',
  color: '#9a948a',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  margin: '0 0 0.5rem',
}

const goldButton: CSSProperties = {
  display: 'inline-block',
  background: '#c8a96e',
  color: '#1a1a2e',
  padding: '0.6rem 1.4rem',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.9rem',
  textDecoration: 'none',
}

const CALENDAR_BANNERS: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'Google Calendar connected.' },
  denied: { ok: false, text: 'Calendar connection was cancelled.' },
  state_error: { ok: false, text: 'That connection attempt expired — please try again.' },
  no_profile: { ok: false, text: 'No mentor profile is linked to your account.' },
  no_refresh: {
    ok: false,
    text: "Google didn't grant offline access — please try connecting again.",
  },
  save_error: { ok: false, text: "We couldn't save your connection. Please try again." },
  connect_error: { ok: false, text: 'Something went wrong connecting your calendar.' },
  config_error: { ok: false, text: 'Calendar connection is not configured yet.' },
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const admin = getSupabaseAdmin()
  let mentor = await getMentorForUser(admin, user.id)

  // Fallback link attempt: covers a mentor row created (or its email corrected)
  // after the user's first sign-in, so the auth callback never linked it.
  if (!mentor && user.email) {
    const result = await linkMentorByEmail(admin, user.id, user.email)
    if (result.status === 'linked') {
      mentor = await getMentorForUser(admin, user.id)
    }
  }

  const { calendar } = await searchParams
  const banner = calendar ? CALENDAR_BANNERS[calendar] : undefined

  // Calendar/session data is only relevant for a linked mentor.
  let connected = false
  let googleEmail: string | null = null
  let upcoming: UpcomingSession[] = []
  let mentees: RequestedMentee[] = []
  if (mentor) {
    const [tokenRow, up, requested] = await Promise.all([
      getGoogleTokenRow(admin, mentor.id),
      getUpcomingSessions(admin, mentor.id),
      getRequestedMentees(admin, mentor.id),
    ])
    connected = !!tokenRow
    googleEmail = tokenRow?.google_email ?? null
    upcoming = up
    mentees = requested
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

      {banner && (
        <p
          className="mt-6"
          style={{
            background: banner.ok ? '#eaf6ef' : '#fdf6e3',
            border: `1px solid ${banner.ok ? '#9bd3b3' : '#e0c060'}`,
            color: banner.ok ? '#2f8f5f' : '#8a6d1f',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            fontSize: '0.9rem',
          }}
        >
          {banner.text}
        </p>
      )}

      {mentor ? (
        <div className="mt-8 space-y-6">
          <div style={cardStyle}>
            <p style={eyebrowStyle}>Google Calendar</p>
            {connected ? (
              <>
                <p className="text-[#4a4a5a]" style={{ margin: 0, fontSize: '0.95rem' }}>
                  Connected as <strong>{googleEmail ?? 'your Google account'}</strong>.
                  New sessions are added to this calendar with a Meet link.
                </p>
                <p style={{ margin: '0.75rem 0 0' }}>
                  <a href="/api/google/connect" style={{ color: '#8a6a2f', fontSize: '0.85rem' }}>
                    Reconnect
                  </a>
                </p>
              </>
            ) : (
              <>
                <p
                  className="text-[#4a4a5a]"
                  style={{ margin: '0 0 1rem', fontSize: '0.95rem', lineHeight: 1.6 }}
                >
                  Connect your Google Calendar to schedule sessions with an
                  automatic Meet link and calendar invite for you and your mentee.
                </p>
                <a href="/api/google/connect" style={goldButton}>
                  Connect Google Calendar
                </a>
              </>
            )}
          </div>

          {connected && (
            <div style={cardStyle}>
              <p style={eyebrowStyle}>Schedule a session</p>
              {mentees.length > 0 ? (
                <ScheduleSessionForm mentees={mentees} />
              ) : (
                <p className="text-[#6b6b6b]" style={{ margin: 0, fontSize: '0.95rem' }}>
                  Once a mentee requests you, you&apos;ll be able to schedule a
                  session with them here.
                </p>
              )}
            </div>
          )}

          <div style={cardStyle}>
            <p style={eyebrowStyle}>Upcoming sessions</p>
            <SessionsList sessions={upcoming} />
          </div>
        </div>
      ) : (
        <div className="mt-8" style={cardStyle}>
          <p style={eyebrowStyle}>No linked profile</p>
          <p className="text-[#4a4a5a]" style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6 }}>
            We couldn&apos;t find a mentor profile for <strong>{user.email}</strong>.
            If you&apos;re an AP MED mentor, reach us at{' '}
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
