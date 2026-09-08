import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildCohortOperationalEmail, sendCohortOperationalEmail } from '@/lib/email'

export type CohortDelivery = {
  id: string
  source_id: string
  kind: 'decision' | 'introduction' | 'announcement' | 'digest'
  message?: ReturnType<typeof buildCohortOperationalEmail> | null
  variant: string
  recipient_email: string
  payload: Record<string, string>
  state: string
  detail: string | null
  accepted_at: string | null
}

/** Attempt only unresolved intents. The database claim serializes workers and
 * freezes the exact message; retries reuse its provider idempotency key. */
export async function sendCohortDeliveries(admin: SupabaseClient, sourceId: string, cohortId: string) {
  if (!cohortId) return false
  const { data, error } = await admin.from('cohort_delivery').select('*').eq('source_id', sourceId).eq('cohort_id', cohortId)
  if (error || !data?.length) return false
  return attemptDeliveries(admin, data as CohortDelivery[])
}

/** Bounded fair queue shared by cron invocations. */
export async function drainCohortDeliveryQueue(admin: SupabaseClient) {
  const { data, error } = await admin.rpc('ascenso_delivery_queue')
  if (error) throw new Error('Could not read delivery queue')
  return attemptDeliveries(admin, data ?? [])
}

async function attemptDeliveries(admin: SupabaseClient, deliveries: CohortDelivery[]) {
  let complete = true
  const deadline = Date.now() + 40_000
  for (const delivery of deliveries) {
    if (Date.now() >= deadline) return false
    if (['accepted', 'superseded'].includes(delivery.state)) continue
    try {
      const message = delivery.message ?? buildCohortOperationalEmail(delivery)
      const { data: claim, error: claimError } = await admin.rpc('ascenso_claim_delivery', {
        p_id: delivery.id, p_message: message,
      })
      if (claimError || !claim) { complete = false; continue }
      let providerId: string | null = null
      try {
        providerId = await sendCohortOperationalEmail(claim.message, `ascenso/${claim.attempt_key}`)
      } catch {
        // Do not expose provider payloads or recipient PII in logs.
        complete = false
      }
      const { data: finished, error: finishError } = await admin.rpc('ascenso_finish_delivery', {
        p_id: delivery.id, p_token: claim.claim_token, p_provider_id: providerId,
      })
      if (finishError || !finished || !providerId) complete = false
    } catch {
      complete = false
    }
  }
  return complete
}
