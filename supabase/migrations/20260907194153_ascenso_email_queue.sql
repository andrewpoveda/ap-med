begin;

-- Application safety budget, not a claim about the provider subscription.
create table public.email_budget_settings (
  singleton boolean primary key default true check(singleton),
  daily_limit integer not null default 90 check(daily_limit between 2 and 100000)
);
insert into public.email_budget_settings values(true,90);
alter table public.email_budget_settings enable row level security;
revoke all on public.email_budget_settings from anon,authenticated;
grant all on public.email_budget_settings to service_role;

create or replace function public.reserve_email_budget(p_slots integer)
returns uuid language plpgsql security invoker set search_path='' as $$
declare day date := (clock_timestamp() at time zone 'UTC')::date; used integer; reserved integer; cap integer; result uuid;
begin
  if p_slots is null or p_slots not between 1 and 90 then raise exception 'Invalid slots'; end if;
  perform pg_advisory_xact_lock(1948031597);
  select daily_limit into strict cap from public.email_budget_settings where singleton;
  delete from public.email_budget_reservations where budget_date<day;
  select count(*) into used from public.email_log where sent_at>=day::timestamp at time zone 'UTC' and sent_at<(day+1)::timestamp at time zone 'UTC';
  select coalesce(sum(slots_remaining),0) into reserved from public.email_budget_reservations where budget_date=day;
  if used+reserved+p_slots>cap then return null; end if;
  insert into public.email_budget_reservations(budget_date,slots_remaining) values(day,p_slots) returning id into result;
  return result;
end $$;

alter table public.cohort_delivery drop constraint cohort_delivery_kind_check;
alter table public.cohort_delivery add constraint cohort_delivery_kind_check check(kind in ('decision','introduction','announcement','digest'));
alter table public.cohort_delivery add column expires_at timestamptz;
alter table public.announcements add column queued_at timestamptz;

create function public.ascenso_queue_announcement(p_id uuid,p_cohort uuid,p_actor uuid,p_subject text,p_body text,p_audience text,p_messages jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare existing public.announcements; msg jsonb;
begin
  perform public.ascenso_assert_admin(p_actor,p_cohort);
  perform pg_advisory_xact_lock(hashtextextended(p_cohort::text,4));
  select * into existing from public.announcements where id=p_id;
  if found then
    if existing.cohort_id<>p_cohort or existing.subject<>p_subject or existing.body<>p_body or existing.audience<>p_audience then raise exception 'Request key already used'; end if;
    return p_id;
  end if;
  if p_audience not in ('all','mentors','mentees') or jsonb_array_length(p_messages)=0 then raise exception 'Invalid announcement'; end if;
  if p_audience='all' and exists(select 1 from public.announcements where cohort_id=p_cohort and audience='all' and coalesce(queued_at,sent_at)>=(clock_timestamp() at time zone 'UTC')::date::timestamp at time zone 'UTC') then
    raise exception 'A full-cohort announcement is already queued today' using errcode='23514';
  end if;
  insert into public.announcements(id,cohort_id,subject,body,audience,sent_by,recipient_count,queued_at,sent_at)
    values(p_id,p_cohort,p_subject,p_body,p_audience,p_actor,jsonb_array_length(p_messages),clock_timestamp(),null);
  for msg in select value from jsonb_array_elements(p_messages) loop
    insert into public.cohort_delivery(cohort_id,source_id,kind,variant,recipient_email,payload,message)
      values(p_cohort,p_id,'announcement',lower(msg->>'to'),msg->>'to','{}',msg);
  end loop;
  return p_id;
end $$;

-- Wrapper retains Phase 2's frozen-message and 23-hour uncertainty safeguards.
alter function public.ascenso_claim_delivery(uuid,jsonb) rename to ascenso_claim_delivery_v2;
create function public.ascenso_claim_delivery(p_id uuid,p_message jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.cohort_delivery;
begin
  select * into strict d from public.cohort_delivery where id=p_id for update;
  if d.kind='digest' and d.expires_at<=clock_timestamp() and d.first_attempt_at is not null and d.state in ('pending','failed','sending') then
    if d.state='sending' and d.last_attempt_at>clock_timestamp()-interval '2 minutes' then return null; end if;
    update public.cohort_delivery set state='needs_review',detail='Reminder expired after an uncertain attempt; check provider before resolving' where id=p_id;
    return null;
  end if;
  if d.kind='digest' and d.first_attempt_at is null and exists(
    select 1 from public.cohort_delivery prior where prior.kind='digest' and prior.source_id=d.source_id and prior.id<>d.id
      and prior.first_attempt_at is not null and prior.state in ('failed','sending','needs_review')
  ) then
    update public.cohort_delivery set detail='An earlier digest needs provider confirmation first' where id=p_id;
    return null;
  end if;
  if d.kind in ('announcement','digest') and d.state='pending' and d.first_attempt_at is null then
    if (d.expires_at is not null and d.expires_at<=clock_timestamp()) or
      not exists(select 1 from public.cohorts where id=d.cohort_id and (d.kind<>'digest' or status='active')) or
      not (exists(select 1 from public.mentor where cohort_id=d.cohort_id and normalized_email=lower(btrim(d.recipient_email)) and membership_status='active') or
           exists(select 1 from public.mentees where cohort_id=d.cohort_id and normalized_email=lower(btrim(d.recipient_email)) and membership_status='active')) then
      update public.cohort_delivery set state='superseded',detail='Expired or recipient no longer eligible' where id=p_id;
      return null;
    end if;
  end if;
  return public.ascenso_claim_delivery_v2(p_id,p_message);
end $$;

create or replace function public.ascenso_finish_delivery(p_id uuid,p_token uuid,p_provider_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare d public.cohort_delivery;
begin
  select * into strict d from public.cohort_delivery where id=p_id for update;
  if d.state<>'sending' or d.claim_token is distinct from p_token then return false; end if;
  if p_provider_id is null then
    update public.cohort_delivery set state='failed',detail='Provider acceptance unconfirmed; retry uses the same key' where id=p_id;
  else
    insert into public.email_log(cohort_id,kind,recipient_email,ref_id)
      values(d.cohort_id,case d.kind when 'decision' then 'application_decision' when 'introduction' then 'match_notify' else d.kind end,d.recipient_email,d.source_id);
    if exists(select 1 from public.email_budget_reservations where id=d.reservation_id) then perform public.release_email_budget_slots(d.reservation_id,1); end if;
    update public.cohort_delivery set state='accepted',accepted_at=clock_timestamp(),provider_id=p_provider_id,detail=null where id=p_id;
  end if;
  return true;
end $$;

-- Fair bounded page across cohorts, oldest first within each cohort. Unknown
-- attempts stay visible for operator resolution after the provider key window.
create function public.ascenso_delivery_queue()
returns setof public.cohort_delivery language plpgsql security invoker set search_path='' as $$
begin
  update public.cohort_delivery set state='superseded',detail='Reminder expired before a send attempt'
    where kind='digest' and state='pending' and first_attempt_at is null and expires_at<=clock_timestamp();
  return query select d.* from public.cohort_delivery d join (
    select id,row_number() over(partition by cohort_id order by created_at,id) turn
    from public.cohort_delivery where state in ('pending','failed','sending')
      and (last_attempt_at is null or last_attempt_at<clock_timestamp()-interval '2 minutes')
  ) q using(id) order by q.turn,d.created_at,d.id limit 40;
end;
$$;

-- Manual confirmation must also participate in digest cooldown accounting.
alter function public.ascenso_resolve_delivery(uuid,uuid,boolean,text) rename to ascenso_resolve_delivery_v2;
create function public.ascenso_resolve_delivery(p_id uuid,p_actor uuid,p_accepted boolean,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare d public.cohort_delivery;
begin
  select * into strict d from public.cohort_delivery where id=p_id for update;
  perform public.ascenso_resolve_delivery_v2(p_id,p_actor,p_accepted,p_reason);
  if p_accepted and d.kind='digest' then
    update public.email_log set kind='digest' where ref_id=d.source_id and recipient_email=d.recipient_email and kind='operator_confirmed';
  end if;
end $$;
do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'ascenso_%' loop
    execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
