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
    const expectedContactId = body?.expectedContactId
    const expectedContactRevision = body?.expectedContactRevision
    if (!body || !Object.hasOwn(body, 'expectedContactId') ||
        !Object.hasOwn(body, 'expectedContactRevision') ||
        (expectedContactId !== null &&
          (typeof expectedContactId !== 'string' || expectedContactId.length > 100)) ||
        (expectedContactRevision !== null &&
          (!Number.isSafeInteger(expectedContactRevision) || expectedContactRevision < 1)) ||
        (expectedContactId === null) !== (expectedContactRevision === null)) {
      return NextResponse.json({ error: 'Invalid SMS preference version' }, { status: 400 })
    }

    const memberTable = actor.type === 'mentor' ? 'mentor' : 'mentees'
    const { data: member, error: memberError } = await admin.from(memberTable)
      .select('person_id,membership_status').eq('id', actor.id)
      .eq('cohort_id', actor.cohortId).maybeSingle()
    if (memberError || !member?.person_id || member.membership_status !== 'active') {
      return NextResponse.json({ error: 'No active cohort membership' }, { status: 403 })
    }

    const { data: previous, error: previousError } = await admin.from('cohort_sms_contacts')
      .select('id,revision,phone_e164,consented_at,consent_source,consent_notice,consent_notice_version,opted_out_at')
      .eq('cohort_id', actor.cohortId).eq('person_id', member.person_id).maybeSingle()
    if (previousError) return NextResponse.json({ error: 'Could not save SMS preference' }, { status: 500 })
    if ((previous?.id ?? null) !== expectedContactId ||
        (previous?.revision ?? null) !== expectedContactRevision) {
      return NextResponse.json({ error: 'SMS preference changed. Please reload and try again.' }, { status: 409 })
    }

    const phone = contact.value.phoneE164
    if (!smsEnabled && (!previous || contact.value.consent ||
        (phone !== null && phone !== previous.phone_e164))) {
      // Pausing outbound SMS must never trap a stored phone or consent. Only
      // revocation/removal of an existing preference is allowed while paused.
      return NextResponse.json({ error: 'SMS enrollment is paused for this cohort' }, { status: 404 })
    }
    // STOP is phone-wide. START may lift provider blocking, but only this signed-in
    // action can establish fresh AP MED consent for a particular cohort.
    if (contact.value.consent) {
      const { data: suppression, error } = await admin.from('sms_phone_suppressions')
        .select('revision,opted_out_at,resumed_at').eq('phone_e164', phone).maybeSingle()
      if (error) return NextResponse.json({ error: 'Could not verify SMS opt-out status' }, { status: 500 })
      if (suppression && (!suppression.resumed_at || suppression.resumed_at <= suppression.opted_out_at)) {
        return NextResponse.json({ error: 'This number opted out. Text START to the AP MED number before opting in here again.' }, { status: 409 })
      }

      // The read above may race with STOP followed by START. The RPC checks
      // that exact phone revision and saves consent in one locked transaction.
      const { data: outcome, error: saveError } = await admin.rpc('sms_save_contact_consent', {
        p_cohort_id: actor.cohortId,
        p_person_id: member.person_id,
        p_phone_e164: phone,
        p_expected_revision: suppression?.revision ?? null,
        p_expected_contact_id: previous?.id ?? null,
        p_expected_phone_e164: previous?.phone_e164 ?? null,
        p_expected_consented_at: previous?.consented_at ?? null,
        p_expected_opted_out_at: previous?.opted_out_at ?? null,
        p_consent_notice: SMS_CONSENT_NOTICE,
        p_consent_notice_version: SMS_CONSENT_NOTICE_VERSION,
      })
      if (saveError?.code === '23505') {
        return NextResponse.json({ error: 'This number is already assigned to another member in this cohort' }, { status: 409 })
      }
      if (saveError) {
        console.error('SMS preference save failed')
        return NextResponse.json({ error: 'Could not save SMS preference' }, { status: 500 })
      }
      if (outcome === 'changed') {
        return NextResponse.json({ error: 'SMS preference changed. Please reload and try again.' }, { status: 409 })
      }
      if (outcome === 'opted_out') {
        return NextResponse.json({ error: 'This number opted out. Text START to the AP MED number before opting in here again.' }, { status: 409 })
      }
      if (outcome === 'disabled') {
        return NextResponse.json({ error: 'SMS enrollment is paused for this cohort' }, { status: 404 })
      }
      if (outcome === 'inactive') {
        return NextResponse.json({ error: 'No active cohort membership' }, { status: 403 })
      }
      if (outcome !== 'saved') {
        return NextResponse.json({ error: 'Could not save SMS preference' }, { status: 500 })
      }
      return NextResponse.json({ success: true, phoneE164: phone })
    }

    const { data: outcome, error: saveError } = await admin.rpc('sms_save_contact_without_consent', {
      p_cohort_id: actor.cohortId,
      p_person_id: member.person_id,
      p_phone_e164: phone,
      p_expected_contact_id: expectedContactId,
      p_expected_contact_revision: expectedContactRevision,
      p_allow_new_phone: smsEnabled,
    })
    if (saveError?.code === '23505') {
      return NextResponse.json({ error: 'This number is already assigned to another member in this cohort' }, { status: 409 })
    }
    if (saveError) {
      console.error('SMS preference save failed')
      return NextResponse.json({ error: 'Could not save SMS preference' }, { status: 500 })
    }
    if (outcome === 'changed') {
      return NextResponse.json({ error: 'SMS preference changed. Please reload and try again.' }, { status: 409 })
    }
    if (outcome === 'disabled') {
      return NextResponse.json({ error: 'SMS enrollment is paused for this cohort' }, { status: 404 })
    }
    if (outcome === 'inactive') {
      return NextResponse.json({ error: 'No active cohort membership' }, { status: 403 })
    }
    if (outcome !== 'saved') {
      return NextResponse.json({ error: 'Could not save SMS preference' }, { status: 500 })
    }
    return NextResponse.json({ success: true, phoneE164: phone })
  } catch {
    console.error('SMS preference route failed')
    return NextResponse.json({ error: 'Could not save SMS preference' }, { status: 500 })
  }
}
