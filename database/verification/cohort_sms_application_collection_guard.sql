-- Synthetic intake policy checks. Run only in the disposable local PostgreSQL cluster.
-- dblink provides a second transaction to prove the cohort row lock serializes
-- policy changes with application inserts in either order.
create extension if not exists dblink;

insert into public.cohorts(id, name, org, status, config)
values ('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'Collection race', 'Test',
  'applications_open', '{"sms_phone_collection":"off"}');

do $$
declare
  c uuid := 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
  a uuid;
  submitted jsonb := jsonb_build_object(
    'motivation', 'Preserve the application',
    'sms_phone_e164', '+12015550123', 'sms_consent', true,
    'sms_consented_at', '2026-09-27T00:00:00Z',
    'sms_consent_notice', 'Test notice', 'sms_consent_notice_version', 'test-v1');
begin
  insert into public.cohort_applications(cohort_id,role,track,full_name,email,answers)
    values(c,'mentee','test','Off Applicant','off@example.org',submitted)
    returning id into a;
  assert (select answers->>'motivation' from public.cohort_applications where id=a)='Preserve the application';
  assert not (select answers ?| array[
    'sms_phone_e164','sms_consent','sms_consented_at',
    'sms_consent_notice','sms_consent_notice_version']
    from public.cohort_applications where id=a);

  update public.cohorts set config=jsonb_set(config,'{sms_phone_collection}','"optional"') where id=c;
  insert into public.cohort_applications(cohort_id,role,track,full_name,email,answers)
    values(c,'mentee','test','Optional Applicant','optional@example.org',submitted)
    returning id into a;
  assert (select answers->>'sms_phone_e164' from public.cohort_applications where id=a)='+12015550123';

  update public.cohorts set config=jsonb_set(config,'{sms_phone_collection}','"required"') where id=c;
  begin
    insert into public.cohort_applications(cohort_id,role,track,full_name,email,answers)
      values(c,'mentee','test','No Phone','no-phone@example.org','{"motivation":"Test"}');
    raise exception 'Required mode accepted a missing phone';
  exception when check_violation then
    assert sqlerrm='Phone collection settings changed; reload and enter a valid phone number';
  end;
  begin
    insert into public.cohort_applications(cohort_id,role,track,full_name,email,answers)
      values(c,'mentee','test','Invalid Phone','invalid-phone@example.org',
        '{"sms_phone_e164":"not a phone","sms_consent":false}');
    raise exception 'Required mode accepted an invalid phone';
  exception when check_violation then
    assert sqlerrm='Phone collection settings changed; reload and enter a valid phone number';
  end;
  insert into public.cohort_applications(cohort_id,role,track,full_name,email,answers)
    values(c,'mentee','test','Phone No Consent','no-consent@example.org',
      '{"sms_phone_e164":"+12015550123","sms_consent":false}')
    returning id into a;
  assert (select answers->>'sms_phone_e164' from public.cohort_applications where id=a)='+12015550123';
  assert (select answers->>'sms_consent' from public.cohort_applications where id=a)='false';

  update public.cohorts set config=jsonb_set(config,'{sms_phone_collection}','"unknown"') where id=c;
  insert into public.cohort_applications(cohort_id,role,track,full_name,email,answers)
    values(c,'mentee','test','Unknown Applicant','unknown@example.org',submitted)
    returning id into a;
  assert not (select answers ? 'sms_phone_e164' from public.cohort_applications where id=a);
end $$;

update public.cohorts
  set config=jsonb_set(config,'{sms_phone_collection}','"optional"')
  where id='f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
select dblink_connect('sms_collection_race', format('host=%s port=%s dbname=%s user=%s',
  current_setting('unix_socket_directories'), current_setting('port'), current_database(), current_user));

-- An application that gets the share lock first keeps its phone; the admin
-- setting change waits until that insert commits.
begin;
insert into public.cohort_applications(cohort_id,role,track,full_name,email,answers)
  values('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1','mentee','test','Insert First',
    'insert-first@example.org','{"sms_phone_e164":"+12015550123","sms_consent":false}');
select dblink_send_query('sms_collection_race', $$
  update public.cohorts set config=jsonb_set(config,'{sms_phone_collection}','"off"')
  where id='f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1'
$$);
select pg_sleep(0.2);
do $$ begin assert dblink_is_busy('sms_collection_race')=1; end $$;
commit;
select * from dblink_get_result('sms_collection_race') as result(status text);
select * from dblink_get_result('sms_collection_race') as result(status text);
do $$ begin
  assert (select answers->>'sms_phone_e164' from public.cohort_applications
    where email='insert-first@example.org')='+12015550123';
  assert (select config->>'sms_phone_collection' from public.cohorts
    where id='f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1')='off';
end $$;

-- If the admin gets the update lock first, a stale optional form waits and
-- then commits without any SMS answers after off becomes authoritative.
update public.cohorts
  set config=jsonb_set(config,'{sms_phone_collection}','"optional"')
  where id='f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
begin;
update public.cohorts
  set config=jsonb_set(config,'{sms_phone_collection}','"off"')
  where id='f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
select dblink_send_query('sms_collection_race', $$
  insert into public.cohort_applications(cohort_id,role,track,full_name,email,answers)
    values('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1','mentee','test','Off First',
      'off-first@example.org',
      '{"sms_phone_e164":"+12015550123","sms_consent":true,"sms_consented_at":"2026-09-27T00:00:00Z"}')
$$);
select pg_sleep(0.2);
do $$ begin assert dblink_is_busy('sms_collection_race')=1; end $$;
commit;
select * from dblink_get_result('sms_collection_race') as result(status text);
select * from dblink_get_result('sms_collection_race') as result(status text);
do $$ begin
  assert not (select answers ?| array['sms_phone_e164','sms_consent','sms_consented_at']
    from public.cohort_applications where email='off-first@example.org');
end $$;

-- An admin switch to required also wins over a stale optional form that lacks
-- a phone, while leaving consent optional for applications with a phone.
update public.cohorts
  set config=jsonb_set(config,'{sms_phone_collection}','"optional"')
  where id='f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
begin;
update public.cohorts
  set config=jsonb_set(config,'{sms_phone_collection}','"required"')
  where id='f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
select dblink_send_query('sms_collection_race', $$
  insert into public.cohort_applications(cohort_id,role,track,full_name,email,answers)
    values('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1','mentee','test','Required First',
      'required-first@example.org','{"motivation":"Stale optional form"}')
$$);
select pg_sleep(0.2);
do $$ begin assert dblink_is_busy('sms_collection_race')=1; end $$;
commit;
select * from dblink_get_result('sms_collection_race', false) as result(status text);
do $$ begin
  assert position('Phone collection settings changed' in dblink_error_message('sms_collection_race'))>0;
  assert not exists(select 1 from public.cohort_applications where email='required-first@example.org');
end $$;
select * from dblink_get_result('sms_collection_race') as result(status text);

select dblink_disconnect('sms_collection_race');
