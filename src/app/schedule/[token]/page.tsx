import type { Metadata } from 'next'
import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { hashScheduleToken } from '@/lib/crypto'
import {
  getAvailability,
  getMentorAccessToken,
  getScheduledBusyIntervals,
} from '@/lib/sessions'
import { queryFreeBusy } from '@/lib/google'
import {
  computeOpenSlots,
  BOOKING_HORIZON_DAYS,
  type BusyInterval,
} from '@/lib/availability'
import SlotPicker from './SlotPicker'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Schedule a session | AP MED Mentors',
  // Tokenized capability URLs must never be indexed (robots.ts also disallows
  // /schedule/ site-wide).
  robots: { index: false, follow: false },
}

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(26,26,46,0.04)',
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section style={{ maxWidth: '640px', margin: '0 auto' }}>
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
        Schedule a session
      </p>
      {children}
    </section>
  )
}

function InfoCard({ heading, body }: { heading: string; body: ReactNode }) {
  return (
    <Shell>
      <h1
        className="text-[#1a1a2e]"
        style={{ fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 400 }}
      >
        {heading}
      </h1>
      <div className="mt-6" style={cardStyle}>
        <p
          className="text-[#4a4a5a]"
          style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6 }}
        >
          {body}
        </p>
      </div>
      <p className="mt-6" style={{ fontSize: '0.9rem' }}>
        <Link href="/mentors" style={{ color: '#8a6a2f' }}>
          Browse mentors →
        </Link>
      </p>
    </Shell>
  )
}

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const admin = getSupabaseAdmin()

  // The token is a bearer capability: look it up by hash, check expiry. An
  // invalid and an expired link get the same friendly dead-end (no oracle).
  const { data: requestRow, error: requestErr } = await admin
    .from('mentee_requests')
    .select('id, mentor_id, mentee_id, schedule_token_expires_at')
    .eq('schedule_token_hash', hashScheduleToken(token))
    .maybeSingle()

  if (requestErr) {
    console.error('Schedule token lookup failed:', requestErr.message)
  }
  const expired =
    requestRow?.schedule_token_expires_at &&
    Date.parse(String(requestRow.schedule_token_expires_at)) < Date.now()

  if (!requestRow || expired) {
    return (
      <InfoCard
        heading="This link isn't valid anymore"
        body={
          <>
            This scheduling link has expired or doesn&apos;t exist. If you
            requested a mentor recently, check your confirmation email for the
            current link — or reach us at{' '}
            <a href="mailto:mentors@ap-med.org" style={{ color: '#8a6a2f' }}>
              mentors@ap-med.org
            </a>{' '}
            and we&apos;ll get you connected.
          </>
        }
      />
    )
  }

  // Only ever hand public profile fields to this page. Cohort mentors are not
  // reachable through the public flow (cohort_id — migration 0006, already
  // live in prod).
  const { data: mentor } = await admin
    .from('mentor')
    .select('first_name, last_name, credentials, current_role, institution')
    .eq('id', requestRow.mentor_id)
    .eq('approved', true)
    .is('cohort_id', null)
    .maybeSingle()

  if (!mentor) {
    return (
      <InfoCard
        heading="This link isn't valid anymore"
        body={
          <>
            We couldn&apos;t find the mentor for this link. Reach us at{' '}
            <a href="mailto:mentors@ap-med.org" style={{ color: '#8a6a2f' }}>
              mentors@ap-med.org
            </a>{' '}
            and we&apos;ll help you out.
          </>
        }
      />
    )
  }

  const mentorName = `${mentor.first_name} ${mentor.last_name}`
  const fallback = (
    <InfoCard
      heading={`You're all set with ${mentor.first_name}`}
      body={
        <>
          Your request has reached <strong>{mentorName}</strong>. Online booking
          isn&apos;t available for this mentor yet, so they&apos;ll reach out to
          you by email to find a time — keep an eye on your inbox.
        </>
      }
    />
  )

  // Self-serve slots need both bookable hours and a live calendar connection;
  // missing either degrades to "your mentor will reach out" (never an error).
  const availability = await getAvailability(admin, requestRow.mentor_id)
  if (!availability || availability.rules.length === 0) return fallback

  let accessToken: string | null
  try {
    accessToken = await getMentorAccessToken(admin, requestRow.mentor_id)
  } catch (err) {
    console.error('Schedule page: mentor token unusable (reconnect needed?):', err)
    return fallback
  }
  if (!accessToken) return fallback

  const now = new Date()
  const windowEnd = new Date(now.getTime() + BOOKING_HORIZON_DAYS * 86_400_000)

  let busy: BusyInterval[]
  try {
    busy = await queryFreeBusy({
      accessToken,
      timeMinISO: now.toISOString(),
      timeMaxISO: windowEnd.toISOString(),
    })
  } catch (err) {
    // Includes GoogleReconnectNeededError (pre-freebusy grant): the mentee just
    // sees the graceful fallback; the mentor-facing fix is the Reconnect link.
    console.error('Schedule page: freebusy unavailable:', err)
    return fallback
  }

  // Belt and braces: also block out already-booked platform sessions (covers
  // ?test=1 sessions that never created a Google event).
  busy = busy.concat(
    await getScheduledBusyIntervals(
      admin,
      requestRow.mentor_id,
      now.toISOString(),
      windowEnd.toISOString(),
      availability.slotMinutes,
    ),
  )

  const slots = computeOpenSlots({
    rules: availability.rules,
    timezone: availability.timezone,
    slotMinutes: availability.slotMinutes,
    busy,
  })

  if (slots.length === 0) {
    return (
      <InfoCard
        heading={`${mentor.first_name} is fully booked right now`}
        body={
          <>
            <strong>{mentorName}</strong> has no open times in the next two
            weeks. Check back here in a few days — this link keeps working — or
            they&apos;ll reach out to you by email.
          </>
        }
      />
    )
  }

  return (
    <Shell>
      <h1
        className="text-[#1a1a2e]"
        style={{ fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 400 }}
      >
        Book a session with {mentorName}
      </h1>
      <p className="mt-2 text-[#4a4a5a]" style={{ fontSize: '0.95rem', lineHeight: 1.6 }}>
        {[mentor.credentials, mentor.current_role, mentor.institution]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <p className="mt-1 text-[#6b6b6b]" style={{ fontSize: '0.9rem' }}>
        Pick a 30-minute slot — you&apos;ll both get a calendar invite with a
        Google Meet link.
      </p>
      <div className="mt-6" style={cardStyle}>
        <SlotPicker token={token} mentorFirstName={mentor.first_name} slots={slots} />
      </div>
    </Shell>
  )
}
