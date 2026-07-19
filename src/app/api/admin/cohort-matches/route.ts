export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getMemberTrackMaps } from '@/lib/cohort-matching'
import { scoreMentor } from '@/lib/match'

// Board match selection (ascenso-prm.md §5.4): POST records a board-selected
// pair as a cohort_matches row with status `board_approved`. The click IS the
// board approval — activation (and the emails) is a separate explicit action on
// /api/admin/cohort-matches/[id]. Everything consequential is re-derived
// server-side: cohort membership, track (from the approved applications), and
// score — the client only names the pair. Same non-probeable posture as the
// other admin routes: 401 anon, 404 non-admin/wrong-cohort.

export async function POST(request: Request) {
  try {
    const session = await resolveAdminSession()
    if (session.status === 'unauthenticated') {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    if (session.status === 'not_admin') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const { adminUser } = session

    const body = await request.json().catch(() => ({}))
    const cohortId = String(body.cohortId ?? '')
    const mentorId = String(body.mentorId ?? '')
    const menteeId = String(body.menteeId ?? '')
    if (!cohortId || !mentorId || !menteeId) {
      return NextResponse.json({ error: 'Missing ids' }, { status: 400 })
    }

    if (!canAccessCohort(adminUser, cohortId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const admin = getSupabaseAdmin()
    // Malformed uuid → lookup error → same 404 as a miss.
    const { data: cohort, error: cohortError } = await admin
      .from('cohorts')
      .select('id')
      .eq('id', cohortId)
      .maybeSingle()
    if (cohortError || !cohort) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Both members must belong to this cohort. Scoped by cohort_id ONLY — no
    // `approved` filter: promoted cohort mentor rows keep approved=false as
    // defense in depth (public surfaces need approved=true AND cohort_id IS
    // NULL), so filtering on it here would hide every cohort mentor.
    const [mentorRes, menteeRes] = await Promise.all([
      admin
        .from('mentor')
        .select('id, specialty, identity, can_help_with')
        .eq('id', mentorId)
        .eq('cohort_id', cohortId)
        .maybeSingle(),
      admin
        .from('mentees')
        .select('id, interests, identity, help_with')
        .eq('id', menteeId)
        .eq('cohort_id', cohortId)
        .maybeSingle(),
    ])
    if (mentorRes.error || !mentorRes.data || menteeRes.error || !menteeRes.data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const mentor = mentorRes.data
    const mentee = menteeRes.data

    // Track comes from the approved applications, and the pair must share one
    // (§5.4: an attending_ms mentor only matches attending_ms mentees).
    const tracks = await getMemberTrackMaps(admin, cohortId)
    if (!tracks) {
      return NextResponse.json({ error: 'Could not resolve tracks' }, { status: 500 })
    }
    const mentorTrack = tracks.mentorTrackById.get(mentor.id)
    const menteeTrack = tracks.menteeTrackById.get(mentee.id)
    if (!mentorTrack || !menteeTrack) {
      return NextResponse.json(
        { error: 'No approved application (and so no track) on file for this member' },
        { status: 400 },
      )
    }
    if (mentorTrack !== menteeTrack) {
      return NextResponse.json(
        { error: 'Mentor and mentee are on different tracks' },
        { status: 400 },
      )
    }

    const score = scoreMentor(mentor, {
      interests: Array.isArray(mentee.interests) ? mentee.interests : [],
      identity: Array.isArray(mentee.identity) ? mentee.identity : [],
      help_with: Array.isArray(mentee.help_with) ? mentee.help_with : [],
    })

    const { data: created, error: insertError } = await admin
      .from('cohort_matches')
      .insert([
        {
          cohort_id: cohortId,
          mentor_id: mentor.id,
          mentee_id: mentee.id,
          track: mentorTrack,
          score,
          status: 'board_approved',
          approved_by: adminUser.id,
          approved_at: new Date().toISOString(),
        },
      ])
      .select('id')
      .single()

    if (insertError || !created) {
      // unique (cohort_id, mentor_id, mentee_id) → the pair is already selected.
      if (insertError?.code === '23505') {
        return NextResponse.json(
          { error: 'This pair already has a match row' },
          { status: 409 },
        )
      }
      console.error('Match insert failed:', insertError?.message)
      return NextResponse.json({ error: 'Could not save the match' }, { status: 500 })
    }

    return NextResponse.json({ success: true, matchId: created.id, score })
  } catch (err) {
    console.error('Match selection crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
