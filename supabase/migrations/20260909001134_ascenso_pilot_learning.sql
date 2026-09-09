begin;
create table public.cohort_first_access (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id),
  member_type text not null check(member_type in ('mentor','mentee')),
  member_id uuid not null,
  first_seen_at timestamptz not null default now(),
  unique(cohort_id,member_type,member_id)
);
alter table public.cohort_first_access enable row level security;
revoke all on public.cohort_first_access from anon,authenticated;
grant all on public.cohort_first_access to service_role;
create trigger ascenso_member_reference_guard before insert or update on public.cohort_first_access
for each row execute function public.ascenso_member_reference_guard();
create function public.ascenso_record_access(p_user uuid,p_type text,p_member uuid,p_cohort uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if not (
    (p_type='mentor' and exists(select 1 from public.mentor m join public.people p on p.id=m.person_id where m.id=p_member and m.cohort_id=p_cohort and m.membership_status='active' and p.auth_user_id=p_user)) or
    (p_type='mentee' and exists(select 1 from public.mentees m join public.people p on p.id=m.person_id where m.id=p_member and m.cohort_id=p_cohort and m.membership_status='active' and p.auth_user_id=p_user))
  ) then raise exception 'Not found' using errcode='42501'; end if;
  insert into public.cohort_first_access(cohort_id,member_type,member_id) values(p_cohort,p_type,p_member)
    on conflict(cohort_id,member_type,member_id) do nothing;
end $$;
revoke all on function public.ascenso_record_access(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ascenso_record_access(uuid,text,uuid,uuid) to service_role;
create function public.ascenso_candidate_choice(p_cohort uuid,p_actor uuid,p_mentor uuid,p_mentee uuid,p_track text,p_score numeric,p_action text,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare selected uuid;
begin
  perform public.ascenso_assert_admin(p_actor,p_cohort);
  if p_action not in ('select','skip') or length(coalesce(p_reason,''))>2000 then raise exception 'Invalid candidate feedback' using errcode='23514'; end if;
  if p_action='skip' and length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Explain why this candidate was skipped' using errcode='23514'; end if;
  if not exists(select 1 from public.mentor where id=p_mentor and cohort_id=p_cohort and membership_status='active') or
    not exists(select 1 from public.mentees where id=p_mentee and cohort_id=p_cohort and membership_status='active') then raise exception 'Not found' using errcode='42501'; end if;
  if p_action='select' then
    selected:=public.ascenso_select_match(p_cohort,p_actor,p_mentor,p_mentee,p_track,p_score);
  end if;
  if p_action='skip' or length(btrim(coalesce(p_reason,'')))>0 then
    insert into public.cohort_operation_events(cohort_id,actor_id,target_id,action,reason,changes)
      values(p_cohort,p_actor,coalesce(selected,p_mentee),case when p_action='skip' then 'candidate_skipped' else 'candidate_choice_reason' end,p_reason,
        jsonb_build_object('mentor_id',p_mentor,'mentee_id',p_mentee,'track',p_track,'score',p_score));
  end if;
  return jsonb_build_object('matchId',selected);
end $$;
revoke all on function public.ascenso_candidate_choice(uuid,uuid,uuid,uuid,text,numeric,text,text) from public,anon,authenticated;
grant execute on function public.ascenso_candidate_choice(uuid,uuid,uuid,uuid,text,numeric,text,text) to service_role;
create or replace function public.ascenso_record_export(p_cohort uuid,p_actor uuid,p_table text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform public.ascenso_assert_admin(p_actor,p_cohort);
  if p_table not in ('members','matches','meetings','goals','milestones','applications','surveys','events','sessions','funnel') then raise exception 'Unknown export'; end if;
  insert into public.cohort_operation_events(cohort_id,actor_id,target_id,action,reason,changes)
    values(p_cohort,p_actor,p_cohort,'export_requested','Administrator requested CSV',jsonb_build_object('table',p_table));
end $$;
commit;
