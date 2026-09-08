import type { SupabaseClient } from '@supabase/supabase-js'
import { claimPerson, selectedParticipation } from '@/lib/participation'

export type AccountResolution = 'mentor' | 'mentee' | 'none' | 'conflict' | 'unresolved'

/** Default remains mentor-first; an explicitly selected owned role wins. */
export async function resolveAccountForUser(admin: SupabaseClient, userId: string, email: string): Promise<AccountResolution> {
  // An already-owned stable identity survives an auth-provider email change.
  // Do not attach a different person record merely because the new email matches.
  try {
    const existing = await selectedParticipation(admin, userId)
    if (existing) return existing.type
  } catch { return 'unresolved' }
  const claim = await claimPerson(admin, userId, email)
  if (claim === 'none' || claim === 'conflict') return claim
  if (claim === 'error') return 'unresolved'
  try {
    return (await selectedParticipation(admin, userId))?.type ?? 'unresolved'
  } catch { return 'unresolved' }
}

export function signInDestination(resolution: AccountResolution): string {
  switch (resolution) {
    case 'mentor': return '/dashboard'
    case 'mentee': return '/ascenso/dashboard'
    case 'none': return '/login?error=no_account'
    case 'conflict': return '/login?error=account_conflict'
    case 'unresolved': return '/dashboard'
  }
}
