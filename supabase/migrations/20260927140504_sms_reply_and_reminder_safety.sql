begin;

-- A meeting moved after queueing must not receive an inaccurate "about a day"
-- reminder. A move beyond 30 hours leaves the unsent intent pending so the
-- existing worker can pick it up when that same session re-enters the window.
-- A move inside 18 hours is too late for a truthful reminder; the existing
-- claim RPC supersedes it on this check violation. The worker and final
-- eligibility read use the same inclusive 18-30 hour window.
create function public.sms_reminder_window_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare scheduled_at timestamptz; now_at timestamptz := clock_timestamp();
begin
  if old.state = 'pending' and new.state = 'sending' and new.kind = 'reminder' then
    select s.scheduled_at into strict scheduled_at from public.sessions s
      where s.id = new.session_id;
    if scheduled_at > now_at + interval '30 hours' then
      return null;
    end if;
    if scheduled_at < now_at + interval '18 hours' then
      raise exception 'Meeting reminder is outside its send window'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger sms_reminder_window_guard before update of state
  on public.sms_outbox for each row
  execute function public.sms_reminder_window_guard();

-- The post-claim read must also catch a reschedule between the atomic claim
-- and the external provider call. In that narrow race, skipping is safer than
-- sending the old timing; the worker records the attempt as superseded.
create or replace function public.sms_check_claim_eligible(p_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select exists (
    select 1
    from public.sms_outbox o
    join public.cohorts c on c.id = o.cohort_id
    join public.cohort_sms_contacts contact on contact.id = o.contact_id
    join public.sessions s on s.id = o.session_id
    join public.cohort_matches m on m.id = s.match_id
    join public.mentor mentor_row on mentor_row.id = s.mentor_id
    join public.mentees mentee_row on mentee_row.id = s.mentee_id
    left join public.meeting_checkins ck on ck.id = o.checkin_id
    where o.id = p_id and o.state = 'sending'
      and o.first_attempt_at is not null and o.sender_phone_e164 is not null
      and c.status = 'active' and c.sms_enabled
      and contact.cohort_id = o.cohort_id
      and contact.phone_e164 = o.phone_e164
      and contact.consented_at is not null and contact.opted_out_at is null
      and not exists (
        select 1 from public.sms_phone_suppressions stop
        where stop.phone_e164 = o.phone_e164 and
          (stop.resumed_at is null or stop.resumed_at <= stop.opted_out_at
            or contact.consented_at <= stop.opted_out_at)
      )
      and s.cohort_id = o.cohort_id and m.cohort_id = o.cohort_id
      and s.mentor_id = m.mentor_id and s.mentee_id = m.mentee_id
      and (
        (o.kind = 'reminder' and m.status = 'active'
          and s.status = 'scheduled' and s.scheduled_at between
            clock_timestamp() + interval '18 hours' and
            clock_timestamp() + interval '30 hours'
          and ((contact.person_id = mentor_row.person_id
              and mentor_row.membership_status = 'active')
            or (contact.person_id = mentee_row.person_id
              and mentee_row.membership_status = 'active')))
        or
        (o.kind = 'checkin' and ck.id is not null
          and m.status in ('active', 'ended')
          and ck.cohort_id = o.cohort_id and ck.match_id = m.id
          and ck.session_id = s.id and ck.responded_at is null
          and o.reply_expires_at > clock_timestamp()
          and s.status in ('scheduled', 'completed', 'no_show')
          and s.scheduled_at <= clock_timestamp()
          and ((ck.member_type = 'mentor' and ck.member_id = m.mentor_id
              and contact.person_id = mentor_row.person_id
              and mentor_row.membership_status = 'active')
            or (ck.member_type = 'mentee' and ck.member_id = m.mentee_id
              and contact.person_id = mentee_row.person_id
              and mentee_row.membership_status = 'active')))
      )
  );
$$;

-- The outbound cohort switch prevents new sends. A signed reply to an already
-- attempted prompt may still arrive while sending is paused. The unique code,
-- fixed From/To, current consent/STOP and meeting/member checks still apply.
-- A valid reply also proves an uncertain provider attempt reached the member;
-- keep the outbox in needs_review for provider reconciliation.
create or replace function public.sms_process_inbound(
  p_provider text, p_message_id text,
  p_from_phone_e164 text, p_to_phone_e164 text,
  p_body text, p_opt_out_type text default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare provider_name text; receipt_id uuid; prior public.sms_inbound_receipts;
        command_word text; input_text text; reference_code text; answer_text text;
        o public.sms_outbox; ck public.meeting_checkins;
        c public.cohorts; contact public.cohort_sms_contacts;
        s public.sessions; m public.cohort_matches;
        participant_person uuid; participant_status text;
        stopped public.sms_phone_suppressions; changed integer;
        now_at timestamptz := clock_timestamp();
begin
  provider_name := lower(btrim(coalesce(p_provider, '')));
  if provider_name = '' or length(provider_name) > 100 or
    p_message_id is null or length(btrim(p_message_id)) not between 1 and 255 or
    p_from_phone_e164 is null or p_from_phone_e164 !~ '^\+[1-9][0-9]{1,14}$' or
    p_to_phone_e164 is null or p_to_phone_e164 !~ '^\+[1-9][0-9]{1,14}$' then
    raise exception 'Invalid inbound SMS identity' using errcode = '22023';
  end if;

  insert into public.sms_inbound_receipts(
    provider, provider_message_id, from_phone_e164, to_phone_e164
  ) values (provider_name, p_message_id, p_from_phone_e164, p_to_phone_e164)
  on conflict (provider, provider_message_id) do nothing
  returning id into receipt_id;
  if receipt_id is null then
    select * into strict prior from public.sms_inbound_receipts
      where provider = provider_name and provider_message_id = p_message_id;
    if prior.from_phone_e164 is distinct from p_from_phone_e164 or
      prior.to_phone_e164 is distinct from p_to_phone_e164 then
      raise exception 'Inbound message ID changed sender or recipient'
        using errcode = '23514';
    end if;
    return jsonb_build_object('resolution', 'duplicate');
  end if;

  -- Twilio's signed OptOutType is authoritative for configured keywords.
  command_word := upper(btrim(coalesce(p_opt_out_type, '')));
  if command_word not in ('STOP', 'START', 'HELP') then
    input_text := upper(btrim(coalesce(p_body, ''), E' \t\n\r\f'));
    if input_text in ('STOP', 'STOPALL', 'UNSUBSCRIBE', 'END', 'QUIT',
      'REVOKE', 'OPTOUT', 'CANCEL') then command_word := 'STOP';
    elsif input_text in ('START', 'UNSTOP') then command_word := 'START';
    elsif input_text in ('HELP', 'INFO') then command_word := 'HELP';
    else command_word := null; end if;
  end if;

  if command_word = 'STOP' then
    insert into public.sms_phone_suppressions(phone_e164, opted_out_at, resumed_at, source)
      values (p_from_phone_e164, now_at, null, 'stop')
      on conflict (phone_e164) do update set
        opted_out_at = excluded.opted_out_at, resumed_at = null, source = 'stop';
    update public.sms_outbox set state = 'superseded', detail = 'Recipient opted out'
      where phone_e164 = p_from_phone_e164 and state = 'pending';
    update public.sms_inbound_receipts set resolution = 'stop' where id = receipt_id;
    return jsonb_build_object('resolution', 'stop');
  elsif command_word = 'START' then
    -- The original cohort consent remains revoked by its old timestamp until
    -- this person gives fresh AP MED consent through an authenticated flow.
    update public.sms_phone_suppressions set resumed_at = now_at
      where phone_e164 = p_from_phone_e164;
    update public.sms_inbound_receipts set resolution = 'start' where id = receipt_id;
    return jsonb_build_object('resolution', 'start');
  elsif command_word = 'HELP' then
    update public.sms_inbound_receipts set resolution = 'ignored' where id = receipt_id;
    return jsonb_build_object('resolution', 'ignored');
  end if;

  input_text := btrim(coalesce(p_body, ''), E' \t\n\r\f');
  if length(input_text) < 14 or left(input_text, 12) !~* '^[A-F0-9]{12}$' or
    substring(input_text from 13 for 1) !~ '[[:space:]]' then
    update public.sms_inbound_receipts set resolution = 'unmatched' where id = receipt_id;
    return jsonb_build_object('resolution', 'unmatched');
  end if;
  reference_code := upper(left(input_text, 12));
  answer_text := btrim(substring(input_text from 13), E' \t\n\r\f');
  if length(answer_text) not between 1 and 2000 then
    update public.sms_inbound_receipts set resolution = 'unmatched' where id = receipt_id;
    return jsonb_build_object('resolution', 'unmatched');
  end if;

  select * into o from public.sms_outbox where reply_code = reference_code for update;
  if not found or o.kind <> 'checkin' or not (
      (o.state = 'accepted' and o.provider = provider_name
        and o.provider_message_id is not null) or
      (o.state in ('sending', 'needs_review') and o.first_attempt_at is not null
        and (o.provider is null or o.provider = provider_name))
    ) or
    o.phone_e164 is distinct from p_from_phone_e164 or
    o.sender_phone_e164 is distinct from p_to_phone_e164 or
    o.reply_expires_at <= now_at or o.checkin_id is null then
    update public.sms_inbound_receipts set resolution = 'unmatched' where id = receipt_id;
    return jsonb_build_object('resolution', 'unmatched');
  end if;

  select * into ck from public.meeting_checkins where id = o.checkin_id for update;
  select * into c from public.cohorts where id = o.cohort_id for share;
  select * into contact from public.cohort_sms_contacts where id = o.contact_id for share;
  select * into s from public.sessions where id = o.session_id;
  select * into m from public.cohort_matches where id = ck.match_id;
  if ck.id is null or c.id is null or contact.id is null or s.id is null or m.id is null or
    c.status <> 'active' or
    ck.responded_at is not null or
    (ck.cohort_id, ck.session_id, ck.match_id)
      is distinct from (o.cohort_id, o.session_id, s.match_id) or
    (s.cohort_id, s.match_id, s.mentor_id, s.mentee_id)
      is distinct from (o.cohort_id, m.id, m.mentor_id, m.mentee_id) or
    m.cohort_id is distinct from o.cohort_id or m.status not in ('active', 'ended') or
    s.status not in ('scheduled', 'completed', 'no_show') or s.scheduled_at > now_at or
    contact.cohort_id is distinct from o.cohort_id or
    contact.phone_e164 is distinct from p_from_phone_e164 or
    contact.consented_at is null or contact.opted_out_at is not null then
    update public.sms_inbound_receipts set resolution = 'unmatched' where id = receipt_id;
    return jsonb_build_object('resolution', 'unmatched');
  end if;
  select * into stopped from public.sms_phone_suppressions
    where phone_e164 = p_from_phone_e164 for share;
  if stopped.phone_e164 is not null and
    (stopped.resumed_at is null or stopped.resumed_at <= stopped.opted_out_at or
      contact.consented_at <= stopped.opted_out_at) then
    update public.sms_inbound_receipts set resolution = 'unmatched' where id = receipt_id;
    return jsonb_build_object('resolution', 'unmatched');
  end if;

  if ck.member_type = 'mentor' then
    select person_id, membership_status into participant_person, participant_status
      from public.mentor where id = ck.member_id and cohort_id = ck.cohort_id for share;
    if ck.member_id is distinct from m.mentor_id then participant_person := null; end if;
  elsif ck.member_type = 'mentee' then
    select person_id, membership_status into participant_person, participant_status
      from public.mentees where id = ck.member_id and cohort_id = ck.cohort_id for share;
    if ck.member_id is distinct from m.mentee_id then participant_person := null; end if;
  end if;
  if participant_person is distinct from contact.person_id or participant_status <> 'active' then
    update public.sms_inbound_receipts set resolution = 'unmatched' where id = receipt_id;
    return jsonb_build_object('resolution', 'unmatched');
  end if;

  update public.meeting_checkins set response_text = answer_text,
    response_channel = 'sms', responded_at = now_at
  where id = ck.id and responded_at is null;
  get diagnostics changed = row_count;
  if changed <> 1 then
    update public.sms_inbound_receipts set resolution = 'unmatched' where id = receipt_id;
    return jsonb_build_object('resolution', 'unmatched');
  end if;
  update public.sms_inbound_receipts set resolution = 'responded',
    cohort_id = o.cohort_id, matched_outbox_id = o.id
  where id = receipt_id;
  return jsonb_build_object('resolution', 'responded');
end $$;

revoke execute on function public.sms_reminder_window_guard(),
  public.sms_check_claim_eligible(uuid),
  public.sms_process_inbound(text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.sms_reminder_window_guard(),
  public.sms_check_claim_eligible(uuid),
  public.sms_process_inbound(text,text,text,text,text,text)
  to service_role;

commit;
