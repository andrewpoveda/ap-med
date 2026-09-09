set role service_role;
do $$ declare c uuid:='11111111-1111-4111-8111-111111111111'; a uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  m uuid:='33333333-3333-4333-8333-333333333333'; me uuid:='66666666-6666-4666-8666-666666666666'; u uuid:=gen_random_uuid(); result jsonb;
begin
  perform public.ascenso_claim_person(u,'mentor@example.org');
  perform public.ascenso_record_access(u,'mentor',m,c);
  perform public.ascenso_record_access(u,'mentor',m,c);
  assert (select count(*) from public.cohort_first_access where member_id=m)=1;
  begin
    perform public.ascenso_record_access(gen_random_uuid(),'mentor',m,c);
    raise exception 'Expected forged access denial';
  exception when insufficient_privilege then null; end;
  result:=public.ascenso_candidate_choice(c,a,m,me,'test',50,'skip','Schedule mismatch');
  assert result->>'matchId' is null;
  assert exists(select 1 from public.cohort_operation_events where action='candidate_skipped' and reason='Schedule mismatch');
  result:=public.ascenso_candidate_choice(c,a,m,me,'test',50,'select','Confirmed availability');
  assert exists(select 1 from public.cohort_matches where id=(result->>'matchId')::uuid and status='board_approved');
  assert exists(select 1 from public.cohort_operation_events where target_id=(result->>'matchId')::uuid and action='candidate_choice_reason');
  assert not has_table_privilege('authenticated','public.cohort_first_access','SELECT');
  assert not has_function_privilege('authenticated','public.ascenso_record_access(uuid,text,uuid,uuid)','EXECUTE');
end $$;
