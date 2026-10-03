-- Run after the SMS migrations against a disposable local database.
-- Only an intent known to be unsent may release its one-message slot.
do $$
declare
  cohort uuid := '91919191-9191-4919-8919-919191919191';
  mentor_id uuid := '92929292-9292-4929-8929-929292929292';
  mentee_id uuid := '93939393-9393-4939-8939-939393939393';
  match_id uuid := '94949494-9494-4949-8949-949494949494';
  contact_id uuid := '95959595-9595-4959-8959-959595959595';
  phone_change_session uuid := '96969696-9696-4969-8969-969696969696';
  accepted_session uuid := '97979797-9797-4979-8979-979797979797';
  uncertain_session uuid := '98989898-9898-4989-8989-989898989898';
  rescheduled_session uuid := '99999999-9999-4999-8999-999999999998';
  expired_session uuid := 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
  checkin_id uuid := 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
  expired_checkin_id uuid := 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3';
  old_intent uuid := 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
  replacement uuid := 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
  accepted_intent uuid := 'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3';
  uncertain_intent uuid := 'b4b4b4b4-b4b4-4b4b-8b4b-b4b4b4b4b4b4';
  first_checkin_intent uuid := 'b5b5b5b5-b5b5-4b5b-8b5b-b5b5b5b5b5b5';
  second_checkin_intent uuid := 'b6b6b6b6-b6b6-4b6b-8b6b-b6b6b6b6b6b6';
  expiring_intent uuid := 'b7b7b7b7-b7b7-4b7b-8b7b-b7b7b7b7b7b7';
  fresh_intent uuid := 'b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8';
  member_person uuid;
begin
  assert not has_function_privilege('anon',
    'public.sms_supersede_stale_pending_outbox(uuid)', 'EXECUTE');
  assert has_function_privilege('service_role',
    'public.sms_supersede_stale_pending_outbox(uuid)', 'EXECUTE');

  insert into public.cohorts(id,name,org,status,sms_enabled)
    values (cohort,'SMS replacement test','Test','active',true);
  insert into public.mentor(id,first_name,last_name,"current_role",institution,bio,current_stage,email,cohort_id)
    values (mentor_id,'Test','Mentor','Doctor','Test','','','replacement-mentor@example.com',cohort);
  insert into public.mentees(id,full_name,email,cohort_id)
    values (mentee_id,'Test Mentee','replacement-mentee@example.com',cohort);
  insert into public.cohort_matches(id,cohort_id,mentor_id,mentee_id,track,status)
    values (match_id,cohort,mentor_id,mentee_id,'test','active');
  select person_id into strict member_person from public.mentor where id = mentor_id;
  insert into public.cohort_sms_contacts(id,cohort_id,person_id,phone_e164,
    consented_at,consent_source,consent_notice_version,consent_notice)
    values (contact_id,cohort,member_person,'+15555550301',clock_timestamp(),
      'test','v1','Synthetic consent');
  insert into public.sessions(id,mentor_id,mentee_id,scheduled_at,cohort_id,match_id)
    values
      (phone_change_session,mentor_id,mentee_id,clock_timestamp()+interval '21 hours',cohort,match_id),
      (accepted_session,mentor_id,mentee_id,clock_timestamp()+interval '24 hours',cohort,match_id),
      (uncertain_session,mentor_id,mentee_id,clock_timestamp()+interval '27 hours',cohort,match_id),
      (rescheduled_session,mentor_id,mentee_id,clock_timestamp()-interval '2 hours',cohort,match_id),
      (expired_session,mentor_id,mentee_id,clock_timestamp()-interval '4 hours',cohort,match_id);

  -- A pending snapshot cannot be retired while it still matches the contact.
  insert into public.sms_outbox(id,cohort_id,contact_id,session_id,kind,phone_e164,body)
    values (old_intent,cohort,contact_id,phone_change_session,
      'reminder','+15555550301','Reminder');
  assert not public.sms_supersede_stale_pending_outbox(old_intent);
  update public.cohort_sms_contacts set phone_e164 = '+15555550302',
    consented_at = greatest(clock_timestamp(), consented_at + interval '1 microsecond')
    where id = contact_id;
  assert public.sms_supersede_stale_pending_outbox(old_intent);
  assert public.sms_supersede_stale_pending_outbox(old_intent);
  assert (select state = 'superseded' and first_attempt_at is null
    from public.sms_outbox where id = old_intent);
  assert public.sms_claim_outbox(old_intent,'+15555559999') is null;
  insert into public.sms_outbox(id,cohort_id,contact_id,session_id,kind,phone_e164,body)
    values (replacement,cohort,contact_id,phone_change_session,
      'reminder','+15555550302','Reminder');
  begin
    insert into public.sms_outbox(cohort_id,contact_id,session_id,kind,phone_e164,body)
      values (cohort,contact_id,phone_change_session,'reminder','+15555550302','Reminder');
    raise exception 'Two active replacements occupied the same meeting slot';
  exception when unique_violation then null;
  end;
  assert public.sms_claim_outbox(replacement,'+15555559999') is not null;
  assert public.sms_finish_outbox(replacement,'accepted','twilio','SM-REPLACEMENT',null)->>'state'
    = 'accepted';

  -- Accepted messages and uncertain provider attempts retain the unique slot
  -- even after the contact changes to a new phone.
  insert into public.sms_outbox(id,cohort_id,contact_id,session_id,kind,phone_e164,body)
    values (accepted_intent,cohort,contact_id,accepted_session,
      'reminder','+15555550302','Reminder');
  assert public.sms_claim_outbox(accepted_intent,'+15555559999') is not null;
  assert public.sms_finish_outbox(accepted_intent,'accepted','twilio','SM-ACCEPTED',null)->>'state'
    = 'accepted';
  begin
    update public.sms_outbox set state = 'superseded' where id = accepted_intent;
    raise exception 'Provider-accepted intent released its unique slot';
  exception when check_violation then null;
  end;
  insert into public.sms_outbox(id,cohort_id,contact_id,session_id,kind,phone_e164,body)
    values (uncertain_intent,cohort,contact_id,uncertain_session,
      'reminder','+15555550302','Reminder');
  assert public.sms_claim_outbox(uncertain_intent,'+15555559999') is not null;
  assert public.sms_finish_outbox(uncertain_intent,'unknown','twilio',null,'Uncertain')->>'state'
    = 'needs_review';
  update public.cohort_sms_contacts set phone_e164 = '+15555550303',
    consented_at = greatest(clock_timestamp(), consented_at + interval '1 microsecond')
    where id = contact_id;
  assert not public.sms_supersede_stale_pending_outbox(accepted_intent);
  assert not public.sms_supersede_stale_pending_outbox(uncertain_intent);
  begin
    insert into public.sms_outbox(cohort_id,contact_id,session_id,kind,phone_e164,body)
      values (cohort,contact_id,accepted_session,'reminder','+15555550303','Reminder');
    raise exception 'Accepted intent allowed a duplicate reminder';
  exception when unique_violation then null;
  end;
  begin
    insert into public.sms_outbox(cohort_id,contact_id,session_id,kind,phone_e164,body)
      values (cohort,contact_id,uncertain_session,'reminder','+15555550303','Reminder');
    raise exception 'Uncertain intent allowed a duplicate reminder';
  exception when unique_violation then null;
  end;

  -- A same-row reschedule after claim but before any provider call produces a
  -- skipped/superseded prompt. Once that meeting has happened, a fresh prompt
  -- for the same member and session can be queued with a new reply code.
  insert into public.meeting_checkins(id,cohort_id,match_id,session_id,member_type,member_id)
    values (checkin_id,cohort,match_id,rescheduled_session,'mentor',mentor_id);
  insert into public.sms_outbox(id,cohort_id,contact_id,session_id,checkin_id,
    kind,phone_e164,body,reply_code,reply_expires_at)
    values (first_checkin_intent,cohort,contact_id,rescheduled_session,checkin_id,
      'checkin','+15555550303','How did it go? Reply A1A1A1A1A1A1',
      'A1A1A1A1A1A1',clock_timestamp()+interval '7 days');
  assert public.sms_claim_outbox(first_checkin_intent,'+15555559999') is not null;
  update public.sessions set scheduled_at = clock_timestamp()+interval '2 days'
    where id = rescheduled_session;
  assert not public.sms_check_claim_eligible(first_checkin_intent);
  assert public.sms_finish_outbox(first_checkin_intent,'skipped','twilio',null,
    'Meeting moved before provider call')->>'state' = 'superseded';
  update public.sessions set scheduled_at = clock_timestamp()-interval '2 hours'
    where id = rescheduled_session;
  insert into public.sms_outbox(id,cohort_id,contact_id,session_id,checkin_id,
    kind,phone_e164,body,reply_code,reply_expires_at)
    values (second_checkin_intent,cohort,contact_id,rescheduled_session,checkin_id,
      'checkin','+15555550303','How did it go? Reply B2B2B2B2B2B2',
      'B2B2B2B2B2B2',clock_timestamp()+interval '7 days');
  assert public.sms_claim_outbox(second_checkin_intent,'+15555559999') is not null;

  -- A pending prompt can survive a long reschedule until its reply code is
  -- about to expire. Refresh it in this due run instead of waiting for another.
  insert into public.meeting_checkins(id,cohort_id,match_id,session_id,member_type,member_id)
    values (expired_checkin_id,cohort,match_id,expired_session,'mentor',mentor_id);
  insert into public.sms_outbox(id,cohort_id,contact_id,session_id,checkin_id,
    kind,phone_e164,body,reply_code,reply_expires_at)
    values (expiring_intent,cohort,contact_id,expired_session,expired_checkin_id,
      'checkin','+15555550303','How did it go? Reply C3C3C3C3C3C3',
      'C3C3C3C3C3C3',clock_timestamp()+interval '30 seconds');
  assert public.sms_supersede_stale_pending_outbox(expiring_intent);
  assert (select state = 'superseded' and first_attempt_at is null
    from public.sms_outbox where id = expiring_intent);
  insert into public.sms_outbox(id,cohort_id,contact_id,session_id,checkin_id,
    kind,phone_e164,body,reply_code,reply_expires_at)
    values (fresh_intent,cohort,contact_id,expired_session,expired_checkin_id,
      'checkin','+15555550303','How did it go? Reply D4D4D4D4D4D4',
      'D4D4D4D4D4D4',clock_timestamp()+interval '7 days');
  assert not public.sms_supersede_stale_pending_outbox(fresh_intent);
  assert public.sms_claim_outbox(fresh_intent,'+15555559999') is not null;
end $$;
