reset role;
insert into public.admin_users(id,email,role)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','discard-super@example.org','super');
set role service_role;

do $$
declare
  actor uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  cohort uuid;
  owner uuid;
  version bigint;
begin
  cohort := public.ascenso_configure_cohort(null,actor,'Disposable QA cohort','Test organization',null,'setup',null,'Initial setup');
  select organization_id,config_version into owner,version from public.cohorts where id=cohort;
  assert owner is not null;
  assert (select count(*) from public.cohort_operation_events where cohort_id=cohort and action='cohort_created')=1;

  assert public.ascenso_set_cohort_discarded(cohort,actor,true,'Discard test setup',version)=true;
  assert exists(select 1 from public.cohorts where id=cohort and status='discarded' and discarded_at is not null and organization_id=owner);
  assert (select count(*) from public.cohort_operation_events where cohort_id=cohort and action='cohort_discarded')=1;

  -- New writes cannot attach records while the cohort is discarded.
  begin
    insert into public.admin_cohort_grants(admin_id,cohort_id) values(actor,cohort);
    raise exception 'Expected discarded-cohort write rejection';
  exception when check_violation then null; end;
  assert public.ascenso_set_cohort_discarded(cohort,actor,true,'Safe repeated discard',version)=true;
  assert (select count(*) from public.cohort_operation_events where cohort_id=cohort and action='cohort_discarded')=1;

  version := (select config_version from public.cohorts where id=cohort);
  assert public.ascenso_set_cohort_discarded(cohort,actor,false,'Restore test setup',version)=false;
  assert exists(select 1 from public.cohorts where id=cohort and status='setup' and discarded_at is null and organization_id=owner);
  assert exists(select 1 from public.organizations where id=owner);
  assert (select count(*) from public.cohort_operation_events where cohort_id=cohort and action='cohort_restored')=1;

  -- An otherwise setup cohort with any linked program record is ineligible.
  insert into public.admin_cohort_grants(admin_id,cohort_id) values(actor,cohort);
  begin
    perform public.ascenso_set_cohort_discarded(cohort,actor,true,'Should be refused',(select config_version from public.cohorts where id=cohort));
    raise exception 'Expected linked-record refusal';
  exception when check_violation then null; end;
  assert exists(select 1 from public.cohorts where id=cohort and status='setup' and discarded_at is null);
  delete from public.admin_cohort_grants where admin_id=actor and cohort_id=cohort;
  version := (select config_version from public.cohorts where id=cohort);
  assert public.ascenso_set_cohort_discarded(cohort,actor,true,'Discard after cleanup',version)=true;
  assert public.ascenso_set_cohort_discarded(cohort,actor,false,'Restore after cleanup',(select config_version from public.cohorts where id=cohort))=false;
  begin
    perform public.ascenso_set_cohort_discarded(cohort,actor,true,'Stale action',version);
    raise exception 'Expected stale action rejection';
  exception when check_violation then null; end;
  assert exists(select 1 from public.cohorts where id=cohort and status='setup');
  assert not has_function_privilege('authenticated','public.ascenso_set_cohort_discarded(uuid,uuid,boolean,text,bigint)','EXECUTE');
end $$;
