import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getMentorForUser, linkMentorByEmail } from '@/lib/mentor-link'
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
import {
  getMeetingLogsForMatches,
  getLoggableSessionsForMember,
  type MeetingLogView,
  type LoggableSession,
} from '@/lib/meeting-logs'
import { getGoalsForMatches, type GoalView } from '@/lib/goals'
import { getAdminUserByEmail } from '@/lib/admin'
import {
  getAvailability,
  getGoogleTokenRow,
  getUpcomingSessions,
  getUpcomingSessionsForMentee,
  getRequestedMentees,
  type MentorAvailability,
  type UpcomingSession,
  type MenteeUpcomingSession,
  type RequestedMentee,
} from '@/lib/sessions'
import SignOutButton from './SignOutButton'
import AvailabilityForm from './AvailabilityForm'
import ScheduleSessionForm from './ScheduleSessionForm'
import SessionsList from './SessionsList'
import MenteeSessionsList from './MenteeSessionsList'
import CohortMemberPanel from './CohortMemberPanel'
import MeetingLogSection from './MeetingLogSection'
import GoalSection from './GoalSection'

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
  // after the user's first sign-in, so the auth callback never linked it. Note
  // getMentorForUser does NOT filter on `approved` — a cohort mentor row is
  // approved=false by design and must still resolve for its own owner.
  if (!mentor && user.email) {
    const result = await linkMentorByEmail(admin, user.id, user.email)
    if (result.status === 'linked') {
      // Use the row returned by the link call directly. Re-reading via
      // getMentorForUser here would hit Next.js request memoization and return
      // the same empty result as the first call above, despite the just-written
      // auth_user_id claim.
      mentor = result.mentor
    }
  }

  // A user is a mentor OR a cohort mentee, never both — only look for a cohort
  // mentee row when no mentor matched. The link + lookup are scoped to cohort
  // mentees only; a general-platform (auth-less) mentee is never claimed.
  let cohortMentee: LinkedCohortMentee | null = null
  if (!mentor) {
    cohortMentee = await getCohortMenteeForUser(admin, user.id)
    // Fallback claim: covers a cohort mentee row created after the user's first
    // sign-in (so the auth callback never linked it). linkCohortMenteeByEmail
    // returns the resolved row directly — re-reading by auth_user_id here would
    // be request-memoized against the (empty) lookup above and come back stale.
    if (!cohortMentee && user.email) {
      const result = await linkCohortMenteeByEmail(admin, user.id, user.email)
      if (result.status === 'linked') {
        cohortMentee = result.mentee
      }
    }
  }

  // Cohort admins get a link into the admin panel from here — /admin has no
  // public nav entry.
  const adminUser = user.email ? await getAdminUserByEmail(user.email) : null

  const { calendar } = await searchParams
  const banner = calendar ? CALENDAR_BANNERS[calendar] : undefined

  // Calendar/session data is only relevant for a linked mentor.
  let connected = false
  let googleEmail: string | null = null
  let upcoming: UpcomingSession[] = []
  let mentees: RequestedMentee[] = []
  let availability: MentorAvailability | null = null
  if (mentor) {
    const [tokenRow, up, requested, avail] = await Promise.all([
      getGoogleTokenRow(admin, mentor.id),
      getUpcomingSessions(admin, mentor.id),
      getRequestedMentees(admin, mentor.id),
      getAvailability(admin, mentor.id),
    ])
    connected = !!tokenRow
    googleEmail = tokenRow?.google_email ?? null
    upcoming = up
    mentees = requested
    availability = avail
  }

  // Cohort context — resolved from the member's OWN row and scoped to it (P0
  // §6.3). A cohort mentor gets its match/onboarding alongside the mentor tools
  // above; a cohort mentee gets a dashboard of its own. Only status='active'
  // matches are ever fetched — pre-activation pairings never reach a member.
  let cohortName = ''
  let cohortRole: 'mentor' | 'mentee' | null = null
  let cohortMatches: ActiveMatchView[] = []
  let cohortMilestones: MilestoneView[] = []
  let menteeSessions: MenteeUpcomingSession[] = []
  let meetingLogs: MeetingLogView[] = []
  let loggableSessions: Record<string, LoggableSession[]> = {}
  let goals: GoalView[] = []

  let memberRef: CohortMemberRef | null = null
  if (mentor?.cohort_id) {
    memberRef = { type: 'mentor', memberId: mentor.id, cohortId: mentor.cohort_id }
    cohortRole = 'mentor'
  } else if (cohortMentee) {
    memberRef = { type: 'mentee', memberId: cohortMentee.id, cohortId: cohortMentee.cohort_id }
    cohortRole = 'mentee'
  }

  if (memberRef) {
    const ref = memberRef
    ;[cohortName, cohortMatches, cohortMilestones] = await Promise.all([
      getCohortName(admin, ref.cohortId),
      getActiveMatchesForMember(admin, ref),
      getMemberOnboarding(admin, ref),
    ])
    // Meeting logs (§5.8) and goals (§7.10) both need the resolved match ids, so
    // they follow the match fetch. loggableSessions re-derives the member's
    // active matches itself. All scoped to the member's OWN matches (§6.3 P0).
    const ownMatchIds = cohortMatches.map((m) => m.matchId)
    ;[meetingLogs, loggableSessions, menteeSessions, goals] = await Promise.all([
      getMeetingLogsForMatches(admin, ref.cohortId, ownMatchIds, {
        type: ref.type,
        memberId: ref.memberId,
      }),
      getLoggableSessionsForMember(admin, ref),
      ref.type === 'mentee'
        ? getUpcomingSessionsForMentee(admin, ref.memberId)
        : Promise.resolve<MenteeUpcomingSession[]>([]),
      getGoalsForMatches(admin, ref.cohortId, ownMatchIds),
    ])
  }

  const meetingLogMatches = cohortMatches.map((m) => ({
    matchId: m.matchId,
    partnerName: m.partnerName,
  }))

  const eyebrowLabel = cohortRole === 'mentee' ? 'Member Dashboard' : 'Mentor Dashboard'
  const welcomeName = mentor
    ? mentor.first_name
    : cohortMentee
      ? cohortMentee.full_name.trim().split(/\s+/)[0]
      : null

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
        {eyebrowLabel}
      </p>
      <h1
        className="text-[#1a1a2e]"
        style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400 }}
      >
        {welcomeName ? `Welcome, ${welcomeName}` : 'Welcome'}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-[#6b6b6b]" style={{ fontSize: '0.9rem' }}>
          Signed in as {user.email}
        </span>
        <SignOutButton />
        {adminUser && (
          <Link
            href="/admin"
            style={{ color: '#8a6a2f', fontSize: '0.9rem', fontWeight: 600 }}
          >
            Admin panel →
          </Link>
        )}
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
          {cohortRole === 'mentor' && (
            <>
              <CohortMemberPanel
                cohortName={cohortName}
                role="mentor"
                matches={cohortMatches}
                milestones={cohortMilestones}
              />
              {meetingLogMatches.length > 0 && (
                <MeetingLogSection
                  role="mentor"
                  matches={meetingLogMatches}
                  logs={meetingLogs}
                  loggableSessions={loggableSessions}
                />
              )}
              {meetingLogMatches.length > 0 && (
                <GoalSection role="mentor" matches={meetingLogMatches} goals={goals} />
              )}
            </>
          )}
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

          <div style={cardStyle}>
            <p style={eyebrowStyle}>Bookable hours</p>
            {!connected && (
              <p
                style={{
                  background: '#fdf6e3',
                  border: '1px solid #e0c060',
                  color: '#8a6d1f',
                  borderRadius: '8px',
                  padding: '0.6rem 0.9rem',
                  fontSize: '0.85rem',
                  margin: '0 0 1rem',
                }}
              >
                Connect your Google Calendar above to activate online booking —
                hours you set here are offered to mentees only once your busy
                times can be checked.
              </p>
            )}
            <AvailabilityForm
              initialTimezone={availability?.timezone ?? null}
              initialRules={availability?.rules ?? []}
            />
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
      ) : cohortMentee ? (
        <div className="mt-8 space-y-6">
          <CohortMemberPanel
            cohortName={cohortName}
            role="mentee"
            matches={cohortMatches}
            milestones={cohortMilestones}
          />
          {meetingLogMatches.length > 0 && (
            <MeetingLogSection
              role="mentee"
              matches={meetingLogMatches}
              logs={meetingLogs}
              loggableSessions={loggableSessions}
            />
          )}
          {meetingLogMatches.length > 0 && (
            <GoalSection role="mentee" matches={meetingLogMatches} goals={goals} />
          )}
          <div style={cardStyle}>
            <p style={eyebrowStyle}>Upcoming sessions</p>
            <MenteeSessionsList sessions={menteeSessions} />
          </div>
        </div>
      ) : (
        <div className="mt-8" style={cardStyle}>
          <p style={eyebrowStyle}>No linked profile</p>
          <p className="text-[#4a4a5a]" style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6 }}>
            We couldn&apos;t find an AP MED profile linked to <strong>{user.email}</strong>.
            If you&apos;re an AP MED mentor or an Ascenso cohort member, reach us at{' '}
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
