import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  getCohortMenteeForUser,
  linkCohortMenteeByEmail,
  type LinkedCohortMentee,
} from '@/lib/mentee-link'
import {
  getActiveMatchesForMember,
  getMemberOnboarding,
  getCohortName,
  type ActiveMatchView,
  type MilestoneView,
  type CohortMemberRef,
} from '@/lib/cohort-dashboard'
import { getMeetingLogsForMatches, type MeetingLogView } from '@/lib/meeting-logs'
import { getGoalsForMatches, type GoalView } from '@/lib/goals'
import { getBookingInfoForMember, type MatchBookingInfo } from '@/lib/cohort-sessions'
import { getMemberSurveys, type MemberSurveyView } from '@/lib/surveys'
import { getUpcomingSessionsForMentee, type MenteeUpcomingSession } from '@/lib/sessions'
import SignOutButton from '@/app/dashboard/SignOutButton'
import CohortMemberPanel from '@/app/dashboard/CohortMemberPanel'
import MeetingLogSection from '@/app/dashboard/MeetingLogSection'
import GoalSection from '@/app/dashboard/GoalSection'
import CohortBookingSection, { type BookingMatch } from '@/app/dashboard/CohortBookingSection'
import MenteeSessionsList from '@/app/dashboard/MenteeSessionsList'
import SurveySection from '@/app/dashboard/SurveySection'
import SignInLinkForm from './SignInLinkForm'

/**
 * The Ascenso MENTEE dashboard — the landing point of the magic-link flow
 * (/ascenso/auth/callback), and deliberately its own route.
 *
 * /dashboard is the mentor surface: it's reached by Google OAuth from /login and
 * carries mentor tooling (calendar connection, bookable hours, session
 * scheduling). Neither this page nor the magic-link callback touches that route
 * or its sign-in, so the two auth strategies stay independent — a change to
 * either one can't silently reshape the other.
 *
 * Sections, per the mentee's side of the program:
 *   - meeting log, READ-ONLY: the mentor records meetings, the mentee reads them
 *   - shared goals, editable by either party (a goal belongs to the match)
 *   - session booking against the mentor's bookable hours (reuses the same
 *     freebusy/booking component and route as the mentor-initiated flow)
 *
 * SECURITY (§6.3 P0): every read is scoped through a CohortMemberRef resolved
 * from the session's own mentee row — never from anything in the URL — and only
 * status='active' matches are fetched, so a pre-activation pairing never
 * surfaces. The write routes re-verify party membership independently.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your Ascenso Dashboard | AP MED',
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

const SIGN_IN_BANNERS: Record<string, string> = {
  link_expired:
    'That sign-in link has expired or was already used — send yourself a fresh one below.',
  missing_token: 'That sign-in link was incomplete. Request a new one below.',
}

export default async function AscensoDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const banner = error ? (SIGN_IN_BANNERS[error] ?? SIGN_IN_BANNERS.link_expired) : null

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Signed out: no redirect to /login — that's the mentor's Google flow. The
  // mentee's way in is a fresh magic link, so offer it right here.
  if (!user) {
    return (
      <Shell>
        {banner && <Banner>{banner}</Banner>}
        <div className="mt-6" style={cardStyle}>
          <p style={eyebrowStyle}>Sign in</p>
          <p
            className="text-[#4a4a5a]"
            style={{ margin: '0 0 1.25rem', fontSize: '0.95rem', lineHeight: 1.6 }}
          >
            Ascenso mentees sign in with a one-time link — no password. Enter the
            email address on your application and we&apos;ll send you one.
          </p>
          <SignInLinkForm />
        </div>
      </Shell>
    )
  }

  const admin = getSupabaseAdmin()
  let mentee: LinkedCohortMentee | null = await getCohortMenteeForUser(admin, user.id)

  // Fallback claim: covers a mentee row created (or its email corrected) after
  // this user's first sign-in, so the callback never linked it.
  // linkCohortMenteeByEmail returns the resolved row directly — re-reading by
  // auth_user_id here would be request-memoized against the (empty) lookup above
  // and come back stale.
  if (!mentee && user.email) {
    const result = await linkCohortMenteeByEmail(admin, user.id, user.email)
    if (result.status === 'linked') mentee = result.mentee
  }

  if (!mentee) {
    return (
      <Shell>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="text-[#6b6b6b]" style={{ fontSize: '0.9rem' }}>
            Signed in as {user.email}
          </span>
          <SignOutButton />
        </div>
        <div className="mt-6" style={cardStyle}>
          <p style={eyebrowStyle}>No linked profile</p>
          <p
            className="text-[#4a4a5a]"
            style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6 }}
          >
            We couldn&apos;t find an Ascenso mentee profile linked to{' '}
            <strong>{user.email}</strong>. Cohort dashboards open once the board
            approves your application and activates your match — if you think
            that&apos;s already happened, reach us at{' '}
            <a href="mailto:apmedpodcast@gmail.com" style={{ color: '#8a6a2f' }}>
              apmedpodcast@gmail.com
            </a>{' '}
            and we&apos;ll get you linked. Not applied yet?{' '}
            <Link href="/ascenso" style={{ color: '#8a6a2f' }}>
              Read about Ascenso
            </Link>
            .
          </p>
        </div>
      </Shell>
    )
  }

  const ref: CohortMemberRef = {
    type: 'mentee',
    memberId: mentee.id,
    cohortId: mentee.cohort_id,
  }

  // Surveys are cohort-wide (scoped to the member's cohort + id, not to a
  // match), so they resolve alongside the match/onboarding fetch.
  const [cohortName, matches, milestones, openSurveys]: [
    string,
    ActiveMatchView[],
    MilestoneView[],
    MemberSurveyView[],
  ] = await Promise.all([
    getCohortName(admin, ref.cohortId),
    getActiveMatchesForMember(admin, ref),
    getMemberOnboarding(admin, ref),
    getMemberSurveys(admin, ref),
  ])

  // Match-scoped reads follow, keyed to the ids just resolved from the mentee's
  // OWN active matches.
  const ownMatchIds = matches.map((m) => m.matchId)
  const [meetingLogs, goals, bookingInfo, upcoming]: [
    MeetingLogView[],
    GoalView[],
    Record<string, MatchBookingInfo>,
    MenteeUpcomingSession[],
  ] = await Promise.all([
    getMeetingLogsForMatches(admin, ref.cohortId, ownMatchIds, {
      type: 'mentee',
      memberId: ref.memberId,
    }),
    getGoalsForMatches(admin, ref.cohortId, ownMatchIds),
    getBookingInfoForMember(admin, ref),
    getUpcomingSessionsForMentee(admin, ref.memberId),
  ])

  const matchOptions = matches.map((m) => ({
    matchId: m.matchId,
    partnerName: m.partnerName,
  }))

  const bookingMatches: BookingMatch[] = matches
    .map((m) => {
      const info = bookingInfo[m.matchId]
      return info ? { matchId: m.matchId, partnerName: m.partnerName, info } : null
    })
    .filter((m): m is BookingMatch => m !== null)

  const firstName = mentee.full_name.trim().split(/\s+/)[0]

  return (
    <Shell heading={firstName ? `Welcome, ${firstName}` : 'Welcome'}>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-[#6b6b6b]" style={{ fontSize: '0.9rem' }}>
          Signed in as {user.email}
        </span>
        <SignOutButton />
      </div>

      <div className="mt-8 space-y-6">
        <CohortMemberPanel
          cohortName={cohortName}
          role="mentee"
          matches={matches}
          milestones={milestones}
        />

        {openSurveys.length > 0 && <SurveySection surveys={openSurveys} />}

        {bookingMatches.length > 0 && (
          <CohortBookingSection role="mentee" matches={bookingMatches} />
        )}

        {matchOptions.length > 0 && (
          <>
            <GoalSection role="mentee" matches={matchOptions} goals={goals} />
            {/* readOnly: the mentor keeps the log, the mentee reads it. */}
            <MeetingLogSection
              role="mentee"
              matches={matchOptions}
              logs={meetingLogs}
              loggableSessions={{}}
              readOnly
            />
          </>
        )}

        <div style={cardStyle}>
          <p style={eyebrowStyle}>Upcoming sessions</p>
          <MenteeSessionsList sessions={upcoming} />
        </div>
      </div>
    </Shell>
  )
}

function Shell({
  heading = 'Your Ascenso dashboard',
  children,
}: {
  heading?: string
  children: React.ReactNode
}) {
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
        Ascenso · LMSA-NE
      </p>
      <h1
        className="text-[#1a1a2e]"
        style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400 }}
      >
        {heading}
      </h1>
      {children}
    </section>
  )
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mt-6"
      style={{
        background: '#fdf6e3',
        border: '1px solid #e0c060',
        color: '#8a6d1f',
        borderRadius: '8px',
        padding: '0.75rem 1rem',
        fontSize: '0.9rem',
        maxWidth: '34rem',
      }}
    >
      {children}
    </p>
  )
}
