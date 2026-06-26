export const runtime = "nodejs";

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyTurnstileToken } from '@/lib/turnstile'

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase server environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey)
}


export async function POST(request: Request) {
  const supabaseAdmin = getSupabaseAdmin()
  const data = await request.json()

  const turnstileOk = await verifyTurnstileToken(data.turnstile_token ?? "")
  if (!turnstileOk) {
    return NextResponse.json({ error: "CAPTCHA verification failed" }, { status: 400 })
  }

  const { error } = await supabaseAdmin
  .from("mentees")
  .insert([
    {
      full_name: data.full_name,
      email: data.email,
      school: data.school,
      identity: data.identity, // ARRAY — the mentee's OWN background (was mis-bound to preferred_identity)
      interests: data.interests, // ARRAY — specialties of interest
      current_stage: data.current_stage,
      help_with: data.help_with, // ARRAY
      linkedin_url: data.linkedin_url || "",
      notes: data.notes || "",
    },
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}