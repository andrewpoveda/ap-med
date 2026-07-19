import type { SupabaseClient } from '@supabase/supabase-js'

export type MemberTrackMaps = {
  mentorTrackById: Map<string, string>
  menteeTrackById: Map<string, string>
}

/**
 * A cohort member's track lives on their approved cohort_applications row
 * (joined via member_id) — the promoted mentor/mentees rows are deliberately
 * skeletal and don't carry it. Matching is track-constrained (ascenso-prm.md
 * §5.4), so both the matching page and the select route derive tracks from
 * here, never from the client. Newest approved application wins on the
 * (unexpected) case of a repeated member_id. Returns null on a lookup error so
 * callers fail closed instead of matching trackless members.
 */
export async function getMemberTrackMaps(
  admin: SupabaseClient,
  cohortId: string,
): Promise<MemberTrackMaps | null> {
  const { data, error } = await admin
    .from('cohort_applications')
    .select('member_id, role, track')
    .eq('cohort_id', cohortId)
    .eq('status', 'approved')
    .not('member_id', 'is', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Member track lookup failed:', error.message)
    return null
  }

  const maps: MemberTrackMaps = {
    mentorTrackById: new Map(),
    menteeTrackById: new Map(),
  }
  for (const row of data ?? []) {
    if (!row.member_id || typeof row.track !== 'string') continue
    if (row.role === 'mentor') maps.mentorTrackById.set(row.member_id, row.track)
    if (row.role === 'mentee') maps.menteeTrackById.set(row.member_id, row.track)
  }
  return maps
}
