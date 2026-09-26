-- Synthetic survey mutation checks after the full migration chain.
set role service_role;
insert into public.admin_users(id,email,role)
  values('99999999-9999-4999-8999-999999999999','survey-rpc-admin@example.org','super');
insert into public.cohorts(id,name,org,status)
  values('11111111-1111-4111-8111-111111111111','Survey RPC','Verification','active');
insert into public.surveys(id,cohort_id,wave,title,questions,status)
  values('22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111','mid_year','Survey RPC','[]','draft');

do $$ declare
  s uuid:='22222222-2222-4222-8222-222222222222';
  c uuid:='11111111-1111-4111-8111-111111111111';
  actor uuid:='99999999-9999-4999-8999-999999999999';
begin
  begin
    perform public.ascenso_mutate_survey(s,c,actor,null,'draft');
    raise exception 'Expected null action denial';
  exception when check_violation then null; end;
  assert (select status from public.surveys where id=s)='draft';
  begin
    perform public.ascenso_mutate_survey(s,gen_random_uuid(),actor,'delete','draft');
    raise exception 'Expected wrong-cohort denial';
  exception when no_data_found then null; end;
  assert public.ascenso_mutate_survey(s,c,actor,'open','draft')='open';
  begin
    perform public.ascenso_mutate_survey(s,c,actor,'close','draft');
    raise exception 'Expected stale-status denial';
  exception when check_violation then null; end;
  assert public.ascenso_mutate_survey(s,c,actor,'close','open')='closed';
  assert public.ascenso_mutate_survey(s,c,actor,'delete','closed')='deleted';
  assert not exists(select 1 from public.surveys where id=s);
end $$;
reset role;
