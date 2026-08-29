import type { SupabaseClient } from '@supabase/supabase-js'

export const DAILY_EMAIL_LIMIT = 90
export const NOTIFY_EMAIL_SLOTS = 2

export type EmailBudgetReservation =
  | { status: 'reserved'; reservationId: string }
  | { status: 'quota_reached' }
  | { status: 'error'; message: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function reserveNotifyEmailBudget(
  supabase: SupabaseClient,
): Promise<EmailBudgetReservation> {
  const { data, error } = await supabase.rpc('reserve_email_budget', {
    p_slots: NOTIFY_EMAIL_SLOTS,
  })

  if (error) {
    return { status: 'error', message: error.message }
  }

  if (data === null) {
    return { status: 'quota_reached' }
  }

  if (typeof data !== 'string' || data.length !== 36 || !UUID_RE.test(data)) {
    return { status: 'error', message: 'Invalid email budget reservation response' }
  }

  return { status: 'reserved', reservationId: data }
}

export async function releaseEmailBudgetSlots(
  supabase: SupabaseClient,
  reservationId: string,
  slots: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('release_email_budget_slots', {
    p_reservation_id: reservationId,
    p_slots: slots,
  })

  if (error) {
    console.error('Email budget release failed:', error.message)
    return false
  }

  if (!Number.isInteger(data) || data < 0 || data > NOTIFY_EMAIL_SLOTS) {
    console.error('Email budget release returned an invalid remaining-slot count')
    return false
  }

  return true
}
