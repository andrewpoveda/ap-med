export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { runSmsWorker } from '@/lib/sms/worker'

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const presented = request.headers.get('authorization') ?? ''
  const actual = createHash('sha256').update(presented).digest()
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest()
  return timingSafeEqual(actual, expected)
}

async function run(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // An off flag exits before reading the new schema or importing Twilio. This
  // keeps existing cohorts unchanged on deployments lacking SMS credentials.
  if (process.env.SMS_FEATURE_ENABLED !== 'true') {
    return NextResponse.json({ success: true, enabled: false })
  }
  try {
    const { createTwilioSmsProviderFromEnv } = await import('@/lib/sms/twilio')
    const provider = createTwilioSmsProviderFromEnv()
    if (!provider) {
      return NextResponse.json({ error: 'SMS provider is not configured' }, { status: 503 })
    }
    const summary = await runSmsWorker(getSupabaseAdmin(), provider)
    return NextResponse.json({ success: summary.complete, ...summary },
      { status: summary.complete ? 200 : 503 })
  } catch {
    // Do not log recipient numbers, message bodies, or provider payloads.
    console.error('SMS worker failed')
    return NextResponse.json({ error: 'SMS worker failed' }, { status: 500 })
  }
}

// Vercel Cron calls GET. POST allows an explicitly authorized manual run.
export async function GET(request: Request) { return run(request) }
export async function POST(request: Request) { return run(request) }
