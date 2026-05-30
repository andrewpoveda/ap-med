export const runtime = "nodejs";

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase server environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey)
}


export async function POST(request: Request) {
  const supabaseAdmin = getSupabaseAdmin()
  const data = await request.json()

  const { error } = await supabaseAdmin
  .from("mentees")
  .insert([
    {
      full_name: data.full_name,
      email: data.email,
      school: data.school,
      identity: data.identity, // ARRAY
      interests: data.interests, // ARRAY
      preferred_specialty: data.preferred_specialty,
      preferred_identity: data.preferred_identity,
      availability: data.availability,
      notes: data.notes || "",
    },
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}