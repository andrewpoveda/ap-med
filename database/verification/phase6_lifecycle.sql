reset role;
insert into public.admin_users(id,email,role) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','super@example.org','super');
set role service_role;
do $$ declare c uuid; a uuid; pair uuid; booked uuid; s uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc'; begin
  c:=public.ascenso_configure_cohort(null,s,'New program','Organization',null,'setup',null,'Initial setup');
  a:=public.ascenso_manage_grant(s,c,'director@example.org',true,'Program director');
  perform public.ascenso_assert_admin(a,c);
  perform public.ascenso_manage_grant(s,'11111111-1111-4111-8111-111111111111','director@example.org',true,'Second cohort');
  assert (select count(*) from public.admin_cohort_grants where admin_id=a and revoked_at is null)=2;
  begin
    perform public.ascenso_manage_grant(a,c,'other@example.org',true,'Self escalation');
    raise exception 'Expected super-only grant management';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.cohort_applications(cohort_id,role,track,full_name,email) values(c,'mentee','test','Applicant','person@example.org');
    raise exception 'Expected setup intake denial';
  exception when check_violation then null; end;
  perform public.ascenso_configure_cohort(c,a,'New program','Organization','2026-09-01','applications_open','setup','Open intake');
  begin
    perform public.ascenso_configure_cohort(c,a,'Stale','Organization',null,'matching','setup','Stale tab');
    raise exception 'Expected stale status denial';
  exception when check_violation then null; end;
  perform public.ascenso_configure_cohort(c,a,'New program','Organization','2026-09-01','matching','applications_open','Begin review');
  perform public.ascenso_configure_cohort(c,a,'New program','Organization','2026-09-01','active','matching','Launch cohort');
  perform public.ascenso_configure_cohort(c,a,'New program','Organization','2026-09-01','closed','active','Close empty pilot');
  assert exists(select 1 from public.cohorts where id=c and status='closed');
  assert (select config->>'orientation_date' from public.cohorts where id=c)='2026-09-01';
  begin
    perform public.ascenso_configure_cohort(c,a,'New program','Organization',null,'active','closed','Reopen');
    raise exception 'Expected closed history protection';
  exception when check_violation then null; end;
  perform public.ascenso_manage_grant(s,c,'director@example.org',false,'Director offboarded');
  begin
    perform public.ascenso_assert_admin(a,c);
    raise exception 'Expected revoked denial';
  exception when insufficient_privilege then null; end;
  perform public.ascenso_assert_admin(a,'11111111-1111-4111-8111-111111111111');
  assert exists(select 1 from public.cohort_operation_events where target_id=a and action='admin_revoked');
  assert not has_function_privilege('authenticated','public.ascenso_manage_grant(uuid,uuid,text,boolean,text)','EXECUTE');
  assert not has_table_privilege('authenticated','public.admin_cohort_grants','SELECT');
  c:='11111111-1111-4111-8111-111111111111';
  perform public.ascenso_configure_cohort(c,s,'Pilot','Test',null,'matching','applications_open','Begin matching');
  perform public.ascenso_configure_cohort(c,s,'Pilot','Test',null,'active','matching','Launch');
  insert into public.cohort_matches(cohort_id,mentor_id,mentee_id,track,status)
    values(c,'33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666','test','active') returning id into pair;
  begin
    perform public.ascenso_configure_cohort(c,s,'Pilot','Test',null,'closed','active','Close pilot');
    raise exception 'Expected live match closeout denial';
  exception when check_violation then null; end;
  perform public.ascenso_match_action(pair,s,'end','Program completed');
  insert into public.sessions(mentor_id,mentee_id,scheduled_at,status) values('33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666',now()+interval '1 day','scheduled') returning id into booked;
  begin
    perform public.ascenso_configure_cohort(c,s,'Pilot','Test',null,'closed','active','Close pilot');
    raise exception 'Expected future session closeout denial';
  exception when check_violation then null; end;
  update public.sessions set status='cancelled',calendar_cleanup_pending=true where id=booked;
  begin
    perform public.ascenso_configure_cohort(c,s,'Pilot','Test',null,'closed','active','Close pilot');
    raise exception 'Expected calendar cleanup closeout denial';
  exception when check_violation then null; end;
  update public.sessions set calendar_cleanup_pending=false where id=booked;
  perform public.ascenso_configure_cohort(c,s,'Pilot','Test',null,'closed','active','Close pilot');
  assert exists(select 1 from public.cohort_matches where id=pair and status='ended');
end $$;
