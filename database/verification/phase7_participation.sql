reset role;
set role service_role;
do $$ declare person uuid; first_member uuid; later_member uuid; app uuid; pair uuid; booked uuid; other_mentor uuid; second_pair uuid; literal_email text; literal_owner uuid; self_member uuid; organization uuid; new_cohort uuid; super_admin uuid;
  c uuid:='11111111-1111-4111-8111-111111111111'; c2 uuid:='22222222-2222-4222-8222-222222222222';
  actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; other_actor uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  owner uuid:='99999999-9999-4999-8999-999999999999';
begin
  insert into public.admin_users(email,role) values('phase7-super@example.org','super') returning id into super_admin;
  select organization_id into organization from public.cohorts where id=c;
  new_cohort:=public.ascenso_configure_cohort(null,super_admin,'Second cycle','Display label',null,'setup',null,'Same organization',organization);
  assert (select organization_id from public.cohorts where id=new_cohort)=organization;
  begin
    update public.cohorts set organization_id=(select organization_id from public.cohorts where id=c2) where id=new_cohort;
    raise exception 'Expected immutable organization owner';
  exception when raise_exception then assert SQLERRM='Organization ownership is immutable; requires deliberate migration'; end;
  foreach literal_email in array array['literal.name@example.org','literal_name@example.org','literal%name@example.org','literal*name@example.org'] loop
    insert into public.mentor(first_name,last_name,"current_role",institution,bio,current_stage,email,cohort_id)
      values('Literal','Identity','','','','',literal_email,c2);
  end loop;
  literal_owner:=gen_random_uuid();
  perform public.ascenso_claim_person(literal_owner,' LITERAL_NAME@example.org ');
  assert (select auth_user_id from public.people where normalized_email='literal_name@example.org')=literal_owner;
  assert not exists(select 1 from public.people where normalized_email in ('literal.name@example.org','literal%name@example.org','literal*name@example.org') and auth_user_id is not null);
  select person_id,id into person,first_member from public.mentor where normalized_email='mentor@example.org';
  assert public.ascenso_claim_person(owner,' MENTOR@example.org ')=person;
  begin
    perform public.ascenso_claim_person(gen_random_uuid(),'mentor@example.org');
    raise exception 'Expected ownership denial';
  exception when insufficient_privilege then null; end;
  insert into public.cohort_applications(cohort_id,role,track,full_name,email) values(c2,'mentee','test','Returning Person','mentor@example.org') returning id into app;
  perform public.ascenso_review_application(app,other_actor,'approved','Returning in a different role','mentor@example.org');
  select member_id into later_member from public.cohort_applications where id=app;
  assert (select person_id from public.mentees where id=later_member)=person;
  assert (select cohort_id from public.mentor where id=first_member)=c;
  assert (select auth_user_id from public.people where id=person)=owner;
  insert into public.mentees(full_name,email,school,current_stage,cohort_id)
    values('Same person','mentor@example.org','','',c) returning id into self_member;
  begin
    insert into public.cohort_matches(cohort_id,mentor_id,mentee_id,track,status)
      values(c,first_member,self_member,'test','active');
    raise exception 'Expected self-match denial';
  exception when check_violation then null; end;
  begin
    update public.mentor set cohort_id=c2 where id=first_member;
    raise exception 'Expected historical participation immutability';
  exception when raise_exception then assert SQLERRM='Participation cohort is immutable; enroll a new participation'; end;
  insert into public.cohort_matches(cohort_id,mentor_id,mentee_id,track,status)
    values(c,first_member,'66666666-6666-4666-8666-666666666666','test','active') returning id into pair;
  begin
    insert into public.sessions(mentor_id,mentee_id,scheduled_at) values(first_member,'66666666-6666-4666-8666-666666666666',now()+interval '1 day');
    raise exception 'Expected explicit session attribution';
  exception when check_violation then null; end;
  insert into public.sessions(mentor_id,mentee_id,match_id,cohort_id,scheduled_at)
    values(first_member,'66666666-6666-4666-8666-666666666666',pair,c,now()-interval '1 day') returning id into booked;
  insert into public.meeting_logs(cohort_id,match_id,session_id,logged_by_type,logged_by_id,met_at)
    values(c,pair,booked,'mentor',first_member,current_date-1);
  begin
    insert into public.goals(cohort_id,match_id,title) values(c2,pair,'Cross-cohort');
    raise exception 'Expected goal cohort FK';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.member_milestones(cohort_id,member_type,member_id,milestone,marked_by)
      values(c2,'mentor',first_member,'orientation',other_actor);
    raise exception 'Expected milestone cohort denial';
  exception when check_violation then null; end;
  assert not has_table_privilege('authenticated','public.people','SELECT');
  assert not has_function_privilege('authenticated','public.ascenso_claim_person(uuid,text)','EXECUTE');
  insert into public.sessions(mentor_id,mentee_id,match_id,cohort_id,scheduled_at)
    values(first_member,'66666666-6666-4666-8666-666666666666',pair,c,now()+interval '1 day');
  insert into public.mentor(first_name,last_name,"current_role",institution,bio,current_stage,email,cohort_id)
    values('Other','Mentor','','','','','other-program-mentor@example.org',c2) returning id into other_mentor;
  insert into public.cohort_matches(cohort_id,mentor_id,mentee_id,track,status) values(c2,other_mentor,later_member,'test','active') returning id into second_pair;
  begin
    insert into public.sessions(mentor_id,mentee_id,match_id,cohort_id,scheduled_at)
      values(other_mentor,later_member,second_pair,c2,now()+interval '1 day 10 minutes');
    raise exception 'Expected cross-role person booking conflict';
  exception when unique_violation then null; end;
  assert exists(select 1 from public.ascenso_person_busy(first_member,now(),now()+interval '2 days'));
end $$;
