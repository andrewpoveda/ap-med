begin;
alter table public.sessions add column calendar_cleanup_pending boolean not null default false;
create index sessions_calendar_cleanup_idx on public.sessions(mentor_id)
  where calendar_cleanup_pending;

-- Both participants can log a booked meeting. Serialize its status change and
-- enforce deduplication at the database boundary, including concurrent clicks.
-- Existing duplicates require deliberate review; never discard history here.
create unique index meeting_logs_one_per_session on public.meeting_logs(session_id)
  where session_id is not null;
create function public.ascenso_validate_session_log() returns trigger
language plpgsql security invoker set search_path='' as $$
declare s public.sessions; m public.cohort_matches;
begin
  if new.session_id is null then return new; end if;
  select * into strict s from public.sessions where id=new.session_id for update;
  select * into strict m from public.cohort_matches where id=new.match_id;
  if s.mentor_id<>m.mentor_id or s.mentee_id<>m.mentee_id or new.cohort_id<>m.cohort_id
    or s.scheduled_at>clock_timestamp() or s.status not in ('scheduled','completed') then
    raise exception 'Only a past, eligible session for this pair can be logged' using errcode='23514';
  end if;
  new.met_at:=(s.scheduled_at at time zone 'UTC')::date;
  update public.sessions set status='completed' where id=s.id and status='scheduled';
  return new;
end $$;
create trigger ascenso_validate_session_log before insert on public.meeting_logs
for each row execute function public.ascenso_validate_session_log();
revoke execute on function public.ascenso_validate_session_log() from public,anon,authenticated;
grant execute on function public.ascenso_validate_session_log() to service_role;

create function public.ascenso_update_support(p_cohort uuid,p_actor uuid,p_support jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform public.ascenso_assert_admin(p_actor,p_cohort);
  update public.cohorts set config=jsonb_set(config,'{support}',p_support,true) where id=p_cohort;
  insert into public.cohort_operation_events(cohort_id,actor_id,target_id,action,reason,changes)
    values(p_cohort,p_actor,p_cohort,'support_configuration','Program support configuration',p_support);
end $$;
revoke execute on function public.ascenso_update_support(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ascenso_update_support(uuid,uuid,jsonb) to service_role;
commit;
