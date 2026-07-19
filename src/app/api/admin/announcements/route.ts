export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendCohortAnnouncement } from '@/lib/email'
import { cap, isValidEmail, LIMITS } from '@/lib/validate'

// Community announcements send route (ascenso-prm.md §5.10 / §7.8). The admin
// composes subject/body/audience on the cohort admin page; this route resolves
// recipients SERVER-SIDE from cohort membership (never from the client body),
// sends one email per recipient via Resend, then writes the announcements row +
// one email_log row per recipient (kind 'announcement', ref_id = announcement
// id). Same non-probeable posture as the other admin routes: 401 anon, 404
// non-admin / wrong cohort / cohort miss.
//
// Two email rules are enforced here at the route level, both with clear errors
// and no silent queueing (§2): (1) refuse past the 90/day email_log soft cap
// (Resend free tier is 100/day, account-global) → 429; (2) never more than one
// full-cohort ('all') send per cohort per day → 429. ?test=1 is a side-effect-
// free dry-run: it resolves recipients and returns the count, but sends nothing,
// writes no announcement row, and logs nothing.

const DAILY_EMAIL_SOFT_CAP = 90
const AUDIENCES = ['all', 'mentors', 'mentees'] as const
type Audience = (typeof AUDIENCES)[number]

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
    // Subject is single-line: cap it and collapse any newlines so it can't be
    // used to inject additional mail headers. Body keeps its line breaks.
    const subject = cap(body.subject, LIMITS.name).replace(/[\r\n]+/g, ' ').trim()
    const messageBody = cap(body.body, LIMITS.text).trim()
    const audience = String(body.audience ?? '') as Audience

    if (!cohortId) {
      return NextResponse.json({ error: 'Missing cohort id' }, { status: 400 })
    }
    if (!AUDIENCES.includes(audience)) {
      return NextResponse.json({ error: 'Invalid audience' }, { status: 400 })
    }
    if (!subject || !messageBody) {
      return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 })
    }

    if (!canAccessCohort(adminUser, cohortId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const admin = getSupabaseAdmin()
    // Malformed uuid → lookup error → same 404 as a miss.
    const { data: cohort, error: cohortError } = await admin
      .from('cohorts')
      .select('id, name')
      .eq('id', cohortId)
      .maybeSingle()
    if (cohortError || !cohort) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Recipients come from the cohort's own member rows — never the request
    // body. Scoped by cohort_id ONLY, with NO `approved` filter: promoted cohort
    // mentors keep approved=false as defense in depth (public surfaces need
    // approved=true AND cohort_id IS NULL), so filtering here would drop every
    // cohort mentor.
    const wantMentors = audience === 'all' || audience === 'mentors'
    const wantMentees = audience === 'all' || audience === 'mentees'
    const [mentorsRes, menteesRes] = await Promise.all([
      wantMentors
        ? admin.from('mentor').select('email').eq('cohort_id', cohortId)
        : Promise.resolve({ data: [], error: null }),
      wantMentees
        ? admin.from('mentees').select('email').eq('cohort_id', cohortId)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (mentorsRes.error || menteesRes.error) {
      console.error(
        'Announcement recipient fetch failed:',
        mentorsRes.error?.message ?? menteesRes.error?.message,
      )
      return NextResponse.json({ error: 'Could not resolve recipients' }, { status: 500 })
    }

    // Validate + dedupe (case-insensitive) so a shared mentor/mentee address is
    // only mailed — and only billed against the cap — once.
    const seen = new Set<string>()
    const recipients: string[] = []
    for (const row of [...(mentorsRes.data ?? []), ...(menteesRes.data ?? [])]) {
      const email = String((row as { email: string }).email ?? '').trim()
      if (!isValidEmail(email)) continue
      const key = email.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      recipients.push(email)
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: 'No recipients with a valid email in this audience' },
        { status: 400 },
      )
    }

    const todayUtcStart = new Date()
    todayUtcStart.setUTCHours(0, 0, 0, 0)

    // Rule (2): at most one full-cohort blast per cohort per day (§2 — a full
    // send is ≈60 emails; two in a day threatens the 100/day Resend cap).
    if (audience === 'all') {
      const { count: allSendsToday, error: allSendsError } = await admin
        .from('announcements')
        .select('id', { count: 'exact', head: true })
        .eq('cohort_id', cohortId)
        .eq('audience', 'all')
        .gte('sent_at', todayUtcStart.toISOString())
      if (allSendsError) {
        console.error('Full-cohort send check failed:', allSendsError.message)
        return NextResponse.json(
          { error: 'Could not verify the daily announcement limit' },
          { status: 500 },
        )
      }
      if ((allSendsToday ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              'This cohort already received a full-cohort announcement today — only one is allowed per day. Send to mentors or mentees only, or try again tomorrow.',
          },
          { status: 429 },
        )
      }
    }

    // Rule (1): refuse when this send's recipients would push today's global
    // email_log past the soft cap. Soft = concurrent sends can slightly
    // overshoot; the Resend hard limit (100/day) holds the remaining headroom.
    const { count: sentToday, error: countError } = await admin
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
    if ((sentToday ?? 0) + recipients.length > DAILY_EMAIL_SOFT_CAP) {
      const remaining = Math.max(0, DAILY_EMAIL_SOFT_CAP - (sentToday ?? 0))
      return NextResponse.json(
        {
          error: `Daily email budget reached — this send needs ${recipients.length} but only ${remaining} remain today. Try again tomorrow.`,
        },
        { status: 429 },
      )
    }

    // ?test=1 is a side-effect-free preview: recipients are resolved and both
    // budget rules above have been checked (so a dry-run faithfully returns 429
    // when a real send would be refused), but nothing is sent, no announcement
    // row is written, and nothing is logged.
    const dryRun = new URL(request.url).searchParams.get('test') === '1'
    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        audience,
        recipientCount: recipients.length,
      })
    }

    // Record the announcement first so email_log rows can reference its id. If
    // the send then fails wholesale we delete it, so a row always reflects a
    // real send.
    const { data: created, error: insertError } = await admin
      .from('announcements')
      .insert([
        {
          cohort_id: cohortId,
          subject,
          body: messageBody,
          audience,
          sent_at: new Date().toISOString(),
          sent_by: adminUser.id,
          recipient_count: recipients.length,
        },
      ])
      .select('id')
      .single()
    if (insertError || !created) {
      console.error('Announcement insert failed:', insertError?.message)
      return NextResponse.json({ error: 'Could not save the announcement' }, { status: 500 })
    }

    try {
      await sendCohortAnnouncement({
        recipients,
        cohortName: cohort.name,
        subject,
        body: messageBody,
      })
    } catch {
      // Batch send is all-or-nothing: nothing went out, so remove the row.
      await admin.from('announcements').delete().eq('id', created.id)
      return NextResponse.json(
        { error: 'The announcement failed to send — nothing was delivered, try again' },
        { status: 502 },
      )
    }

    // One email_log row per recipient (kind 'announcement', ref_id = the
    // announcement). The sends already happened — a failed log write is
    // server-side noise, not a client error.
    const { error: logError } = await admin.from('email_log').insert(
      recipients.map((recipient) => ({
        cohort_id: cohortId,
        kind: 'announcement',
        recipient_email: recipient,
        ref_id: created.id,
      })),
    )
    if (logError) console.error('email_log insert failed:', logError.message)

    return NextResponse.json({
      success: true,
      announcementId: created.id,
      recipientCount: recipients.length,
    })
  } catch (err) {
    console.error('Announcement send crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
