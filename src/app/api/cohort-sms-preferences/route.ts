export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { resolveActingMember } from '@/lib/goals'
import { SMS_CONSENT_NOTICE, SMS_CONSENT_NOTICE_VERSION, validateSmsContactInput } from '@/lib/sms-consent'
import { isCohortSmsEnabled } from '@/lib/cohort-sms'

/** An existing cohort member can add or revoke their own optional SMS consent.
 * The cohort switch remains separate and off by default. */
export async function PUT(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const admin = getSupabaseAdmin()
    const actor = await resolveActingMember(admin, user.id)
    if (!actor) return NextResponse.json({ error: 'No linked cohort member profile' }, { status: 403 })
    const smsEnabled = await isCohortSmsEnabled(admin, actor.cohortId)

    const body = await request.json().catch(() => null)
    const contact = validateSmsContactInput(body?.phoneNumber, body?.smsConsent)
    if (!contact.ok) return NextResponse.json({ error: contact.error }, { status: 400 })

    const memberTable = actor.type === 'mentor' ? 'mentor' : 'mentees'
    const { data: member, error: memberError } = await admin.from(memberTable)
      .select('person_id,membership_status').eq('id', actor.id)
      .eq('cohort_id', actor.cohortId).maybeSingle()
    if (memberError || !member?.person_id || member.membership_status !== 'active') {
      return NextResponse.json({ error: 'No active cohort membership' }, { status: 403 })
    }

    const { data: previous, error: previousError } = await admin.from('cohort_sms_contacts')
      .select('id,phone_e164,consented_at,consent_source,consent_notice,consent_notice_version,opted_out_at')
      .eq('cohort_id', actor.cohortId).eq('person_id', member.person_id).maybeSingle()
    if (previousError) return NextResponse.json({ error: 'Could not save SMS preference' }, { status: 500 })

    const phone = contact.value.phoneE164
    if (!smsEnabled && (!previous || contact.value.consent ||
        (phone !== null && phone !== previous.phone_e164))) {
      // Pausing outbound SMS must never trap a stored phone or consent. Only
      // revocation/removal of an existing preference is allowed while paused.
      return NextResponse.json({ error: 'SMS enrollment is paused for this cohort' }, { status: 404 })
    }
    if (!phone) {
      if (previous) {
        const { error } = await admin.from('cohort_sms_contacts').update({
          phone_e164: null,
          consented_at: null,
          consent_source: null,
          consent_notice: null,
          consent_notice_version: null,
          opted_out_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
          .eq('id', previous.id).eq('cohort_id', actor.cohortId).eq('person_id', member.person_id)
        if (error) return NextResponse.json({ error: 'Could not remove SMS preference' }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    // STOP is phone-wide. START may lift provider blocking, but only this signed-in
    // action can establish fresh AP MED consent for a particular cohort.
    let stoppedAt: string | null = null
    if (contact.value.consent) {
      const { data: suppression, error } = await admin.from('sms_phone_suppressions')
        .select('opted_out_at,resumed_at').eq('phone_e164', phone).maybeSingle()
      if (error) return NextResponse.json({ error: 'Could not verify SMS opt-out status' }, { status: 500 })
      if (suppression && (!suppression.resumed_at || suppression.resumed_at <= suppression.opted_out_at)) {
        return NextResponse.json({ error: 'This number opted out. Text START to the AP MED number before opting in here again.' }, { status: 409 })
      }
      stoppedAt = suppression?.opted_out_at ?? null
    }

    const now = new Date().toISOString()
    const unchangedActiveConsent = previous?.phone_e164 === phone &&
      previous.consented_at && !previous.opted_out_at && contact.value.consent &&
      (!stoppedAt || previous.consented_at > stoppedAt)
    const consentedAt = contact.value.consent ? (unchangedActiveConsent ? previous.consented_at : now) :
      previous?.phone_e164 === phone ? previous.consented_at : null
    const { error } = await admin.from('cohort_sms_contacts').upsert({
      cohort_id: actor.cohortId,
      person_id: member.person_id,
      phone_e164: phone,
      consented_at: consentedAt,
      consent_source: contact.value.consent
        ? (unchangedActiveConsent ? previous.consent_source : 'member_dashboard')
        : previous?.phone_e164 === phone ? previous.consent_source : null,
      consent_notice: contact.value.consent
        ? (unchangedActiveConsent ? previous.consent_notice : SMS_CONSENT_NOTICE)
        : previous?.phone_e164 === phone ? previous.consent_notice : null,
      consent_notice_version: contact.value.consent
        ? (unchangedActiveConsent ? previous.consent_notice_version : SMS_CONSENT_NOTICE_VERSION)
        : previous?.phone_e164 === phone ? previous.consent_notice_version : null,
      opted_out_at: contact.value.consent ? null : now,
      updated_at: now,
    }, { onConflict: 'cohort_id,person_id' })
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'This number is already assigned to another member in this cohort' }, { status: 409 })
    }
    if (error) {
      console.error('SMS preference save failed')
      return NextResponse.json({ error: 'Could not save SMS preference' }, { status: 500 })
    }
    return NextResponse.json({ success: true, phoneE164: phone })
  } catch {
    console.error('SMS preference route failed')
    return NextResponse.json({ error: 'Could not save SMS preference' }, { status: 500 })
  }
}
