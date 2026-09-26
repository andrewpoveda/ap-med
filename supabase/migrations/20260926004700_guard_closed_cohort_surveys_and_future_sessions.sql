begin;

-- A future booking still has a live calendar commitment. Marking it complete
-- or no-show must not make it disappear from the cohort closeout check.
create function public.ascenso_future_session_resolution_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.status in ('completed','no_show') and new.scheduled_at>clock_timestamp() then
    raise exception 'Cancel a future session and clean up its calendar event before resolving it'
      using errcode='23514';
  end if;
  return new;
end $$;
create trigger ascenso_future_session_resolution_guard
  before insert or update of status,scheduled_at on public.sessions
  for each row execute function public.ascenso_future_session_resolution_guard();

-- Keep preexisting misclassified future sessions from slipping through
-- closeout. The cancellation route can repair these rows and remove the event.
create function public.ascenso_future_session_closeout_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.status is distinct from 'closed' and new.status='closed' and exists(
    select 1 from public.sessions s
    join public.mentor m on m.id=s.mentor_id
    where m.cohort_id=new.id and s.status in ('completed','no_show')
      and s.scheduled_at>clock_timestamp()
  ) then
    raise exception 'Cancel future sessions and resolve calendar cleanup before closeout'
      using errcode='23514';
  end if;
  return new;
end $$;
create trigger ascenso_future_session_closeout_guard
  before update of status on public.cohorts
  for each row execute function public.ascenso_future_session_closeout_guard();

-- The cohort lock serializes survey edits against closeout. Once closed, the
-- only allowed edit is closing an open survey (including the closeout trigger's
-- own update). Keep even unanswered drafts intact for historical reports.
create function public.ascenso_survey_open_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare cohort_status text; survey_cohort uuid;
begin
  if tg_op='UPDATE' then
    if new.cohort_id is distinct from old.cohort_id then
      raise exception 'Survey cohort cannot change' using errcode='23514';
    end if;
  end if;
  survey_cohort:=case when tg_op='DELETE' then old.cohort_id else new.cohort_id end;
  select status into strict cohort_status from public.cohorts
    where id=survey_cohort for share;
  if cohort_status='closed' then
    if tg_op='UPDATE' then
      if old.status='open' and new.status='closed'
        and (to_jsonb(new)-'status'-'closes_at')=(to_jsonb(old)-'status'-'closes_at') then
        return new;
      end if;
    end if;
    raise exception 'Closed cohorts cannot change surveys' using errcode='23514';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger ascenso_survey_open_guard
  before insert or update or delete on public.surveys
  for each row execute function public.ascenso_survey_open_guard();

-- A response that takes the cohort lock first commits before closeout, or
-- sees closed and fails. Locking the survey also serializes against its close.
create function public.ascenso_survey_response_lifecycle_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare cohort_status text; survey_status text; response_cohort uuid;
begin
  if tg_op='UPDATE' then
    if (new.survey_id,new.cohort_id,new.member_type,new.member_id)
        is distinct from (old.survey_id,old.cohort_id,old.member_type,old.member_id) then
      raise exception 'Survey response identity cannot change' using errcode='23514';
    end if;
  end if;
  response_cohort:=case when tg_op='DELETE' then old.cohort_id else new.cohort_id end;
  select status into strict cohort_status from public.cohorts
    where id=response_cohort for share;
  if cohort_status='closed' then
    raise exception 'Closed cohorts cannot change survey responses' using errcode='23514';
  end if;
  if tg_op<>'DELETE' then
    select status into strict survey_status from public.surveys
      where id=new.survey_id and cohort_id=new.cohort_id for share;
    if survey_status<>'open' then
      raise exception 'Survey is not open' using errcode='23514';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger ascenso_survey_response_lifecycle_guard
  before insert or update or delete on public.survey_responses
  for each row execute function public.ascenso_survey_response_lifecycle_guard();

-- Reports freeze with the cohort; open surveys stop showing on dashboards.
create function public.ascenso_close_cohort_surveys()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.status is distinct from 'closed' and new.status='closed' then
    update public.surveys set status='closed',closes_at=clock_timestamp()
      where cohort_id=new.id and status='open';
  end if;
  return new;
end $$;
create trigger ascenso_close_cohort_surveys
  after update of status on public.cohorts
  for each row execute function public.ascenso_close_cohort_surveys();

-- Repair any cohorts already closed before this migration was deployed.
update public.surveys s set status='closed',closes_at=clock_timestamp()
  from public.cohorts c
  where s.cohort_id=c.id and c.status='closed' and s.status='open';

revoke execute on function public.ascenso_future_session_resolution_guard() from public,anon,authenticated;
revoke execute on function public.ascenso_future_session_closeout_guard() from public,anon,authenticated;
revoke execute on function public.ascenso_survey_open_guard() from public,anon,authenticated;
revoke execute on function public.ascenso_survey_response_lifecycle_guard() from public,anon,authenticated;
revoke execute on function public.ascenso_close_cohort_surveys() from public,anon,authenticated;
grant execute on function public.ascenso_future_session_resolution_guard() to service_role;
grant execute on function public.ascenso_future_session_closeout_guard() to service_role;
grant execute on function public.ascenso_survey_open_guard() to service_role;
grant execute on function public.ascenso_survey_response_lifecycle_guard() to service_role;
grant execute on function public.ascenso_close_cohort_surveys() to service_role;

commit;
