import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizeEmail } from '@/lib/email-identity'

export type AdminUser = {
  id: string
  email: string
  display_name: string | null
  role: string // 'super' | 'cohort_admin'
  cohort_id: string | null
  // The legacy single-cohort field is retained for historical compatibility,
  // but never used for authorization after the grants migration.
  cohort_ids?: string[]
}

export type AdminSessionState =
  | { status: 'unauthenticated' }
  | { status: 'not_admin' }
  | { status: 'admin'; email: string; adminUser: AdminUser }

/**
 * The admin_users row for a Google-verified email, or null. Exact match on the
 * lowercased email. Pattern matching must never authorize an identity. admin_users.email
 * must therefore be stored lowercase. Fails closed: a lookup error reads as
 * "not an admin". Cached per request (layout + page share one lookup).
 */
export const getAdminUserByEmail = cache(
  async (email: string): Promise<AdminUser | null> => {
    const normalized = normalizeEmail(email)
    if (!normalized) return null

    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('admin_users')
      .select('id, email, display_name, role, cohort_id, disabled_at')
      .eq('email', normalized)
      .maybeSingle()

    if (error) {
      console.error('admin_users lookup failed:', error.message)
      return null
    }
    if (!data || data.disabled_at || !['super', 'cohort_admin'].includes(data.role)) return null
    if (data.role === 'super') return { ...data, cohort_ids: [] } as AdminUser
    const { data: grants, error: grantError } = await admin.from('admin_cohort_grants')
      .select('cohort_id').eq('admin_id', data.id).is('revoked_at', null)
    if (grantError || !grants?.length) return null
    return { ...data, cohort_ids: grants.map(g => g.cohort_id) } as AdminUser
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
 * Supers see every cohort; scoped administrators require a currently loaded
 * explicit grant. Missing grant data fails closed, including legacy rows.
 */
export function canAccessCohort(adminUser: AdminUser, cohortId: string): boolean {
  return adminUser.role === 'super' || (adminUser.role === 'cohort_admin' && (adminUser.cohort_ids ?? []).includes(cohortId))
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
