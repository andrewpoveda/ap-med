-- A failed final eligibility read happens before a provider request. Releasing
-- that claim must permit a later atomic claim without weakening uncertain-send
-- handling. This test runs against the disposable SMS fixture only.
begin;

update public.cohort_sms_contacts
  set phone_e164 = '+15555550199', consented_at = clock_timestamp() + interval '1 second',
    opted_out_at = null
  where id = '77777777-7777-4777-8777-777777777777';
insert into public.sessions(id, mentor_id, mentee_id, scheduled_at, cohort_id, match_id)
values ('a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', now() + interval '20 hours',
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444');
insert into public.sms_outbox(id, cohort_id, contact_id, session_id, kind, phone_e164, body)
values ('a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2',
  '11111111-1111-4111-8111-111111111111',
  '77777777-7777-4777-8777-777777777777',
  'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1',
  'reminder', '+15555550199', 'Synthetic reminder');

do $$
declare intent_id uuid := 'a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2';
begin
  assert not has_function_privilege('anon', 'public.sms_release_unsent_claim(uuid)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.sms_release_unsent_claim(uuid)', 'EXECUTE');
  assert has_function_privilege('service_role', 'public.sms_release_unsent_claim(uuid)', 'EXECUTE');
  assert public.sms_claim_outbox(intent_id, '+15555559999') is not null;
  assert public.sms_release_unsent_claim(intent_id);
  assert (select state = 'pending' and first_attempt_at is null and
      last_attempt_at is null from public.sms_outbox where id = intent_id);
  assert public.sms_claim_outbox(intent_id, '+15555559999') is not null;
  assert public.sms_finish_outbox(intent_id, 'unknown', 'twilio', null,
    'Synthetic provider outcome uncertain')->>'state' = 'needs_review';
  assert not public.sms_release_unsent_claim(intent_id);
  assert (select state = 'needs_review' from public.sms_outbox where id = intent_id);
end $$;

rollback;
