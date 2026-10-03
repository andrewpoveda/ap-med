-- Synthetic approval handoff status checks. Run only in disposable PostgreSQL.
insert into public.cohorts(id,name,org,status,config)
values ('e9e9e9e9-e9e9-4e9e-8e9e-e9e9e9e9e9e9','Handoff test','Test',
  'applications_open','{"sms_phone_collection":"optional"}');
insert into public.admin_users(id,email,role)
values ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2','handoff-admin@example.org','super');
insert into public.cohort_applications(id,cohort_id,role,track,full_name,email,answers)
values
  ('a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3','e9e9e9e9-e9e9-4e9e-8e9e-e9e9e9e9e9e9',
    'mentee','test','Phone Applicant','phone-applicant@example.org',
    '{"sms_phone_e164":"+12015550123","sms_consent":false}'),
  ('a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4','e9e9e9e9-e9e9-4e9e-8e9e-e9e9e9e9e9e9',
    'mentee','test','No Phone Applicant','no-phone-applicant@example.org','{}');

do $$ begin
  assert not has_function_privilege('anon',
    'public.sms_record_application_handoff(uuid,uuid,uuid,text)','EXECUTE');
  assert not has_function_privilege('authenticated',
    'public.sms_record_application_handoff(uuid,uuid,uuid,text)','EXECUTE');
  assert has_function_privilege('service_role',
    'public.sms_record_application_handoff(uuid,uuid,uuid,text)','EXECUTE');
end $$;

-- A rollback undoes both the decision and pending handoff marker.
begin;
update public.cohort_applications set status='approved'
  where id='a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3';
do $$ begin
  assert (select sms_handoff_state from public.cohort_applications
    where id='a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3')='pending';
end $$;
rollback;
do $$ begin
  assert (select status from public.cohort_applications
    where id='a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3')='submitted';
  assert (select sms_handoff_state is null from public.cohort_applications
    where id='a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3');
end $$;

update public.cohort_applications set status='approved'
  where id in ('a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3',
    'a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4');
do $$ begin
  assert (select sms_handoff_state from public.cohort_applications
    where id='a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3')='pending';
  assert (select sms_handoff_state is null from public.cohort_applications
    where id='a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4');
  assert public.sms_record_application_handoff(
    'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3',
    'e9e9e9e9-e9e9-4e9e-8e9e-e9e9e9e9e9e9',
    'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2','needs_review')='needs_review';
  assert public.sms_record_application_handoff(
    'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3',
    'e9e9e9e9-e9e9-4e9e-8e9e-e9e9e9e9e9e9',
    'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2','complete')='complete';
  -- An older failed retry cannot replace a confirmed handoff.
  assert public.sms_record_application_handoff(
    'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3',
    'e9e9e9e9-e9e9-4e9e-8e9e-e9e9e9e9e9e9',
    'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2','conflict')='complete';
  assert (select sms_handoff_state from public.cohort_applications
    where id='a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3')='complete';
  begin
    perform public.sms_record_application_handoff(
      'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3',
      'e9e9e9e9-e9e9-4e9e-8e9e-e9e9e9e9e9e9',
      'a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5','complete');
    raise exception 'Unauthorized actor recorded a handoff';
  exception when insufficient_privilege then null; end;
end $$;
