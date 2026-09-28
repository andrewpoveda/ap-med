begin;

-- A superseded intent never reached the provider: it was either rejected before
-- claim, retired while pending, or skipped after the final eligibility check.
-- Keep every other state in the unique slot, including uncertain attempts, so
-- changing a phone or rescheduling cannot generate a duplicate text.
alter table public.sms_outbox
  drop constraint sms_outbox_kind_session_id_contact_id_key;
alter table public.sms_outbox
  add constraint sms_superseded_has_no_provider_acceptance check (
    state <> 'superseded' or (provider_message_id is null and sent_at is null)
  );
create unique index sms_outbox_active_meeting_contact_kind_key
  on public.sms_outbox(kind, session_id, contact_id)
  where state <> 'superseded';

-- A phone change leaves a pending intent addressed to the old phone. A delayed
-- same-row meeting can also leave a pending check-in with an expired reply code.
-- Retire either intent transactionally before the worker creates a fresh one.
-- The outbox row lock serializes with claim and the contact share lock prevents
-- a concurrent phone update from invalidating the comparison before commit.
create function public.sms_supersede_stale_pending_outbox(p_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare intent public.sms_outbox; current_phone text;
        stale_phone boolean; stale_reply_code boolean;
begin
  if p_id is null then
    raise exception 'SMS intent ID is required' using errcode = '22023';
  end if;
  select * into intent from public.sms_outbox where id = p_id for update;
  if not found then
    raise exception 'SMS intent not found' using errcode = 'P0002';
  end if;
  -- Another worker may have retired this same row while we were waiting for
  -- its lock. The caller may still try to enqueue; the partial unique index
  -- resolves the race if that worker has already inserted the replacement.
  if intent.state = 'superseded' then
    return true;
  end if;
  if intent.state <> 'pending' or intent.first_attempt_at is not null then
    return false;
  end if;
  select phone_e164 into strict current_phone from public.cohort_sms_contacts
    where id = intent.contact_id and cohort_id = intent.cohort_id for share;
  stale_phone := current_phone is distinct from intent.phone_e164;
  -- A code with under one minute remaining may expire before a member can
  -- answer. Refresh it while no provider request has been made.
  stale_reply_code := intent.kind = 'checkin' and
    intent.reply_expires_at <= clock_timestamp() + interval '1 minute';
  if not stale_phone and not stale_reply_code then
    return false;
  end if;
  update public.sms_outbox set state = 'superseded',
    detail = case when stale_phone then 'Recipient phone changed before provider call'
      else 'Check-in reply code near expiry before provider call' end
    where id = p_id and state = 'pending' and first_attempt_at is null;
  if not found then
    raise exception 'SMS intent changed during replacement' using errcode = '40001';
  end if;
  return true;
end $$;

revoke all on function public.sms_supersede_stale_pending_outbox(uuid)
  from public, anon, authenticated;
grant execute on function public.sms_supersede_stale_pending_outbox(uuid)
  to service_role;

commit;
