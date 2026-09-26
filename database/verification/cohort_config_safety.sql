reset role;
insert into public.admin_users(id,email,role)
values
  ('b6b6b6b6-b6b6-4b6b-8b6b-b6b6b6b6b6b6','cohort-safety@example.org','super'),
  ('c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7','other-super@example.org','super');
set role service_role;

do $$
declare
  actor uuid := 'b6b6b6b6-b6b6-4b6b-8b6b-b6b6b6b6b6b6';
  request_id uuid := 'a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5';
  c uuid;
  retry_id uuid;
  owner_id uuid;
  owner_count bigint;
  original_version bigint;
begin
  c := public.ascenso_configure_cohort_guarded(
    null,actor,'Safety pilot','Institution',null,'setup',null,'Create pilot',null,request_id,null
  );
  select organization_id,config_version into owner_id,original_version from public.cohorts where id=c;
  owner_count := (select count(*) from public.organizations);
  retry_id := public.ascenso_configure_cohort_guarded(
    null,actor,'Safety pilot','Institution',null,'setup',null,'Create pilot',null,request_id,null
  );
  assert retry_id=c, 'retry must return the first cohort';
  assert (select count(*) from public.cohorts where creation_request_id=request_id)=1;
  assert (select count(*) from public.organizations)=owner_count, 'retry must not create another owner';
  assert (select count(*) from public.organizations where id=owner_id)=1;
  assert (select count(*) from public.cohort_operation_events where cohort_id=c and action='cohort_created')=1;

  begin
    perform public.ascenso_configure_cohort_guarded(
      null,actor,'Changed pilot','Institution',null,'setup',null,'Create pilot',null,request_id,null
    );
    raise exception 'Expected changed request to be rejected';
  exception when unique_violation then null; end;
  begin
    perform public.ascenso_configure_cohort_guarded(
      null,'c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7',
      'Safety pilot','Institution',null,'setup',null,'Create pilot',null,request_id,null
    );
    raise exception 'Expected a different actor to be rejected';
  exception when unique_violation then null; end;
  assert (select count(*) from public.organizations)=owner_count;

  perform public.ascenso_configure_cohort_guarded(
    c,actor,'Edited pilot','Institution',null,'setup','setup','Correct name',null,null,original_version
  );
  retry_id := public.ascenso_configure_cohort_guarded(
    null,actor,'Safety pilot','Institution',null,'setup',null,'Create pilot',null,request_id,null
  );
  assert retry_id=c, 'retry after an edit must still find the original cohort';
  assert (select name from public.cohorts where id=c)='Edited pilot';
  assert (select config_version from public.cohorts where id=c)>original_version;
  begin
    perform public.ascenso_configure_cohort_guarded(
      c,actor,'Stale pilot','Institution',null,'setup','setup','Old browser tab',null,null,original_version
    );
    raise exception 'Expected stale settings to be rejected';
  exception when check_violation then null; end;
  assert (select name from public.cohorts where id=c)='Edited pilot';

  original_version := (select config_version from public.cohorts where id=c);
  perform public.ascenso_configure_cohort(
    c,actor,'Direct edit','Institution',null,'setup','setup','Existing RPC caller',null
  );
  assert (select config_version from public.cohorts where id=c)>original_version;
  begin
    perform public.ascenso_configure_cohort_guarded(
      c,actor,'Stale after direct edit','Institution',null,'setup','setup','Old browser tab',null,null,original_version
    );
    raise exception 'Expected direct edit to advance the version';
  exception when check_violation then null; end;

  assert not has_function_privilege('anon',
    'public.ascenso_configure_cohort_guarded(uuid,uuid,text,text,date,text,text,text,uuid,uuid,bigint)', 'EXECUTE');
  assert not has_function_privilege('authenticated',
    'public.ascenso_configure_cohort_guarded(uuid,uuid,text,text,date,text,text,text,uuid,uuid,bigint)', 'EXECUTE');
  assert has_function_privilege('service_role',
    'public.ascenso_configure_cohort_guarded(uuid,uuid,text,text,date,text,text,text,uuid,uuid,bigint)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.ascenso_cohort_config_version()', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.ascenso_cohort_config_version()', 'EXECUTE');
end $$;
