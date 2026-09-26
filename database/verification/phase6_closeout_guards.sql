-- Synthetic closeout regression: future calendar events and survey responses.
reset role;
set role service_role;
insert into public.mentor(id,first_name,last_name,"current_role",institution,bio,current_stage,email,cohort_id)
  values('77777777-7777-4777-8777-777777777777','Closeout','Mentor','','','','','closeout-mentor@example.org','22222222-2222-4222-8222-222222222222');
insert into public.mentees(id,full_name,email,cohort_id)
  values('88888888-8888-4888-8888-888888888888','Closeout Mentee','closeout-mentee@example.org','22222222-2222-4222-8222-222222222222');
insert into public.surveys(id,cohort_id,wave,title,questions,status)
  values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','22222222-2222-4222-8222-222222222222','mid_year','Feedback','[]','open');
insert into public.surveys(id,cohort_id,wave,title,questions,status)
  values('dddddddd-dddd-4ddd-8ddd-ddddddddddde','22222222-2222-4222-8222-222222222222','end_year','Draft feedback','[]','draft');
insert into public.survey_responses(survey_id,cohort_id,member_type,member_id,answers)
  values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','22222222-2222-4222-8222-222222222222','mentor','77777777-7777-4777-8777-777777777777','{}');
insert into public.cohort_matches(id,cohort_id,mentor_id,mentee_id,track,status)
  values('cccccccc-cccc-4ccc-8ccc-cccccccccccd','22222222-2222-4222-8222-222222222222','77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888','test','active');
insert into public.sessions(id,mentor_id,mentee_id,match_id,cohort_id,scheduled_at,google_event_id)
  values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888','cccccccc-cccc-4ccc-8ccc-cccccccccccd','22222222-2222-4222-8222-222222222222',now()+interval '1 day','future-event');

do $$ declare booked uuid:='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; begin
  begin
    update public.sessions set status='completed' where id=booked;
    raise exception 'Expected future completion denial';
  exception when check_violation then null; end;
  begin
    update public.sessions set status='no_show' where id=booked;
    raise exception 'Expected future no-show denial';
  exception when check_violation then null; end;
  assert (select status from public.sessions where id=booked)='scheduled';
  perform public.ascenso_match_action('cccccccc-cccc-4ccc-8ccc-cccccccccccd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','end','Closeout test');
  perform public.ascenso_configure_cohort('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Other','Test',null,'matching','applications_open','Begin matching');
  perform public.ascenso_configure_cohort('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Other','Test',null,'active','matching','Begin active phase');
end $$;

-- Simulate an older misclassified future row written before the guard existed.
reset role;
alter table public.sessions disable trigger ascenso_future_session_resolution_guard;
set role service_role;
update public.sessions set status='completed' where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
reset role;
alter table public.sessions enable trigger ascenso_future_session_resolution_guard;
set role service_role;

do $$ declare c uuid:='22222222-2222-4222-8222-222222222222';
  actor uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  booked uuid:='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  survey uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
begin
  begin
    perform public.ascenso_configure_cohort(c,actor,'Other','Test',null,'closed','active','Close program');
    raise exception 'Expected misclassified future booking closeout denial';
  exception when check_violation then null; end;
  update public.sessions set status='cancelled',calendar_cleanup_pending=true where id=booked;
  begin
    perform public.ascenso_configure_cohort(c,actor,'Other','Test',null,'closed','active','Close program');
    raise exception 'Expected calendar cleanup denial';
  exception when check_violation then null; end;
  update public.sessions set calendar_cleanup_pending=false where id=booked;
  perform public.ascenso_configure_cohort(c,actor,'Other','Test',null,'closed','active','Close program');
  assert (select status from public.surveys where id=survey)='closed';
  assert (select closes_at is not null from public.surveys where id=survey);
  assert (select status from public.surveys where id='dddddddd-dddd-4ddd-8ddd-ddddddddddde')='draft';
  begin
    update public.surveys set status='open' where id=survey;
    raise exception 'Expected closed-cohort survey reopening denial';
  exception when check_violation then null; end;
  begin
    update public.surveys set title='Altered feedback' where id=survey;
    raise exception 'Expected closed-cohort survey edit denial';
  exception when check_violation then null; end;
  begin
    delete from public.surveys where id='dddddddd-dddd-4ddd-8ddd-ddddddddddde';
    raise exception 'Expected closed-cohort draft deletion denial';
  exception when check_violation then null; end;
  begin
    insert into public.surveys(cohort_id,wave,title,questions,status)
      values(c,'end_year','Replacement','[]','draft');
    raise exception 'Expected closed-cohort survey creation denial';
  exception when check_violation then null; end;
  begin
    insert into public.survey_responses(survey_id,cohort_id,member_type,member_id,answers)
      values(survey,c,'mentee','88888888-8888-4888-8888-888888888888','{}');
    raise exception 'Expected closed-cohort response denial';
  exception when check_violation then null; end;
  begin
    update public.survey_responses set answers='{"changed":true}' where survey_id=survey;
    raise exception 'Expected closed-cohort response edit denial';
  exception when check_violation then null; end;
  begin
    update public.survey_responses set cohort_id='11111111-1111-4111-8111-111111111111' where survey_id=survey;
    raise exception 'Expected closed-cohort response reassignment denial';
  exception when check_violation then null; end;
  begin
    delete from public.survey_responses where survey_id=survey;
    raise exception 'Expected closed-cohort response deletion denial';
  exception when check_violation then null; end;
  assert (select count(*) from public.survey_responses where survey_id=survey)=1;
end $$;
