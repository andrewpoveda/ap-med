export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { notifyCohortMatchActivated } from '@/lib/email'
import { isValidEmail } from '@/lib/validate'
import type { AdminUser } from '@/lib/admin'
import type { CohortMatch } from '@/types/cohort'
import type { SupabaseClient } from '@supabase/supabase-js'

// Match lifecycle actions (ascenso-prm.md §5.4). PATCH `approve` moves a
// proposed row to board_approved (only used if rows are ever seeded as
// `proposed`, e.g. by hand in SQL — the UI's Select creates board_approved rows
// directly); PATCH `activate` is the go-live step: status → active + one
// introduction email to each party, logged in email_log and refused past the
// 90/day soft cap (Resend free tier is 100/day). `active` is reachable ONLY
// from board_approved — no auto-matching goes live without board approval.
// DELETE un-selects a not-yet-active row so the pair returns to the candidate
// list. Same posture as the other admin routes: 401 anon, 404 non-admin or
// wrong cohort, non-probeable.

const DAILY_EMAIL_SOFT_CAP = 90

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireMatch(ctx)
    if ('response' in gate) return gate.response
    const { admin, adminUser, match } = gate

    const body = await request.json().catch(() => ({}))
    const action = String(body.action ?? '')

    if (action === 'approve') {
      return approveMatch(admin, adminUser, match)
    }
    if (action === 'activate') {
      const dryRun = new URL(request.url).searchParams.get('test') === '1'
      return activateMatch(admin, match, dryRun)
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('Match action crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireMatch(ctx)
    if ('response' in gate) return gate.response
    const { admin, match } = gate

    // Conditional delete: an active/ended match is history (and meeting logs
    // may reference it) — only unactivated selections can be removed.
    const { data: deleted, error } = await admin
      .from('cohort_matches')
      .delete()
      .eq('id', match.id)
      .in('status', ['proposed', 'board_approved'])
      .select('id')

    if (error) {
      console.error('Match delete failed:', error.message)
      return NextResponse.json({ error: 'Could not remove the match' }, { status: 500 })
    }
    if (!deleted || deleted.length === 0) {
      return NextResponse.json(
        { error: 'Only a not-yet-active selection can be removed' },
        { status: 409 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Match delete crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Shared gate: admin session → match row → cohort access. Non-probeable 404s. */
async function requireMatch(ctx: { params: Promise<{ id: string }> }): Promise<
  | { response: NextResponse }
  | { admin: SupabaseClient; adminUser: AdminUser; match: CohortMatch }
> {
  const session = await resolveAdminSession()
  if (session.status === 'unauthenticated') {
    return { response: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  }
  if (session.status === 'not_admin') {
    return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }

  const { id } = await ctx.params
  const admin = getSupabaseAdmin()
  // Malformed uuid → lookup error → same 404 as a miss.
  const { data, error } = await admin
    .from('cohort_matches')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) {
    return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  const match = data as CohortMatch

  if (!canAccessCohort(session.adminUser, match.cohort_id)) {
    return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  return { admin, adminUser: session.adminUser, match }
}

async function approveMatch(
  admin: SupabaseClient,
  adminUser: AdminUser,
  match: CohortMatch,
) {
  // Conditional update = race guard: only a proposed row can be approved.
  const { data: updated, error } = await admin
    .from('cohort_matches')
    .update({
      status: 'board_approved',
      approved_by: adminUser.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', match.id)
    .eq('status', 'proposed')
    .select('id')

  if (error) {
    console.error('Match approve failed:', error.message)
    return NextResponse.json({ error: 'Could not approve the match' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: 'Only a proposed match can be board-approved' },
      { status: 409 },
    )
  }
  return NextResponse.json({ success: true, status: 'board_approved' })
}

async function activateMatch(
  admin: SupabaseClient,
  match: CohortMatch,
  dryRun: boolean,
) {
  if (match.status !== 'board_approved') {
    return NextResponse.json(
      { error: 'Only a board-approved match can be activated' },
      { status: 409 },
    )
  }

  // Recipients are resolved server-side from the member rows, still scoped to
  // the match's cohort (and with no `approved` filter — see the select route).
  const [mentorRes, menteeRes, cohortRes] = await Promise.all([
    admin
      .from('mentor')
      .select('id, first_name, last_name, email')
      .eq('id', match.mentor_id)
      .eq('cohort_id', match.cohort_id)
      .maybeSingle(),
    admin
      .from('mentees')
      .select('id, full_name, email')
      .eq('id', match.mentee_id)
      .eq('cohort_id', match.cohort_id)
      .maybeSingle(),
    admin.from('cohorts').select('id, name').eq('id', match.cohort_id).maybeSingle(),
  ])
  const mentor = mentorRes.data
  const mentee = menteeRes.data
  const cohort = cohortRes.data
  if (!mentor || !mentee || !cohort) {
    return NextResponse.json(
      { error: 'Member or cohort records are no longer intact for this match' },
      { status: 409 },
    )
  }
  if (!isValidEmail(mentor.email) || !isValidEmail(mentee.email)) {
    return NextResponse.json(
      { error: 'A member record is missing a valid email address' },
      { status: 409 },
    )
  }

  // Email budget (PRM §2): refuse when this activation's 2 sends would push
  // today past the soft cap. Soft = concurrent activations can slightly
  // overshoot; the Resend hard limit (100/day) has the remaining headroom.
  const todayUtcStart = new Date()
  todayUtcStart.setUTCHours(0, 0, 0, 0)
  const { count, error: countError } = await admin
    .from('email_log')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', todayUtcStart.toISOString())
  if (countError) {
    console.error('email_log count failed:', countError.message)
    return NextResponse.json(
      { error: 'Could not verify the daily email budget' },
      { status: 500 },
    )
  }
  if ((count ?? 0) + 2 > DAILY_EMAIL_SOFT_CAP) {
    return NextResponse.json(
      { error: 'Daily email budget reached — activate this match tomorrow' },
      { status: 429 },
    )
  }

  // Flip status first with a conditional update: a concurrent activation loses
  // here (0 rows) and never double-emails the pair.
  const { data: activated, error: updateError } = await admin
    .from('cohort_matches')
    .update({ status: 'active' })
    .eq('id', match.id)
    .eq('status', 'board_approved')
    .select('id')
  if (updateError) {
    console.error('Match activate failed:', updateError.message)
    return NextResponse.json({ error: 'Could not activate the match' }, { status: 500 })
  }
  if (!activated || activated.length === 0) {
    return NextResponse.json(
      { error: 'Only a board-approved match can be activated' },
      { status: 409 },
    )
  }

  const mentorName = `${mentor.first_name} ${mentor.last_name}`.trim()
  const menteeName = mentee.full_name.trim()

  if (dryRun) {
    // Mirrors /api/notify ?test=1: the status flip is real, the sends are
    // skipped, and nothing lands in email_log (it records actual sends only).
    console.log(
      `[dry-run] Skipped match activation emails — mentor ${mentor.id}, mentee ${mentee.id}`,
    )
    return NextResponse.json({ success: true, status: 'active', dryRun: true })
  }

  const results = await Promise.allSettled([
    notifyCohortMatchActivated({
      recipientEmail: mentor.email,
      recipientName: mentorName,
      recipientRole: 'mentor',
      partnerName: menteeName,
      partnerEmail: mentee.email,
      cohortName: cohort.name,
    }),
    notifyCohortMatchActivated({
      recipientEmail: mentee.email,
      recipientName: menteeName,
      recipientRole: 'mentee',
      partnerName: mentorName,
      partnerEmail: mentor.email,
      cohortName: cohort.name,
    }),
  ])
  const [mentorSend, menteeSend] = results
  const sentTo = [
    ...(mentorSend.status === 'fulfilled' ? [mentor.email] : []),
    ...(menteeSend.status === 'fulfilled' ? [mentee.email] : []),
  ]

  if (sentTo.length > 0) {
    const { error: logError } = await admin.from('email_log').insert(
      sentTo.map((recipient) => ({
        cohort_id: match.cohort_id,
        kind: 'match_notify',
        recipient_email: recipient,
        ref_id: match.id,
      })),
    )
    // The sends already happened — a failed log line is server-side noise, not
    // a client error.
    if (logError) console.error('email_log insert failed:', logError.message)
  }

  if (sentTo.length === 0) {
    // Neither party was notified — walk the status back so activate can simply
    // be retried.
    await admin
      .from('cohort_matches')
      .update({ status: 'board_approved' })
      .eq('id', match.id)
      .eq('status', 'active')
    return NextResponse.json(
      { error: 'Activation emails failed — the match was returned to board-approved, try again' },
      { status: 500 },
    )
  }
  if (sentTo.length === 1) {
    const failedParty = mentorSend.status === 'fulfilled' ? 'mentee' : 'mentor'
    return NextResponse.json({
      success: true,
      status: 'active',
      warning: `The ${failedParty}'s email failed to send — reach out to them directly`,
    })
  }
  return NextResponse.json({ success: true, status: 'active' })
}
