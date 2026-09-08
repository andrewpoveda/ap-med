-- Synthetic only. These tests run after the full active migration chain.
insert into public.cohorts(id,name,org,status) values('11111111-1111-4111-8111-111111111111','Pilot','Test','applications_open'),('22222222-2222-4222-8222-222222222222','Other','Test','applications_open');
insert into public.admin_users(id,email,role,cohort_id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin@example.org','cohort_admin','11111111-1111-4111-8111-111111111111'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','other@example.org','cohort_admin','22222222-2222-4222-8222-222222222222');
do $$ begin
  if to_regclass('public.admin_cohort_grants') is not null then
    execute 'insert into public.admin_cohort_grants(admin_id,cohort_id) select id,cohort_id from public.admin_users where cohort_id is not null';
  end if;
end $$;
insert into public.mentor(id,first_name,last_name,"current_role",institution,bio,current_stage,email,cohort_id) values
 ('33333333-3333-4333-8333-333333333333','Mentor','One','Student','Test','','','mentor@example.org','11111111-1111-4111-8111-111111111111'),
 ('44444444-4444-4444-8444-444444444444','Mentor','Two','Student','Test','','','mentor2@example.org','11111111-1111-4111-8111-111111111111');
insert into public.mentees(id,full_name,email,cohort_id) values
 ('55555555-5555-4555-8555-555555555555','Mentee One','mentee@example.org','11111111-1111-4111-8111-111111111111'),
 ('66666666-6666-4666-8666-666666666666','Mentee Two','mentee2@example.org','11111111-1111-4111-8111-111111111111');

set role service_role;
do $$
declare c uuid:='11111111-1111-4111-8111-111111111111'; actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 app uuid; mid uuid; pair uuid; d uuid; claim jsonb; old_key text; x text; n integer; s text;
begin
  insert into public.cohort_applications(cohort_id,role,track,full_name,email,answers) values(c,'mentor','test','Exact Mentor','alex_smith@example.org','{"specialty":["Cardiology"]}') returning id into app;
  -- A wildcard-like address must not claim the dot-address profile.
  insert into public.mentor(first_name,last_name,"current_role",institution,bio,current_stage,email) values('Different','Person','','','','','alex.smith@example.org');
  assert public.ascenso_review_application(app,actor,'waitlisted','Review','alex_smith@example.org')='waitlisted';
  assert public.ascenso_review_application(app,actor,'waitlisted','Repeat','alex_smith@example.org')='waitlisted';
  assert (select count(*) from public.cohort_delivery where source_id=app)=1;
  assert (select count(*) from public.cohort_operation_events where target_id=app)=1;
  assert public.ascenso_review_application(app,actor,'approved','Approve','alex_smith@example.org')='approved';
  select member_id into mid from public.cohort_applications where id=app;
  assert (select normalized_email from public.mentor where id=mid)='alex_smith@example.org';
  assert (select cohort_id is null from public.mentor where normalized_email='alex.smith@example.org');
  assert (select specialty from public.mentor where id=mid)=array['Cardiology'];
  assert (select state from public.cohort_delivery where source_id=app and variant='waitlisted')='superseded';
  begin
    perform public.ascenso_review_application(app,actor,'rejected','No','alex_smith@example.org');
    raise exception 'Expected final approval protection';
  exception when check_violation then null; end;
  begin
    perform public.ascenso_change_member(mid,c,'mentor','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','{"bio":"bad"}','scope','{}');
    raise exception 'Expected wrong-cohort denial';
  exception when insufficient_privilege then null; end;
  perform public.ascenso_change_member(mid,c,'mentor',actor,'{"first_name":"Corrected"}','Name correction','{"first_name":"Exact"}');
  assert (select first_name from public.mentor where id=mid)='Corrected';
  begin
    perform public.ascenso_change_member(mid,c,'mentor',actor,'{"first_name":"Stale"}','stale','{"first_name":"Exact"}');
    raise exception 'Expected stale edit denial';
  exception when check_violation then null; end;
  begin
    perform public.ascenso_change_member(mid,c,'mentor',actor,'{"email":"attacker@example.org"}','identity','{}');
    raise exception 'Expected immutable identity';
  exception when raise_exception then assert SQLERRM='Unsupported correction'; end;

  insert into public.cohort_matches(cohort_id,mentor_id,mentee_id,track,status) values(c,mid,'55555555-5555-4555-8555-555555555555','test','board_approved') returning id into pair;
  begin
    insert into public.cohort_matches(cohort_id,mentor_id,mentee_id,track,status) values(c,'44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','test','board_approved');
    raise exception 'Expected mentee cardinality';
  exception when unique_violation then null; end;
  begin
    perform public.ascenso_change_member(mid,c,'mentor',actor,'{"membership_status":"withdrawn"}','withdraw','{}');
    raise exception 'Expected match-first guard';
  exception when check_violation then null; end;
  assert public.ascenso_match_action(pair,actor,'activate')='active';
  assert public.ascenso_match_action(pair,actor,'activate')='active';
  assert (select count(*) from public.cohort_delivery where source_id=pair)=2;
  begin
    delete from public.cohort_matches where id=pair;
    raise exception 'Expected historical deletion denial';
  exception when raise_exception then assert SQLERRM='Historical matches cannot be deleted'; end;

  select id into d from public.cohort_delivery where source_id=pair and variant='mentor';
  claim:=public.ascenso_claim_delivery(d,'{"subject":"Frozen"}');
  assert claim->>'state'='sending'; old_key:=claim->>'attempt_key';
  assert public.ascenso_claim_delivery(d,'{"subject":"Changed"}') is null;
  assert not public.ascenso_finish_delivery(d,gen_random_uuid(),'wrong-worker');
  assert public.ascenso_finish_delivery(d,(claim->>'claim_token')::uuid,'provider-accepted');
  assert public.ascenso_claim_delivery(d,'{}') is null;
  assert (select count(*) from public.email_log where ref_id=pair)=1;
  select id into d from public.cohort_delivery where source_id=pair and variant='mentee';
  claim:=public.ascenso_claim_delivery(d,'{"subject":"Frozen"}'); old_key:=claim->>'attempt_key';
  assert public.ascenso_finish_delivery(d,(claim->>'claim_token')::uuid,null);
  assert (select status from public.cohort_matches where id=pair)='active';
  claim:=public.ascenso_claim_delivery(d,'{"subject":"Changed"}');
  assert claim->>'attempt_key'=old_key;
  assert claim->'message'->>'subject'='Frozen';
  assert public.ascenso_finish_delivery(d,(claim->>'claim_token')::uuid,null);
  update public.cohort_delivery set first_attempt_at=now()-interval '25 hours' where id=d;
  assert public.ascenso_claim_delivery(d,'{}') is null;
  assert (select state from public.cohort_delivery where id=d)='needs_review';
  perform public.ascenso_resolve_delivery(d,actor,false,'Provider confirmed this request was not accepted');
  claim:=public.ascenso_claim_delivery(d,'{}');
  assert claim->>'attempt_key'<>old_key;
  assert public.ascenso_finish_delivery(d,(claim->>'claim_token')::uuid,'provider-2');
  assert (select count(*) from public.email_log where ref_id=pair)=2;
  assert public.ascenso_match_action(pair,actor,'end','Participant requested a different partner')='ended';
  assert (select end_reason from public.cohort_matches where id=pair)='Participant requested a different partner';
  begin
    insert into public.cohort_matches(cohort_id,mentor_id,mentee_id,track,status) values(c,mid,'55555555-5555-4555-8555-555555555555','test','board_approved');
    raise exception 'Expected retained exact-pair protection';
  exception when unique_violation then null; end;
  -- A different partner is selectable after end. Delete only the new selection.
  insert into public.cohort_matches(cohort_id,mentor_id,mentee_id,track,status) values(c,mid,'66666666-6666-4666-8666-666666666666','test','board_approved') returning id into d;
  delete from public.cohort_matches where id=d;
  perform public.ascenso_change_member(mid,c,'mentor',actor,'{"membership_status":"offboarded"}','Leave program','{}');
  assert (select membership_status from public.mentor where id=mid)='offboarded';
  assert (select state from public.cohort_delivery where source_id=app and variant='approved')='superseded';
  begin
    update public.mentor set auth_user_id=gen_random_uuid() where id=mid;
    raise exception 'Expected inactive claim denial';
  exception when raise_exception then assert SQLERRM='Inactive membership cannot be claimed'; end;
  begin
    insert into public.cohort_matches(cohort_id,mentor_id,mentee_id,track,status) values(c,mid,'66666666-6666-4666-8666-666666666666','test','board_approved');
    raise exception 'Expected inactive member denial';
  exception when check_violation then null; end;
  -- Preserve authority when all remaining email capacity has been consumed.
  perform public.reserve_email_budget(90-(select count(*)::int from public.email_log)-(select coalesce(sum(slots_remaining),0)::int from public.email_budget_reservations));
  insert into public.cohort_applications(cohort_id,role,track,full_name,email) values(c,'mentee','test','Waitlist','wait@example.org') returning id into app;
  assert public.ascenso_review_application(app,actor,'rejected','Review','wait@example.org')='rejected';
  select id into d from public.cohort_delivery where source_id=app;
  assert public.ascenso_claim_delivery(d,'{}') is null;
  assert (select status from public.cohort_applications where id=app)='rejected';
  assert (select detail from public.cohort_delivery where id=d) like 'Daily email budget%';
end $$;
reset role;
do $$ declare r text; f record; begin
  foreach r in array array['anon','authenticated'] loop
    assert not has_table_privilege(r,'public.cohort_delivery','SELECT');
    assert not has_table_privilege(r,'public.cohort_operation_events','SELECT');
    for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'ascenso_%' loop
      assert not has_function_privilege(r,f.oid,'EXECUTE');
    end loop;
  end loop;
  assert (select relrowsecurity from pg_class where oid='public.cohort_delivery'::regclass);
end $$;
