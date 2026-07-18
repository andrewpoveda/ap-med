export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getMentorForUser } from '@/lib/mentor-link'
import { parseAvailabilityInput } from '@/lib/availability'

/**
 * Upsert the signed-in mentor's bookable hours (mentor_availability, migration
 * 0005). The app is the validation boundary — the jsonb column enforces
 * nothing, so every rule is checked here before it can reach the slot math.
 * slot_minutes stays at its column default (30) in v1: it matches the
 * hardcoded 30-minute event duration.
 */
export async function PUT(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    const mentor = await getMentorForUser(admin, user.id)
    if (!mentor) {
      return NextResponse.json({ error: 'No linked mentor profile' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const parsed = parseAvailabilityInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const { error } = await admin.from('mentor_availability').upsert({
      mentor_id: mentor.id,
      timezone: parsed.value.timezone,
      rules: parsed.value.rules,
      updated_at: new Date().toISOString(),
    })
    if (error) {
      console.error('Availability upsert failed:', error.message)
      return NextResponse.json({ error: 'Could not save your hours' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Availability error:', err)
    return NextResponse.json({ error: 'Could not save your hours' }, { status: 500 })
  }
}
