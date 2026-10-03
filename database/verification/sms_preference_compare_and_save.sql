-- Run after verify_sms_atomic.sh's synthetic fixtures in the same local DB.
-- A dashboard snapshot must remain valid across the route read and SQL write.
do $$
declare cohort uuid := '11111111-1111-4111-8111-111111111111';
        person uuid; contact public.cohort_sms_contacts;
        original_consent timestamptz;
begin
  assert not has_function_privilege('anon',
    'public.sms_save_contact_without_consent(uuid,uuid,text,uuid,bigint,boolean)', 'EXECUTE');
  assert not has_function_privilege('authenticated',
    'public.sms_save_contact_without_consent(uuid,uuid,text,uuid,bigint,boolean)', 'EXECUTE');
  assert has_function_privilege('service_role',
    'public.sms_save_contact_without_consent(uuid,uuid,text,uuid,bigint,boolean)', 'EXECUTE');

  insert into public.mentees(id, full_name, email, cohort_id)
    values ('90909090-9090-4090-8090-909090909090', 'Preference version test',
      'preference-version@example.com', cohort);
  select person_id into strict person from public.mentees
    where id = '90909090-9090-4090-8090-909090909090';

  -- An absent contact has a meaningful NULL snapshot. A no-op removal leaves
  -- no row; saving a number without consent creates revision one.
  assert public.sms_save_contact_without_consent(cohort, person, null,
    null, null, true) = 'saved';
  assert not exists(select 1 from public.cohort_sms_contacts
    where cohort_id = cohort and person_id = person);
  assert public.sms_save_contact_without_consent(cohort, person, '+15555550160',
    null, null, true) = 'saved';
  select * into strict contact from public.cohort_sms_contacts
    where cohort_id = cohort and person_id = person;
  assert contact.revision = 1 and contact.consented_at is null and
    contact.opted_out_at is not null;
  assert public.sms_save_contact_without_consent(cohort, person, '+15555550161',
    null, null, true) = 'changed';
  assert (select phone_e164 = '+15555550160' from public.cohort_sms_contacts
    where id = contact.id);

  -- Granting consent after a pending no-consent write makes that older write
  -- stale. It must not revoke the newer consent or replace its phone.
  assert public.sms_save_contact_consent(cohort, person, '+15555550160', null,
    contact.id, contact.phone_e164, contact.consented_at,
    contact.opted_out_at, 'Test consent', 'v1') = 'saved';
  select * into strict contact from public.cohort_sms_contacts
    where cohort_id = cohort and person_id = person;
  assert contact.revision = 2 and contact.consented_at is not null and
    contact.opted_out_at is null;
  original_consent := contact.consented_at;
  assert public.sms_save_contact_without_consent(cohort, person, '+15555550161',
    contact.id, 1, true) = 'changed';
  assert public.sms_save_contact_without_consent(cohort, person, null,
    contact.id, 1, true) = 'changed';
  assert (select phone_e164 = '+15555550160' and
      consented_at = original_consent and opted_out_at is null
    from public.cohort_sms_contacts where id = contact.id);

  -- Disabling enrollment must not trap a member's existing phone or consent.
  update public.cohorts set sms_enabled = false where id = cohort;
  assert public.sms_save_contact_without_consent(cohort, person, '+15555550161',
    contact.id, contact.revision, true) = 'disabled';
  assert public.sms_save_contact_without_consent(cohort, person, '+15555550160',
    contact.id, contact.revision, false) = 'saved';
  select * into strict contact from public.cohort_sms_contacts
    where cohort_id = cohort and person_id = person;
  assert contact.revision = 3 and contact.opted_out_at is not null and
    contact.consented_at = original_consent;
  assert public.sms_save_contact_without_consent(cohort, person, null,
    contact.id, 2, false) = 'changed';
  assert public.sms_save_contact_without_consent(cohort, person, null,
    contact.id, contact.revision, false) = 'saved';
  select * into strict contact from public.cohort_sms_contacts
    where cohort_id = cohort and person_id = person;
  assert contact.revision = 4 and contact.phone_e164 is null and
    contact.consented_at is null and contact.consent_notice is null;
  assert public.sms_save_contact_without_consent(cohort, person, '+15555550161',
    contact.id, contact.revision, false) = 'disabled';

  update public.cohorts set sms_enabled = true where id = cohort;
  assert public.sms_save_contact_without_consent(cohort, person, '+15555550161',
    contact.id, contact.revision, true) = 'saved';
  assert (select revision = 5 and phone_e164 = '+15555550161' and
      consented_at is null and opted_out_at is not null
    from public.cohort_sms_contacts where id = contact.id);
end $$;

-- A request already inside the RPC must wait for the row lock and then compare
-- the committed revision, rather than writing through a newer choice.
create extension if not exists dblink;
select dblink_connect('sms_preference_cas', format('host=%s port=%s dbname=%s user=%s',
  current_setting('unix_socket_directories'), current_setting('port'), current_database(), current_user));
begin;
select 1 from public.cohort_sms_contacts
  where cohort_id = '11111111-1111-4111-8111-111111111111'
    and person_id = (select person_id from public.mentees
      where id = '90909090-9090-4090-8090-909090909090') for update;
select dblink_send_query('sms_preference_cas', $$
  select public.sms_save_contact_without_consent(
    '11111111-1111-4111-8111-111111111111',
    (select person_id from public.mentees
      where id = '90909090-9090-4090-8090-909090909090'),
    null,
    (select id from public.cohort_sms_contacts
      where cohort_id = '11111111-1111-4111-8111-111111111111'
        and person_id = (select person_id from public.mentees
          where id = '90909090-9090-4090-8090-909090909090')),
    5, false)
$$);
select pg_sleep(0.2);
do $$ begin assert dblink_is_busy('sms_preference_cas') = 1; end $$;
update public.cohort_sms_contacts set opted_out_at = clock_timestamp()
  where cohort_id = '11111111-1111-4111-8111-111111111111'
    and person_id = (select person_id from public.mentees
      where id = '90909090-9090-4090-8090-909090909090');
commit;
do $$
declare outcome text;
begin
  select result.outcome into strict outcome
    from dblink_get_result('sms_preference_cas') as result(outcome text);
  assert outcome = 'changed';
  assert (select revision = 6 and phone_e164 = '+15555550161'
    from public.cohort_sms_contacts where cohort_id = '11111111-1111-4111-8111-111111111111'
      and person_id = (select person_id from public.mentees
        where id = '90909090-9090-4090-8090-909090909090'));
end $$;
select dblink_disconnect('sms_preference_cas');
