-- The Phase 2 suite has seeded scoped members and verified its invariants.
reset role;
truncate public.email_log,public.email_budget_reservations;
set role service_role;
do $$ declare c uuid:='11111111-1111-4111-8111-111111111111'; a uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  campaign uuid:=gen_random_uuid(); d uuid; claim jsonb; r uuid;
begin
  update public.email_budget_settings set daily_limit=2;
  r:=public.reserve_email_budget(2);
  assert r is not null;
  assert public.reserve_email_budget(1) is null;
  perform public.release_email_budget_slots(r,2);
  perform public.ascenso_queue_announcement(campaign,c,a,'Subject','Body','all','[{"to":"mentor@example.org","subject":"Frozen"},{"to":"mentee2@example.org","subject":"Frozen"}]');
  perform public.ascenso_queue_announcement(campaign,c,a,'Subject','Body','all','[{"to":"mentor@example.org"}]');
  assert (select count(*) from public.cohort_delivery where source_id=campaign)=2;
  assert (select sent_at is null and queued_at is not null from public.announcements where id=campaign);
  begin
    perform public.ascenso_queue_announcement(gen_random_uuid(),c,a,'Other','Body','all','[{"to":"mentor@example.org"}]');
    raise exception 'Expected daily campaign restriction';
  exception when check_violation then null; end;
  begin
    perform public.ascenso_queue_announcement(gen_random_uuid(),c,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Subject','Body','mentors','[{"to":"mentor@example.org"}]');
    raise exception 'Expected scope denial';
  exception when insufficient_privilege then null; end;
  select id into d from public.cohort_delivery where source_id=campaign and recipient_email='mentor@example.org';
  claim:=public.ascenso_claim_delivery(d,'{}');
  assert claim->'message'->>'subject'='Frozen';
  assert public.ascenso_finish_delivery(d,(claim->>'claim_token')::uuid,'provider-campaign');
  assert (select kind from public.email_log where ref_id=campaign)='announcement';
  r:=public.reserve_email_budget(1);
  select id into d from public.cohort_delivery where source_id=campaign and recipient_email='mentee2@example.org';
  assert public.ascenso_claim_delivery(d,'{}') is null;
  assert (select state from public.cohort_delivery where id=d)='pending';
  perform public.release_email_budget_slots(r,1);
  claim:=public.ascenso_claim_delivery(d,'{}');
  assert public.ascenso_finish_delivery(d,(claim->>'claim_token')::uuid,'provider-campaign-2');
  assert public.reserve_email_budget(1) is null;
  insert into public.cohort_delivery(cohort_id,source_id,kind,variant,recipient_email,payload,message,expires_at)
    values(c,'33333333-3333-4333-8333-333333333333','digest','expired','mentor@example.org','{}','{}',now()-interval '1 minute') returning id into d;
  assert public.ascenso_claim_delivery(d,'{}') is null;
  assert (select state from public.cohort_delivery where id=d)='superseded';
  assert not has_function_privilege('authenticated','public.ascenso_delivery_queue()','EXECUTE');
  assert not has_table_privilege('authenticated','public.email_budget_settings','SELECT');
end $$;
