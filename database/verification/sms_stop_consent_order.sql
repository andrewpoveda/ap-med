-- Run after verify_sms_atomic.sh's synthetic fixtures in the same local DB.
-- The saved revision represents what a dashboard request read before webhooks.
create extension if not exists dblink;
create function pg_temp.sms_try_consent(
  p_cohort uuid, p_person uuid, p_phone text, p_revision bigint,
  p_notice text, p_version text
) returns text language plpgsql as $$
declare prior public.cohort_sms_contacts;
begin
  select * into prior from public.cohort_sms_contacts
    where cohort_id = p_cohort and person_id = p_person;
  return public.sms_save_contact_consent(
    p_cohort, p_person, p_phone, p_revision,
    prior.id, prior.phone_e164, prior.consented_at, prior.opted_out_at,
    p_notice, p_version
  );
end $$;

do $$
declare cohort uuid := '11111111-1111-4111-8111-111111111111';
        mentor_person uuid; before_revision bigint; after_stop bigint;
        after_start bigint; first_consent timestamptz; stopped_at timestamptz;
        prior_contact public.cohort_sms_contacts;
begin
  assert not has_function_privilege('anon',
    'public.sms_save_contact_consent(uuid,uuid,text,bigint,uuid,text,timestamptz,timestamptz,text,text)', 'EXECUTE');
  assert not has_function_privilege('authenticated',
    'public.sms_save_contact_consent(uuid,uuid,text,bigint,uuid,text,timestamptz,timestamptz,text,text)', 'EXECUTE');
  assert has_function_privilege('service_role',
    'public.sms_save_contact_consent(uuid,uuid,text,bigint,uuid,text,timestamptz,timestamptz,text,text)', 'EXECUTE');

  select person_id into strict mentor_person from public.mentor
    where id = '22222222-2222-4222-8222-222222222222';
  select revision into strict before_revision from public.sms_phone_suppressions
    where phone_e164 = '+15555550111';
  assert before_revision >= 1;

  -- START after an unrecorded STOP requires a new signed-in consent. Repeating
  -- the same opt-in preserves the original evidence instead of rewriting it.
  assert pg_temp.sms_try_consent(cohort, mentor_person, '+15555550111',
    before_revision, 'Fresh dashboard notice', 'v2') = 'saved';
  select consented_at into strict first_consent from public.cohort_sms_contacts
    where cohort_id = cohort and person_id = mentor_person;
  update public.cohort_sms_contacts set
    consent_source = 'cohort_application',
    consent_notice = 'Historical application notice',
    consent_notice_version = 'v1'
    where cohort_id = cohort and person_id = mentor_person;
  assert pg_temp.sms_try_consent(cohort, mentor_person, '+15555550111',
    before_revision, 'New dashboard notice', 'v3') = 'saved';
  assert (select consented_at = first_consent and
      consent_source = 'cohort_application' and
      consent_notice = 'Historical application notice'
    from public.cohort_sms_contacts where cohort_id = cohort
      and person_id = mentor_person);

  -- A request that observed the previous revision must fail after STOP then
  -- START, even though the provider has unblocked the number again.
  assert public.sms_process_inbound('twilio', 'SM-RACE-STOP-1',
    '+15555550111', '+15555559999', 'STOP', null)->>'resolution' = 'stop';
  select revision, opted_out_at into strict after_stop, stopped_at
    from public.sms_phone_suppressions where phone_e164 = '+15555550111';
  assert after_stop = before_revision + 1;
  assert pg_temp.sms_try_consent(cohort, mentor_person, '+15555550111',
    after_stop, 'New dashboard notice', 'v3') = 'opted_out';
  assert public.sms_process_inbound('twilio', 'SM-RACE-START-1',
    '+15555550111', '+15555559999', 'START', null)->>'resolution' = 'start';
  select revision into strict after_start from public.sms_phone_suppressions
    where phone_e164 = '+15555550111';
  assert after_start = after_stop + 1;
  assert (select s.resumed_at > s.stopped_at from (
    select resumed_at, opted_out_at as stopped_at
    from public.sms_phone_suppressions where phone_e164 = '+15555550111'
  ) s);
  assert pg_temp.sms_try_consent(cohort, mentor_person, '+15555550111',
    before_revision, 'Stale dashboard notice', 'v3') = 'changed';
  assert (select consented_at = first_consent from public.cohort_sms_contacts
    where cohort_id = cohort and person_id = mentor_person);
  assert first_consent < stopped_at;
  assert pg_temp.sms_try_consent(cohort, mentor_person, '+15555550111',
    after_start, 'Fresh dashboard notice', 'v3') = 'saved';
  assert (select consented_at > stopped_at and consent_source = 'member_dashboard'
    from public.cohort_sms_contacts where cohort_id = cohort
      and person_id = mentor_person);

  -- No suppression row is an observed revision of NULL. A first STOP/START
  -- creates revision two and also rejects that stale request.
  assert not exists(select 1 from public.sms_phone_suppressions
    where phone_e164 = '+15555550113');
  assert public.sms_process_inbound('twilio', 'SM-RACE-STOP-2',
    '+15555550113', '+15555559999', 'STOP', null)->>'resolution' = 'stop';
  assert public.sms_process_inbound('twilio', 'SM-RACE-START-2',
    '+15555550113', '+15555559999', 'START', null)->>'resolution' = 'start';
  assert pg_temp.sms_try_consent(cohort, mentor_person, '+15555550113',
    null, 'Stale dashboard notice', 'v3') = 'changed';
  assert (select phone_e164 = '+15555550111' from public.cohort_sms_contacts
    where cohort_id = cohort and person_id = mentor_person);
  assert pg_temp.sms_try_consent(cohort, mentor_person, '+15555550113',
    2, 'Fresh dashboard notice', 'v3') = 'saved';
  assert (select c.consented_at > s.opted_out_at and
      c.phone_e164 = s.phone_e164 from public.cohort_sms_contacts c
    join public.sms_phone_suppressions s on s.phone_e164 = c.phone_e164
    where c.cohort_id = cohort and c.person_id = mentor_person);

  -- A newer dashboard revocation also defeats the older opt-in, even without
  -- any STOP/START revision change.
  select * into strict prior_contact from public.cohort_sms_contacts
    where cohort_id = cohort and person_id = mentor_person;
  update public.cohort_sms_contacts set opted_out_at = clock_timestamp()
    where id = prior_contact.id;
  assert public.sms_save_contact_consent(
    cohort, mentor_person, '+15555550113', 2,
    prior_contact.id, prior_contact.phone_e164,
    prior_contact.consented_at, prior_contact.opted_out_at,
    'Stale dashboard notice', 'v3'
  ) = 'changed';
  assert (select opted_out_at is not null from public.cohort_sms_contacts
    where id = prior_contact.id);
end $$;

-- A webhook that starts while the dashboard transaction holds the phone lock
-- waits, then records STOP after that transaction. The STOP timestamp must be
-- later than the consent it supersedes, even though inbound RPC's now_at was
-- captured before the wait.
select dblink_connect('sms_stop_order', format('host=%s port=%s dbname=%s user=%s',
  current_setting('unix_socket_directories'), current_setting('port'), current_database(), current_user));
begin;
do $$
declare person uuid;
begin
  select person_id into strict person from public.mentor
    where id = '22222222-2222-4222-8222-222222222222';
  assert pg_temp.sms_try_consent(
    '11111111-1111-4111-8111-111111111111', person, '+15555550113',
    2, 'Concurrent dashboard notice', 'v4') = 'saved';
end $$;
select dblink_send_query('sms_stop_order', $$
  select public.sms_process_inbound('twilio', 'SM-RACE-CONCURRENT-STOP',
    '+15555550113', '+15555559999', 'STOP', null)::text
$$);
select pg_sleep(0.2);
do $$ begin assert dblink_is_busy('sms_stop_order') = 1; end $$;
commit;
select * from dblink_get_result('sms_stop_order') as result(status text);
do $$
begin
  assert (select s.opted_out_at > c.consented_at and s.resumed_at is null
      and s.revision = 3
    from public.sms_phone_suppressions s
    join public.cohort_sms_contacts c on c.phone_e164 = s.phone_e164
    where s.phone_e164 = '+15555550113');
end $$;
select dblink_disconnect('sms_stop_order');
