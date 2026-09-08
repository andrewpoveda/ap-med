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
} from '@/lib/digest'
import { buildDigestMessage } from '@/lib/email'
import { drainCohortDeliveryQueue } from '@/lib/cohort-delivery'

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

    if (toSend.length) {
      const expires = new Date(now)
      expires.setUTCHours(24, 0, 0, 0)
      const { error: queueError } = await admin.from('cohort_delivery').upsert(toSend.map(r => ({
        cohort_id: r.cohortId, source_id: r.personId, kind: 'digest',
        variant: `${r.cohortId}:${summary.date}`, recipient_email: r.email, payload: {},
        message: buildDigestMessage(r), expires_at: r.validUntil && r.validUntil < expires.toISOString() ? r.validUntil : expires.toISOString(),
      })), { onConflict: 'source_id,kind,variant', ignoreDuplicates: true })
      if (queueError) throw new Error('Could not persist digest intents')
    }
    const complete = await drainCohortDeliveryQueue(admin)
    return NextResponse.json({ success: true, dryRun: false, queuedCount: toSend.length,
      queuePageComplete: complete, note: 'Provider acceptance and unresolved mail are visible in cohort email status.', ...summary })

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
