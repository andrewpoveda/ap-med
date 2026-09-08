set role service_role;
do $$ begin
  assert not exists(select 1 from public.cohorts where definition_version<>'ascenso-v1');
  begin
    update public.cohorts set definition_version='future-v2' where id='11111111-1111-4111-8111-111111111111';
    raise exception 'Expected historical definition protection';
  exception when raise_exception then assert SQLERRM='Program definition is immutable; create a new cohort'; end;
  assert (select definition_version from public.cohorts where id='11111111-1111-4111-8111-111111111111')='ascenso-v1';
  begin
    insert into public.cohorts(name,org,status,definition_version) values('Unsupported','Organization','setup','future-v2');
    raise exception 'Expected unsupported definition denial';
  exception when check_violation then null; end;
end $$;
