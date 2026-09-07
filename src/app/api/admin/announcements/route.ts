export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildAnnouncementMessage } from '@/lib/email'
import { sendCohortDeliveries } from '@/lib/cohort-delivery'
import { cap, isValidEmail, LIMITS } from '@/lib/validate'

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
        ? admin.from('mentor').select('email').eq('cohort_id', cohortId).eq('membership_status', 'active')
        : Promise.resolve({ data: [], error: null }),
      wantMentees
        ? admin.from('mentees').select('email').eq('cohort_id', cohortId).eq('membership_status', 'active')
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

    const requestId = String(body.requestId ?? '')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      return NextResponse.json({ error: 'A valid request ID is required' }, { status: 400 })
    }
    const { data: announcementId, error: queueError } = await admin.rpc('ascenso_queue_announcement', {
      p_id: requestId, p_cohort: cohortId, p_actor: adminUser.id, p_subject: subject,
      p_body: messageBody, p_audience: audience,
      p_messages: recipients.map(email => buildAnnouncementMessage(email, cohort.name, subject, messageBody)),
    })
    if (queueError) return NextResponse.json({ error: 'Could not queue: a full-cohort announcement may already be queued today, or this request ID was used for different content. Refresh to check history.' }, { status: 409 })
    // The durable queue remains recoverable if this request times out.
    await sendCohortDeliveries(admin, announcementId).catch(() => false)
    return NextResponse.json({ success: true, announcementId, recipientCount: recipients.length, queued: true })

  } catch (err) {
    console.error('Announcement send crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
