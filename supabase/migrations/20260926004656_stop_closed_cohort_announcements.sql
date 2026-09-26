begin;

-- Share-lock the cohort in the same transaction as the queue inserts. Closeout
-- takes a conflicting row lock, so it either supersedes these new intents or
-- this function observes the closed state and refuses to create them.
create or replace function public.ascenso_queue_announcement(p_id uuid,p_cohort uuid,p_actor uuid,p_subject text,p_body text,p_audience text,p_messages jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare existing public.announcements; msg jsonb; cohort_status text;
begin
  perform public.ascenso_assert_admin(p_actor,p_cohort);
  perform pg_advisory_xact_lock(hashtextextended(p_cohort::text,4));
  select status into strict cohort_status from public.cohorts where id=p_cohort for share;
  if cohort_status='closed' then
    raise exception 'Closed cohorts cannot queue announcements' using errcode='23514';
  end if;
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

-- A direct claim of a stale closed-cohort row must also retire an unattempted
-- intent. Any row with a previous attempt remains visible for provider review.
create or replace function public.ascenso_claim_delivery(p_id uuid,p_message jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.cohort_delivery; cohort_status text;
begin
  select * into strict d from public.cohort_delivery where id=p_id;
  select status into strict cohort_status from public.cohorts where id=d.cohort_id for share;
  if cohort_status='closed' then
    select * into strict d from public.cohort_delivery where id=p_id for update;
    if d.state='pending' then
      if d.first_attempt_at is null then
        update public.cohort_delivery set state='superseded',detail='Cohort closed before send' where id=p_id;
      else
        update public.cohort_delivery set state='needs_review',detail='Cohort closed after an uncertain attempt; check provider before resolving' where id=p_id;
      end if;
    end if;
    return null;
  end if;
  return public.ascenso_claim_delivery_v4(p_id,p_message);
end $$;

-- Repair rows left by the old queue race. Never discard an attempted send:
-- its outcome must be confirmed with the provider before an operator resolves
-- it. Exclude all closed cohorts from worker pages to avoid a stuck page.
create or replace function public.ascenso_delivery_queue()
returns setof public.cohort_delivery language plpgsql security invoker set search_path='' as $$
begin
  update public.cohort_delivery d set state='superseded',detail='Cohort closed before send'
    from public.cohorts c where c.id=d.cohort_id and c.status='closed'
      and d.state='pending' and d.first_attempt_at is null;
  update public.cohort_delivery d set state='needs_review',detail='Cohort closed after an uncertain attempt; check provider before resolving'
    from public.cohorts c where c.id=d.cohort_id and c.status='closed'
      and d.state='pending' and d.first_attempt_at is not null;
  update public.cohort_delivery set state='superseded',detail='Reminder expired before a send attempt'
    where kind='digest' and state='pending' and first_attempt_at is null and expires_at<=clock_timestamp();
  return query select d.* from public.cohort_delivery d join (
    select queued.id,row_number() over(partition by queued.cohort_id order by queued.created_at,queued.id) turn
    from public.cohort_delivery queued join public.cohorts c on c.id=queued.cohort_id and c.status<>'closed'
    where queued.state in ('pending','failed','sending')
      and (queued.last_attempt_at is null or queued.last_attempt_at<clock_timestamp()-interval '2 minutes')
  ) q using(id) order by q.turn,d.created_at,d.id limit 40;
end;
$$;

commit;
