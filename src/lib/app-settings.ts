import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Runtime feature flags, read from the singleton `app_settings` row (migration
 * 0008). This replaces the build-time ASCENSO_PUBLIC env var: Vercel only
 * applies an env change on a redeploy, so the old flag could not be flipped
 * without shipping. A DB read can, which is the entire point.
 *
 * Server-only — uses the service-role client, so never import this into a
 * Client Component. Every caller must also be dynamically rendered
 * (`export const dynamic = 'force-dynamic'`), or Next bakes the value into a
 * prerendered page at build time and the switch stops switching.
 */

export type AscensoVisibility = {
  visible: boolean
  updatedAt: string | null
  /**
   * False when the value could not actually be read. Public surfaces ignore
   * this and just use `visible` (which is false, i.e. hidden). The admin toggle
   * must NOT ignore it — rendering a switch reading "Hidden" when the truth is
   * "unknown" would be a control that lies about the state of the site.
   */
  ok: boolean
  error: string | null
}

const HIDDEN = (error: string | null): AscensoVisibility => ({
  visible: false,
  updatedAt: null,
  ok: error === null,
  error,
})

/**
 * Full read of the Ascenso visibility flag, including whether the read worked.
 * Use `isAscensoVisible()` unless you need to distinguish "off" from "unknown".
 *
 * FAILS CLOSED. A missing table, an unreachable DB, or missing Supabase env
 * vars all read as hidden. That inverts the old env flag's fail-OPEN semantics
 * on purpose: "hidden" is the state this cohort sits in by default, and a DB
 * hiccup exposing a program the partner board hasn't cleared is a worse outcome
 * than a temporarily missing panel. It also means the code is safe to deploy
 * before migration 0008 has been run.
 */
export async function readAscensoVisibility(): Promise<AscensoVisibility> {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('app_settings')
      .select('ascenso_visible, updated_at')
      .eq('id', 1)
      .maybeSingle()

    if (error) {
      console.error('app_settings lookup failed:', error.message)
      return HIDDEN(error.message)
    }
    // No row yet (0008 not run, or the row was deleted) → hidden, and that is
    // a genuine unknown rather than a deliberate "off".
    if (!data) return HIDDEN('No app_settings row (migration 0008 not run?)')

    return {
      visible: data.ascenso_visible === true,
      updatedAt: data.updated_at ?? null,
      ok: true,
      error: null,
    }
  } catch (err) {
    console.error('app_settings lookup crashed:', err)
    return HIDDEN(err instanceof Error ? err.message : 'Unknown error')
  }
}

/**
 * Is the public Ascenso funnel discoverable? Governs the homepage panel,
 * /ascenso, /ascenso/apply, and the two sitemap entries — the four surfaces
 * that must agree, since a visible link into a redirecting route is worse than
 * either state on its own.
 *
 * Not gated by this, deliberately: /ascenso/dashboard and /ascenso/auth
 * (existing members keep their accounts either way), /login and /admin (the
 * board's own doors), and robots.ts.
 */
export async function isAscensoVisible(): Promise<boolean> {
  return (await readAscensoVisibility()).visible
}
