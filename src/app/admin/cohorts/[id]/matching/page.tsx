import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getMemberTrackMaps } from '@/lib/cohort-matching'
import { scoreMentor } from '@/lib/match'
import {
  COHORT_TRACKS,
  TRACK_LABELS,
  type CohortMatch,
  type CohortTrack,
} from '@/types/cohort'
import SelectMatchButton from './SelectMatchButton'
import MatchActions from './MatchActions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Matching · Admin | AP MED Mentors',
  robots: { index: false, follow: false },
}

// Cohort-scoped matching view (ascenso-prm.md §5.4): ranked candidate pairs per
// track, board selects → board_approved, admin activates → active + one intro
// email to each party. Candidates are computed on the fly — nothing persists
// until the board selects a pair.

type CohortMentor = {
  id: string
  first_name: string
  last_name: string
  specialty: string[] | null
  identity: string[] | null
  can_help_with: string[] | null
}

type CohortMentee = {
  id: string
  full_name: string
  interests: string[] | null
  identity: string[] | null
  help_with: string[] | null
}

type Candidate = {
  mentor: CohortMentor
  mentee: CohortMentee
  score: number
  menteeHasNoPrefs: boolean
}

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  padding: '1.25rem 1.5rem',
  boxShadow: '0 1px 3px rgba(26,26,46,0.04)',
}

// board_approved is the state an admin acts on (activate); active is the good
// end state; proposed/ended stay neutral.
const MATCH_CHIPS: Record<string, { bg: string; border: string; color: string }> = {
  board_approved: { bg: '#fdf6e3', border: '#e0c060', color: '#8a6d1f' },
  active: { bg: '#eaf6ef', border: '#9bd3b3', color: '#2f8f5f' },
}
const NEUTRAL_CHIP = { bg: '#f5f2ec', border: '#e8e4dc', color: '#6b6b6b' }

const STATUS_ORDER: Record<string, number> = {
  proposed: 0,
  board_approved: 1,
  active: 2,
  ended: 3,
}

function StatusChip({ status }: { status: string }) {
  const chip = MATCH_CHIPS[status] ?? NEUTRAL_CHIP
  return (
    <span
      style={{
        background: chip.bg,
        border: `1px solid ${chip.border}`,
        color: chip.color,
        borderRadius: '999px',
        padding: '0.15rem 0.6rem',
        fontSize: '0.72rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function mentorName(m: CohortMentor | undefined): string {
  return m ? `${m.first_name} ${m.last_name}`.trim() : 'Unknown member'
}

export default async function CohortMatchingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { adminUser } = await requireAdminSession()
  const { id: cohortId } = await params

  if (!canAccessCohort(adminUser, cohortId)) notFound()

  const admin = getSupabaseAdmin()
  // Malformed uuid → lookup error → same 404 as a miss.
  const { data: cohort } = await admin
    .from('cohorts')
    .select('id, name, org, status')
    .eq('id', cohortId)
    .maybeSingle()
  if (!cohort) notFound()

  // Cohort members are scoped by cohort_id ONLY. Deliberately NO `approved`
  // filter: promoted cohort mentor rows keep approved=false as defense in depth
  // (public surfaces require approved=true AND cohort_id IS NULL) — filtering
  // on it here would hide the entire cohort mentor pool.
  const [mentorsRes, menteesRes, matchesRes] = await Promise.all([
    admin
      .from('mentor')
      .select('id, first_name, last_name, specialty, identity, can_help_with')
      .eq('cohort_id', cohortId),
    admin
      .from('mentees')
      .select('id, full_name, interests, identity, help_with')
      .eq('cohort_id', cohortId),
    admin
      .from('cohort_matches')
      .select('*')
      .eq('cohort_id', cohortId)
      .order('created_at', { ascending: false }),
  ])
  if (mentorsRes.error) console.error('Cohort mentors fetch failed:', mentorsRes.error.message)
  if (menteesRes.error) console.error('Cohort mentees fetch failed:', menteesRes.error.message)
  if (matchesRes.error) console.error('Cohort matches fetch failed:', matchesRes.error.message)
  const mentors = (mentorsRes.data as CohortMentor[]) ?? []
  const mentees = (menteesRes.data as CohortMentee[]) ?? []
  const matches = ((matchesRes.data as CohortMatch[]) ?? [])
    .slice()
    .sort(
      (a, b) =>
        (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
        b.created_at.localeCompare(a.created_at),
    )

  const tracks = await getMemberTrackMaps(admin, cohortId)

  // Reviewer attribution for approved matches (display name over raw uuid).
  const approverIds = [...new Set(matches.map((m) => m.approved_by).filter(Boolean))] as string[]
  const approverNames = new Map<string, string>()
  if (approverIds.length > 0) {
    const { data: approvers } = await admin
      .from('admin_users')
      .select('id, display_name, email')
      .in('id', approverIds)
    for (const a of approvers ?? []) {
      approverNames.set(a.id, a.display_name ?? a.email)
    }
  }

  const mentorById = new Map(mentors.map((m) => [m.id, m]))
  const menteeById = new Map(mentees.map((m) => [m.id, m]))

  // A member in any live match (proposed/board_approved/active) leaves the
  // candidate pool; ended matches free both parties up again.
  const takenMentors = new Set<string>()
  const takenMentees = new Set<string>()
  for (const m of matches) {
    if (m.status === 'ended') continue
    takenMentors.add(m.mentor_id)
    takenMentees.add(m.mentee_id)
  }

  // Candidates per track: unmatched mentors × unmatched mentees, ranked by the
  // shared deterministic scorer. Members without an approved application on
  // file (no track) can't be matched and are surfaced below instead.
  const candidatesByTrack = new Map<CohortTrack, Candidate[]>()
  const freeCounts = new Map<CohortTrack, { mentors: number; mentees: number }>()
  if (tracks) {
    for (const track of COHORT_TRACKS) {
      const trackMentors = mentors.filter(
        (m) => tracks.mentorTrackById.get(m.id) === track && !takenMentors.has(m.id),
      )
      const trackMentees = mentees.filter(
        (m) => tracks.menteeTrackById.get(m.id) === track && !takenMentees.has(m.id),
      )
      freeCounts.set(track, { mentors: trackMentors.length, mentees: trackMentees.length })
      const pairs: Candidate[] = []
      for (const mentor of trackMentors) {
        for (const mentee of trackMentees) {
          const menteePrefs = {
            interests: Array.isArray(mentee.interests) ? mentee.interests : [],
            identity: Array.isArray(mentee.identity) ? mentee.identity : [],
            help_with: Array.isArray(mentee.help_with) ? mentee.help_with : [],
          }
          pairs.push({
            mentor,
            mentee,
            score: scoreMentor(
              {
                specialty: Array.isArray(mentor.specialty) ? mentor.specialty : [],
                identity: Array.isArray(mentor.identity) ? mentor.identity : [],
                can_help_with: Array.isArray(mentor.can_help_with) ? mentor.can_help_with : [],
              },
              menteePrefs,
            ),
            menteeHasNoPrefs:
              menteePrefs.interests.length === 0 &&
              menteePrefs.identity.length === 0 &&
              menteePrefs.help_with.length === 0,
          })
        }
      }
      pairs.sort(
        (a, b) =>
          b.score - a.score ||
          mentorName(a.mentor).localeCompare(mentorName(b.mentor)) ||
          a.mentee.full_name.localeCompare(b.mentee.full_name),
      )
      candidatesByTrack.set(track, pairs)
    }
  }

  const tracklessCount = tracks
    ? mentors.filter((m) => !tracks.mentorTrackById.has(m.id)).length +
      mentees.filter((m) => !tracks.menteeTrackById.has(m.id)).length
    : 0

  return (
    <>
      <p style={{ margin: 0 }}>
        <Link href="/admin" style={{ color: '#8a6a2f', fontSize: '0.85rem' }}>
          ← Cohorts
        </Link>
      </p>
      <h1
        className="text-[#1a1a2e]"
        style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400, marginTop: '0.5rem' }}
      >
        Matching
      </h1>
      <p className="text-[#6b6b6b]" style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
        {cohort.name} · {cohort.org} ·{' '}
        <Link
          href={`/admin/cohorts/${cohort.id}/applications`}
          style={{ color: '#8a6a2f' }}
        >
          Review applications →
        </Link>{' '}
        ·{' '}
        <Link href={`/admin/cohorts/${cohort.id}/milestones`} style={{ color: '#8a6a2f' }}>
          Milestones →
        </Link>{' '}
        ·{' '}
        <Link href={`/admin/cohorts/${cohort.id}/announcements`} style={{ color: '#8a6a2f' }}>
          Announcements →
        </Link>
      </p>

      <h2
        className="text-[#1a1a2e]"
        style={{ fontSize: '1.25rem', fontWeight: 400, margin: '2rem 0 0' }}
      >
        Matches
      </h2>
      {matches.length === 0 ? (
        <p className="text-[#6b6b6b]" style={{ margin: '0.75rem 0 0', fontSize: '0.9rem' }}>
          No matches selected yet — pick pairs from the candidates below.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {matches.map((match) => {
            const approver = match.approved_by ? approverNames.get(match.approved_by) : null
            return (
              <div key={match.id} style={cardStyle}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[#1a1a2e]" style={{ fontSize: '1.05rem' }}>
                    {mentorName(mentorById.get(match.mentor_id))} ↔{' '}
                    {menteeById.get(match.mentee_id)?.full_name ?? 'Unknown member'}
                  </span>
                  <StatusChip status={match.status} />
                </div>
                <p className="text-[#6b6b6b]" style={{ margin: '0.3rem 0 0.75rem', fontSize: '0.82rem' }}>
                  {TRACK_LABELS[match.track as CohortTrack] ?? match.track}
                  {match.score != null && <> · {Math.round(Number(match.score))}% score</>}
                  {approver && match.approved_at && (
                    <>
                      {' '}
                      · approved by {approver} on{' '}
                      {new Date(match.approved_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </>
                  )}
                </p>
                <MatchActions
                  matchId={match.id}
                  status={match.status}
                  mentorName={mentorName(mentorById.get(match.mentor_id))}
                  menteeName={menteeById.get(match.mentee_id)?.full_name ?? 'Unknown member'}
                />
              </div>
            )
          })}
        </div>
      )}

      <h2
        className="text-[#1a1a2e]"
        style={{ fontSize: '1.25rem', fontWeight: 400, margin: '2.5rem 0 0' }}
      >
        Candidates
      </h2>
      <p className="text-[#6b6b6b]" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', maxWidth: '46rem' }}>
        Scores are profile overlap (identity 40% · specialty 35% · mentorship
        needs 25%). Members who haven&apos;t filled in preferences yet score 100%
        by default, so until profiles carry data the score is a placeholder, not
        a signal — pairs marked &ldquo;no preference data&rdquo; are ranked by
        name, not by fit.
      </p>
      {tracklessCount > 0 && (
        <p className="text-[#8a6d1f]" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
          {tracklessCount} cohort {tracklessCount === 1 ? 'member has' : 'members have'}{' '}
          no approved application on file, so no track — they can&apos;t be matched until
          that&apos;s resolved.
        </p>
      )}

      {!tracks ? (
        <p style={{ margin: '1rem 0 0', fontSize: '0.9rem', color: '#a34a42' }}>
          Could not load member tracks — reload to try again.
        </p>
      ) : (
        <div className="mt-4 space-y-6">
          {COHORT_TRACKS.map((track) => {
            const pairs = candidatesByTrack.get(track) ?? []
            const free = freeCounts.get(track) ?? { mentors: 0, mentees: 0 }
            return (
              <div key={track} style={cardStyle}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3
                    className="text-[#1a1a2e]"
                    style={{ fontSize: '1.05rem', fontWeight: 400, margin: 0 }}
                  >
                    {TRACK_LABELS[track]}
                  </h3>
                  <span className="text-[#6b6b6b]" style={{ fontSize: '0.8rem' }}>
                    {free.mentors} unmatched {free.mentors === 1 ? 'mentor' : 'mentors'} ·{' '}
                    {free.mentees} unmatched {free.mentees === 1 ? 'mentee' : 'mentees'}
                  </span>
                </div>
                {pairs.length === 0 ? (
                  <p className="text-[#6b6b6b]" style={{ margin: '0.75rem 0 0', fontSize: '0.85rem' }}>
                    {free.mentors === 0 && free.mentees === 0
                      ? 'No unmatched members in this track.'
                      : free.mentors === 0
                        ? 'No unmatched mentors in this track yet.'
                        : 'No unmatched mentees in this track yet.'}
                  </p>
                ) : (
                  <div className="mt-2">
                    {pairs.map((pair) => (
                      <div
                        key={`${pair.mentor.id}:${pair.mentee.id}`}
                        className="flex flex-wrap items-center justify-between gap-2"
                        style={{ borderTop: '1px solid #f0ede6', padding: '0.6rem 0' }}
                      >
                        <span className="text-[#1a1a2e]" style={{ fontSize: '0.92rem' }}>
                          {mentorName(pair.mentor)} ↔ {pair.mentee.full_name}
                        </span>
                        <span className="flex flex-wrap items-center gap-3">
                          <span className="text-[#4a4a5a]" style={{ fontSize: '0.85rem' }}>
                            {pair.score}%
                            {pair.menteeHasNoPrefs && (
                              <span className="text-[#6b6b6b]" style={{ fontSize: '0.75rem' }}>
                                {' '}
                                · no preference data
                              </span>
                            )}
                          </span>
                          <SelectMatchButton
                            cohortId={cohort.id}
                            mentorId={pair.mentor.id}
                            menteeId={pair.mentee.id}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
