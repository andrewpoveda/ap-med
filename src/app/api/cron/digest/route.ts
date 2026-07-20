export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Digest computation is a handful of Supabase queries + one Resend batch; the
// Hobby default (10s) should hold, but give the cron headroom.
export const maxDuration = 60

import { createHash, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  applyDigestCooldown,
  computeDigestRecipients,
  getCooldownDays,
  DIGEST_KIND,
} from '@/lib/digest'
import { sendCohortDigests } from '@/lib/email'

// Daily digest cron (ascenso-prm.md §5.9 / §7.12). Scheduled by vercel.json at
// 0 13 * * * UTC (≈9am ET, fires within the hour on Hobby). Each run computes
// every active-cohort member's pending items (src/lib/digest.ts), batches all
// of a person's items into ONE email, writes email_log rows (kind 'digest'),
// and enforces:
//   - the 7-day cooldown (session-in-24h items exempt) — §5.9;
//   - idempotency per day (a same-day re-invocation sends nothing);
//   - the 90/day email_log soft cap → 429, refuse outright, no partial send.
//
// AUTH (§6.5): Authorization: Bearer ${CRON_SECRET}, 401 otherwise — the first
// cron route, NOT session-authed. Vercel injects exactly this header on cron
// invocations when the CRON_SECRET env var is set on the project. Vercel Cron
// invokes with GET, so GET is the cron entrypoint; POST is the same handler for
// manual/scripted invocation. ?test=1 is a side-effect-free dry-run: recipients
// computed and every guard checked (a dry-run faithfully 429s when a real run
// would refuse), but nothing sends and nothing is logged.

const DAILY_EMAIL_SOFT_CAP = 90

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Fail closed: an undeployed secret must never mean an open cron route.
    console.error('CRON_SECRET is not set — refusing digest run')
    return false
  }
  const presented = request.headers.get('authorization') ?? ''
  // Hash both sides so timingSafeEqual gets equal-length buffers regardless of
  // what the caller presented.
  const a = createHash('sha256').update(presented).digest()
  const b = createHash('sha256').update(`Bearer ${secret}`).digest()
  return timingSafeEqual(a, b)
}

async function runDigest(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dryRun = new URL(request.url).searchParams.get('test') === '1'
    const now = new Date()
    const admin = getSupabaseAdmin()

    const pending = await computeDigestRecipients(admin, now)
    const cooldownDays = getCooldownDays()
    const { toSend, skippedAlreadySentToday, skippedCooldown } = await applyDigestCooldown(
      admin,
      pending,
      now,
      cooldownDays,
    )

    const summary = {
      date: now.toISOString().slice(0, 10),
      pendingMembers: pending.length,
      skippedAlreadySentToday,
      skippedCooldown,
      cooldownDays,
    }

    if (toSend.length === 0) {
      return NextResponse.json({ success: true, dryRun, sentCount: 0, ...summary })
    }

    // 90/day soft cap (§2, same check as the announcement route): refuse the
    // whole run rather than silently sending a partial digest — a truncated
    // "who got nagged" set would make the cooldown state misleading.
    const todayUtcStart = new Date(now)
    todayUtcStart.setUTCHours(0, 0, 0, 0)
    const { count: sentToday, error: countError } = await admin
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', todayUtcStart.toISOString())
    if (countError) {
      console.error('Digest email_log count failed:', countError.message)
      return NextResponse.json(
        { error: 'Could not verify the daily email budget' },
        { status: 500 },
      )
    }
    if ((sentToday ?? 0) + toSend.length > DAILY_EMAIL_SOFT_CAP) {
      const remaining = Math.max(0, DAILY_EMAIL_SOFT_CAP - (sentToday ?? 0))
      return NextResponse.json(
        {
          error: `Daily email budget reached — this digest needs ${toSend.length} but only ${remaining} remain today. Nothing was sent.`,
          ...summary,
        },
        { status: 429 },
      )
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        sentCount: 0,
        wouldSend: toSend.map((r) => ({
          email: r.email,
          cohortName: r.cohortName,
          items: r.items,
        })),
        ...summary,
      })
    }

    try {
      // Batch is all-or-nothing at the Resend API level (≤100 messages; the 90
      // cap above keeps us under it), so on failure nothing went out and
      // nothing gets logged — the next invocation retries cleanly.
      await sendCohortDigests(toSend)
    } catch {
      return NextResponse.json(
        { error: 'The digest batch failed to send — nothing was delivered', ...summary },
        { status: 502 },
      )
    }

    // One email_log row per recipient. These rows ARE the cooldown/idempotency
    // state, so a failed write matters more than the announcement route's —
    // log loudly, but the sends already happened, so still report success.
    const { error: logError } = await admin.from('email_log').insert(
      toSend.map((r) => ({
        cohort_id: r.cohortId,
        kind: DIGEST_KIND,
        recipient_email: r.email,
      })),
    )
    if (logError) {
      console.error(
        'Digest email_log insert failed — cooldown state is now missing for this run:',
        logError.message,
      )
    }

    return NextResponse.json({ success: true, dryRun: false, sentCount: toSend.length, ...summary })
  } catch (err) {
    console.error('Digest run crashed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Vercel Cron invokes with GET; POST kept for manual/scripted invocation.
export async function GET(request: Request) {
  return runDigest(request)
}

export async function POST(request: Request) {
  return runDigest(request)
}
