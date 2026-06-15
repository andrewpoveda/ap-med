import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    const { data, error } = await supabase
      .from('mentor')
      .select('*')
      .order('last_name')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ mentors: data })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const supabaseAdmin = getSupabaseAdmin()
  const data = await request.json()

  const { error } = await supabaseAdmin
    .from('mentor')
    .insert([{
      first_name: data.first_name,
      last_name: data.last_name,
      credentials: data.credentials,
      current_role: data.current_role,
      institution: data.institution,
      linkedin_url: data.linkedin_url,
      episode_url: data.episode_url,
      bio: data.bio,
      identity: data.identity,
      current_stage: data.current_stage,
      specialty: data.specialty,
      can_help_with: data.can_help_with,
      mentee_capacity: data.mentee_capacity,
      contact_method: data.contact_method,
      scheduling_url: data.scheduling_url,
      open_to_podcast: data.open_to_podcast,
      email: data.email,
      notes: data.notes,
    }])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}