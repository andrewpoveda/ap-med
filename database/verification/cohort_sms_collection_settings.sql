-- Synthetic cohort setting checks. Run only in a disposable local database.
insert into public.cohorts(id, name, org, status, config)
values
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'Collection test', 'Test', 'setup',
    '{"orientation_date":"2026-10-01","support":{"name":"Program team"}}'),
  ('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', 'Discard test', 'Test', 'setup', '{}');
insert into public.admin_users(id, email, role)
values
  ('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'collection-super@example.org', 'super'),
  ('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'collection-scoped@example.org', 'cohort_admin'),
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'collection-rogue@example.org', 'cohort_admin');
insert into public.admin_cohort_grants(admin_id, cohort_id)
values ('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1');

do $$ begin
  assert not has_function_privilege('anon', 'public.cohort_set_sms_phone_collection(uuid,uuid,text,text,bigint)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.cohort_set_sms_phone_collection(uuid,uuid,text,text,bigint)', 'EXECUTE');
  assert has_function_privilege('service_role', 'public.cohort_set_sms_phone_collection(uuid,uuid,text,text,bigint)', 'EXECUTE');
end $$;

set role service_role;
do $$
declare
  cohort uuid := 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
  discarded uuid := 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
  actor uuid := 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1';
  super_actor uuid := 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
  rogue uuid := 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
begin
  assert (select config->>'sms_phone_collection' from public.cohorts where id=cohort) is null;
  assert public.cohort_set_sms_phone_collection(cohort, actor, 'off', 'Keep collection off', 0)=0;
  assert (select config_version from public.cohorts where id=cohort)=0;
  assert public.cohort_set_sms_phone_collection(cohort, actor, 'optional', 'Start optional collection', 0)=1;
  assert public.cohort_set_sms_phone_collection(cohort, actor, 'optional', 'Keep optional collection', 1)=1;
  assert (select count(*) from public.cohort_operation_events where cohort_id=cohort and action='sms_phone_collection_configured')=1;
  assert (select config->>'orientation_date' from public.cohorts where id=cohort)='2026-10-01';
  assert (select config->'support'->>'name' from public.cohorts where id=cohort)='Program team';
  assert (select config->>'sms_phone_collection' from public.cohorts where id=cohort)='optional';
  assert (select not sms_enabled from public.cohorts where id=cohort);

  begin
    perform public.cohort_set_sms_phone_collection(cohort, actor, 'required', 'Stale version', 0);
    raise exception 'Stale version was accepted';
  exception when check_violation then
    assert sqlerrm='Cohort settings changed; refresh';
  end;
  begin
    perform public.cohort_set_sms_phone_collection(cohort, rogue, 'required', 'No cohort grant', 1);
    raise exception 'Unauthorized actor was accepted';
  exception when insufficient_privilege then
    assert sqlerrm='Not found';
  end;
  begin
    perform public.cohort_set_sms_phone_collection(cohort, actor, 'consent_required', 'Invalid mode', 1);
    raise exception 'Invalid mode was accepted';
  exception when invalid_parameter_value then null;
  end;
  assert public.cohort_set_sms_phone_collection(cohort, actor, 'required', 'Require phone only', 1)=2;
  assert public.cohort_set_sms_phone_collection(cohort, actor, 'off', 'Stop collecting phones', 2)=3;
  assert (select not sms_enabled from public.cohorts where id=cohort);
  assert (select config->>'sms_phone_collection' from public.cohorts where id=cohort)='off';
  assert (select count(*) from public.cohort_operation_events where cohort_id=cohort and action='sms_phone_collection_configured')=3;

  assert public.ascenso_set_cohort_discarded(discarded, super_actor, true, 'Test frozen settings', 0);
  begin
    perform public.cohort_set_sms_phone_collection(discarded, super_actor, 'optional', 'Stale discarded cohort', 1);
    raise exception 'Discarded cohort accepted settings';
  exception when check_violation then
    assert sqlerrm='Discarded cohort settings are frozen';
  end;
end $$;
reset role;
