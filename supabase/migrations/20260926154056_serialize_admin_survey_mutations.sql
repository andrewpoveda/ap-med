begin;

-- Closeout locks the cohort before closing its surveys. A direct UPDATE or
-- DELETE on a survey takes the locks in reverse order through the survey
-- lifecycle trigger, so two administrators could deadlock. Use this service
-- role RPC for admin survey mutations to acquire the cohort lock first.
create function public.ascenso_mutate_survey(
  p_id uuid, p_cohort uuid, p_actor uuid, p_action text, p_expected_status text
)
returns text language plpgsql security invoker set search_path='' as $$
declare
  survey_cohort uuid;
  cohort_status text;
  prior_status text;
begin
  if p_id is null or p_cohort is null or p_actor is null or p_action is null
     or p_action not in ('open','close','delete')
     or p_expected_status is null then
    raise exception 'Invalid survey action' using errcode='23514';
  end if;

  -- The initial lookup does not lock the survey row. Cohort assignment is
  -- immutable, and the second lookup below handles concurrent deletion.
  select cohort_id into survey_cohort from public.surveys where id=p_id;
  if not found or survey_cohort<>p_cohort then
    raise exception 'Not found' using errcode='P0002';
  end if;
  select status into strict cohort_status from public.cohorts
    where id=p_cohort for share;
  perform public.ascenso_assert_admin(p_actor,p_cohort);
  select status into prior_status from public.surveys
    where id=p_id and cohort_id=p_cohort for update;
  if not found then raise exception 'Not found' using errcode='P0002'; end if;

  if cohort_status='closed' then
    raise exception 'Closed cohorts cannot change surveys' using errcode='23514';
  end if;
  if cohort_status='discarded' then
    raise exception 'Discarded cohorts cannot change surveys' using errcode='23514';
  end if;
  if prior_status is distinct from p_expected_status then
    raise exception 'Survey changed; refresh before updating' using errcode='23514';
  end if;

  if p_action='open' then
    if prior_status='open' then
      raise exception 'This survey is already open' using errcode='23514';
    end if;
    update public.surveys set status='open',opens_at=clock_timestamp() where id=p_id;
    return 'open';
  elsif p_action='close' then
    if prior_status='closed' then
      raise exception 'This survey is already closed' using errcode='23514';
    end if;
    update public.surveys set status='closed',closes_at=clock_timestamp() where id=p_id;
    return 'closed';
  end if;

  -- Check under the same row lock as DELETE. An in-flight response holds a
  -- survey key-share lock, so it finishes before this check or fails its FK
  -- after this transaction removes the survey.
  if exists(select 1 from public.survey_responses where survey_id=p_id) then
    raise exception 'This survey has responses and cannot be deleted' using errcode='23514';
  end if;
  delete from public.surveys where id=p_id;
  return 'deleted';
end $$;

revoke execute on function public.ascenso_mutate_survey(uuid,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.ascenso_mutate_survey(uuid,uuid,uuid,text,text)
  to service_role;

commit;
