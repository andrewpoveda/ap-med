-- Synthetic closed-cohort announcement cases after the full migration chain.
set role service_role;
do $$
declare
  open_cohort uuid:='11111111-1111-4111-8111-111111111111';
  closed_cohort uuid:='22222222-2222-4222-8222-222222222222';
  active_cohort uuid:='33333333-3333-4333-8333-333333333333';
  actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  campaign uuid:='44444444-4444-4444-8444-444444444444';
  delivery uuid;
begin
  insert into public.cohorts(id,name,org,status) values
    (open_cohort,'Open','Test','active'),
    (closed_cohort,'Closed','Test','closed'),
    (active_cohort,'Still active','Test','active');
  insert into public.admin_users(id,email,role) values(actor,'queue-admin@example.org','super');

  begin
    perform public.ascenso_queue_announcement(gen_random_uuid(),closed_cohort,actor,'Subject','Body','mentors',
      '[{"to":"member@example.org","subject":"Subject"}]');
    raise exception 'Expected closed-cohort rejection';
  exception when check_violation then
    assert SQLERRM='Closed cohorts cannot queue announcements';
  end;
  assert not exists(select 1 from public.announcements where cohort_id=closed_cohort);

  perform public.ascenso_queue_announcement(campaign,open_cohort,actor,'Subject','Body','mentors',
    '[{"to":"member@example.org","subject":"Subject"}]');
  assert (select count(*) from public.cohort_delivery where source_id=campaign)=1;
  update public.cohorts set status='closed' where id=open_cohort;
  begin
    perform public.ascenso_queue_announcement(campaign,open_cohort,actor,'Subject','Body','mentors',
      '[{"to":"member@example.org","subject":"Subject"}]');
    raise exception 'Expected closed-cohort replay rejection';
  exception when check_violation then
    assert SQLERRM='Closed cohorts cannot queue announcements';
  end;
  assert (select count(*) from public.cohort_delivery where source_id=campaign)=1;
  select id into strict delivery from public.cohort_delivery where source_id=campaign;
  assert public.ascenso_claim_delivery(delivery,'{}') is null;
  assert (select state from public.cohort_delivery where id=delivery)='superseded';

  -- Direct claim and worker cleanup both preserve an attempted send for review.
  insert into public.cohort_delivery(cohort_id,source_id,kind,variant,recipient_email,payload,message,first_attempt_at)
    values(closed_cohort,gen_random_uuid(),'announcement','direct-attempted','member@example.org','{}','{}',clock_timestamp()-interval '1 hour') returning id into delivery;
  assert public.ascenso_claim_delivery(delivery,'{}') is null;
  assert (select state from public.cohort_delivery where id=delivery)='needs_review';

  insert into public.cohort_delivery(cohort_id,source_id,kind,variant,recipient_email,payload,message)
    values(closed_cohort,gen_random_uuid(),'announcement','queued-unattempted','member@example.org','{}','{}');
  insert into public.cohort_delivery(cohort_id,source_id,kind,variant,recipient_email,payload,message,first_attempt_at)
    values(closed_cohort,gen_random_uuid(),'announcement','queued-attempted','member@example.org','{}','{}',clock_timestamp()-interval '1 hour');
  insert into public.cohort_delivery(cohort_id,source_id,kind,variant,recipient_email,payload,message,state,first_attempt_at)
    values(closed_cohort,gen_random_uuid(),'announcement','uncertain-failed','member@example.org','{}','{}','failed',clock_timestamp()-interval '1 hour');
  insert into public.cohort_delivery(cohort_id,source_id,kind,variant,recipient_email,payload,message)
    values(active_cohort,gen_random_uuid(),'announcement','active-mail','member@example.org','{}','{}');

  assert not exists(select 1 from public.ascenso_delivery_queue() where cohort_id in (open_cohort,closed_cohort));
  assert exists(select 1 from public.ascenso_delivery_queue() where cohort_id=active_cohort);
  assert (select state from public.cohort_delivery where cohort_id=closed_cohort and variant='queued-unattempted')='superseded';
  assert (select state from public.cohort_delivery where cohort_id=closed_cohort and variant='queued-attempted')='needs_review';
  assert (select state from public.cohort_delivery where cohort_id=closed_cohort and variant='uncertain-failed')='failed';
  select id into strict delivery from public.cohort_delivery where cohort_id=closed_cohort and variant='uncertain-failed';
  perform public.ascenso_resolve_delivery(delivery,actor,false,'Provider confirmed that the attempted send was not accepted');
  assert (select state from public.cohort_delivery where id=delivery)='pending';
  perform public.ascenso_delivery_queue();
  assert (select state from public.cohort_delivery where id=delivery)='superseded';
  assert not exists(select 1 from public.email_budget_reservations);
  assert not has_function_privilege('authenticated','public.ascenso_queue_announcement(uuid,uuid,uuid,text,text,text,jsonb)','EXECUTE');
end $$;
