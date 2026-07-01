export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyMentorOfMatch, notifyMenteeOfRequest } from '@/lib/email'
import { scoreMentor } from '@/lib/match'
import type { Mentor } from '@/types/mentor'

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase server environment variables')
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey)
}

type MenteeInput = {
  full_name: string
  email: string
  school: string
  current_stage: string
  interests: string[]
  help_with: string[]
  identity: string[]
  notes?: string
  linkedin_url?: string
}

// Basic email shape check — enough to reject junk before it becomes a replyTo.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_EMAIL = 320
const MAX_NAME = 200
const MAX_NOTES = 2000

export async function POST(request: Request) {
  try {
    const dryRun = new URL(request.url).searchParams.get('test') === '1'

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Accept ONLY an id for the mentor — never a client-supplied mentor object.
    // The send-to address is resolved from the DB row below, so a caller can't
    // point this endpoint at an arbitrary recipient (open-relay prevention).
    const mentorId = typeof body.mentorId === 'string' ? body.mentorId.trim() : ''
    const mentee = body.mentee as MenteeInput | undefined

    if (!mentorId) {
      return NextResponse.json({ error: 'mentorId is required' }, { status: 400 })
    }
    if (!mentee || typeof mentee !== 'object') {
      return NextResponse.json({ error: 'mentee is required' }, { status: 400 })
    }
    if (typeof mentee.full_name !== 'string' || !mentee.full_name.trim() || mentee.full_name.length > MAX_NAME) {
      return NextResponse.json({ error: 'mentee.full_name is required and must be under 200 chars' }, { status: 400 })
    }
    if (typeof mentee.email !== 'string' || mentee.email.length > MAX_EMAIL || !EMAIL_RE.test(mentee.email)) {
      return NextResponse.json({ error: 'mentee.email is not a valid email' }, { status: 400 })
    }
    if (mentee.notes != null && (typeof mentee.notes !== 'string' || mentee.notes.length > MAX_NOTES)) {
      return NextResponse.json({ error: 'mentee.notes is too long' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: mentorRow, error: mentorErr } = await supabase
      .from('mentor')
      .select('*')
      .eq('id', mentorId)
      .single()

    if (mentorErr || !mentorRow) {
      return NextResponse.json({ error: 'Mentor not found' }, { status: 404 })
    }

    const mentor = mentorRow as Mentor
    // matchPercent is recomputed server-side from the trusted DB row, never trusted from the client.
    const scoredMentor = { ...mentor, matchPercent: scoreMentor(mentor, mentee) }

    if (dryRun) {
      console.log(`[dry-run] Skipped notify emails — mentor ${mentor.email}, mentee ${mentee.email}`)
      return NextResponse.json({ success: true, dryRun: true })
    }

    // Core action: notify the mentor. A failure here fails the request.
    await notifyMentorOfMatch(scoredMentor, mentee)

    // Secondary action: confirm to the mentee. Never fail the request over this —
    // the mentor has already been notified, which is the action the user asked for.
    try {
      await notifyMenteeOfRequest({
        menteeEmail: mentee.email,
        menteeFirstName: mentee.full_name.split(' ')[0] || mentee.full_name,
        mentorName: `${mentor.first_name} ${mentor.last_name}`,
      })
    } catch (err) {
      console.error('Mentee confirmation email failed (non-fatal):', err)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Notify error:', err)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}
