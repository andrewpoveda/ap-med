export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { cap, isValidEmail, LIMITS } from '@/lib/validate'

type RequestBody = Record<string, unknown>

export async function POST(request: Request) {
  let body: RequestBody
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Body must be an object')
    }
    body = parsed as RequestBody
  } catch {
    return NextResponse.json(
      { status: 'invalid_email', message: 'Enter a valid email address.' },
      { status: 400 },
    )
  }

  const rawEmail = typeof body.email === 'string' ? body.email : ''
  if (!rawEmail.trim()) {
    return NextResponse.json(
      { status: 'invalid_email', message: 'Enter your email address.' },
      { status: 400 },
    )
  }
  if (rawEmail.length > LIMITS.name) {
    return NextResponse.json(
      { status: 'invalid_email', message: 'Enter a valid email address.' },
      { status: 400 },
    )
  }

  const email = rawEmail.trim().toLowerCase()
  if (!isValidEmail(email)) {
    return NextResponse.json(
      { status: 'invalid_email', message: 'Enter a valid email address.' },
      { status: 400 },
    )
  }

  const turnstileOk = await verifyTurnstileToken(cap(body.turnstile_token, 2048))
  if (!turnstileOk) {
    return NextResponse.json(
      { status: 'security_failed', message: 'Security verification expired or failed.' },
      { status: 400 },
    )
  }

  try {
    const admin = getSupabaseAdmin()
    const { error } = await admin.from('waitlist').insert({ email })

    if (error?.code === '23505') {
      return NextResponse.json({ status: 'joined' })
    }
    if (error) {
      console.error('Waitlist insert failed:', error.message)
      return NextResponse.json(
        { status: 'error', message: 'Could not join the waitlist.' },
        { status: 500 },
      )
    }

    return NextResponse.json({ status: 'joined' })
  } catch (error) {
    console.error('Waitlist submission crashed:', error)
    return NextResponse.json(
      { status: 'error', message: 'Could not join the waitlist.' },
      { status: 500 },
    )
  }
}
