import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type AdminUser = {
  id: string
  email: string
  display_name: string | null
  role: string // 'super' | 'cohort_admin'
  cohort_id: string | null
}

export type AdminSessionState =
  | { status: 'unauthenticated' }
  | { status: 'not_admin' }
  | { status: 'admin'; email: string; adminUser: AdminUser }

/**
 * The admin_users row for a Google-verified email, or null. Exact match on the
 * lowercased email — NOT ilike like linkMentorByEmail: an unescaped `_` in a
 * session email is an any-character wildcard under ilike, which for admin
 * gating would let one email match a different admin row. admin_users.email
 * must therefore be stored lowercase. Fails closed: a lookup error reads as
 * "not an admin". Cached per request (layout + page share one lookup).
 */
export const getAdminUserByEmail = cache(
  async (email: string): Promise<AdminUser | null> => {
    const normalized = email.trim().toLowerCase()
    if (!normalized) return null

    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('admin_users')
      .select('id, email, display_name, role, cohort_id')
      .eq('email', normalized)
      .maybeSingle()

    if (error) {
      console.error('admin_users lookup failed:', error.message)
      return null
    }
    return (data as AdminUser) ?? null
  },
)

/**
 * Resolves the request's auth session (PR #5 cookie session) to an admin state.
 * Cached per request so the /admin layout and page trigger one auth read and
 * one admin_users lookup between them.
 */
export const resolveAdminSession = cache(
  async (): Promise<AdminSessionState> => {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.email) return { status: 'unauthenticated' }

    const adminUser = await getAdminUserByEmail(user.email)
    if (!adminUser) return { status: 'not_admin' }

    return { status: 'admin', email: user.email, adminUser }
  },
)

/**
 * Cohort-level authorization on top of the admin gate: supers see every
 * cohort; a cohort_admin sees only their own (a scoped admin with no cohort
 * assigned sees nothing — fail closed on a misconfigured row).
 */
export function canAccessCohort(adminUser: AdminUser, cohortId: string): boolean {
  return adminUser.role === 'super' || adminUser.cohort_id === cohortId
}

/**
 * Gate for the /admin segment. Anonymous → /login; signed-in non-admin → the
 * site 404 (the admin area should not be discoverable by probing). The layout
 * calls this, and every admin page must ALSO call it before fetching anything —
 * never rely on the layout alone to protect a page's data.
 */
export async function requireAdminSession(): Promise<{
  email: string
  adminUser: AdminUser
}> {
  const state = await resolveAdminSession()
  if (state.status === 'unauthenticated') redirect('/login')
  if (state.status === 'not_admin') notFound()
  return { email: state.email, adminUser: state.adminUser }
}
