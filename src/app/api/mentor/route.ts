import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { PUBLIC_MENTOR_COLUMNS } from '@/types/mentor'
import { isHttpUrl } from '@/lib/url'
import { cap, isValidEmail, LIMITS } from '@/lib/validate'

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase server environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey)
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    // Public directory endpoint — never select('*') here: the row carries
    // mentor emails and private notes that must stay server-side.
    const { data, error } = await supabase
      .from('mentor')
      .select(PUBLIC_MENTOR_COLUMNS.join(', '))
      // Only vetted mentors are public; self-service submissions stay hidden
      // until manually approved (see migration 0003).
      .eq('approved', true)
      // Cohort members never appear in the public directory (migration 0006) —
      // isolation is a P0 security requirement, not a preference.
      .is('cohort_id', null)
      .order('last_name')
    if (error) {
      console.error('Mentor list query failed:', error.message)
      return NextResponse.json({ error: 'Failed to load mentors' }, { status: 500 })
    }
    return NextResponse.json({ mentors: data })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const supabaseAdmin = getSupabaseAdmin()
  const data = await request.json()

  const turnstileOk = await verifyTurnstileToken(data.turnstile_token ?? "")
  if (!turnstileOk) {
    return NextResponse.json({ error: "CAPTCHA verification failed" }, { status: 400 })
  }

  // Reject non-http(s) URLs at the door so a script-scheme value can never be
  // stored and later rendered as a link (episode_url is public-facing).
  for (const field of ['linkedin_url', 'episode_url', 'scheduling_url'] as const) {
    if (data[field] && !isHttpUrl(data[field])) {
      return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 })
    }
  }

  if (!isValidEmail(data.email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('mentor')
    .insert([{
      first_name: cap(data.first_name, LIMITS.name),
      last_name: cap(data.last_name, LIMITS.name),
      credentials: cap(data.credentials, LIMITS.name),
      current_role: cap(data.current_role, LIMITS.name),
      institution: cap(data.institution, LIMITS.name),
      linkedin_url: cap(data.linkedin_url, LIMITS.name),
      episode_url: cap(data.episode_url, LIMITS.name),
      bio: cap(data.bio, LIMITS.text),
      identity: Array.isArray(data.identity) ? data.identity : [],
      current_stage: cap(data.current_stage, LIMITS.name),
      specialty: Array.isArray(data.specialty) ? data.specialty : [],
      can_help_with: Array.isArray(data.can_help_with) ? data.can_help_with : [],
      mentee_capacity: cap(data.mentee_capacity, LIMITS.name),
      contact_method: Array.isArray(data.contact_method) ? data.contact_method : [],
      scheduling_url: cap(data.scheduling_url, LIMITS.name),
      open_to_podcast: data.open_to_podcast,
      email: cap(data.email, LIMITS.name),
      notes: cap(data.notes, LIMITS.text),
      // Self-service submissions are not public until manually reviewed.
      approved: false,
    }])

  if (error) {
    console.error('Mentor insert failed:', error.message)
    return NextResponse.json({ error: 'Failed to submit mentor application' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}