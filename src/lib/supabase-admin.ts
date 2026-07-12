import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client — bypasses RLS. Server-only; never import into a
 * Client Component. Used for mentor↔auth-user linking (which must write the
 * mentor row and read the server-only email column) and the calendar/session
 * tables. Mirrors the getSupabaseAdmin() helpers inlined in the /api routes.
 */
export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase server environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey)
}
