begin;

-- Use existing history storage; do not duplicate profiles or application answers.
create function public.ascenso_select_match(p_cohort uuid,p_actor uuid,p_mentor uuid,p_mentee uuid,p_track text,p_score numeric)
returns uuid language plpgsql security invoker set search_path='' as $$
declare selected uuid; previous uuid[];
begin
  perform public.ascenso_assert_admin(p_actor,p_cohort);
  perform 1 from public.cohorts where id=p_cohort for share;
  perform pg_advisory_xact_lock(hashtextextended(p_cohort::text,2));
  select array_agg(id order by id) into previous from public.cohort_matches
    where cohort_id=p_cohort and status='ended' and (mentor_id=p_mentor or mentee_id=p_mentee);
  insert into public.cohort_matches(cohort_id,mentor_id,mentee_id,track,score,status,approved_by,approved_at)
    values(p_cohort,p_mentor,p_mentee,p_track,p_score,'board_approved',p_actor,now()) returning id into selected;
  insert into public.cohort_operation_events(cohort_id,actor_id,target_id,action,reason,changes)
    values(p_cohort,p_actor,selected,'match_selected','Board selected pair',
      jsonb_build_object('mentor_id',p_mentor,'mentee_id',p_mentee,'track',p_track,'score',p_score));
  if cardinality(previous)>0 then
    insert into public.cohort_operation_events(cohort_id,actor_id,target_id,action,reason,changes)
      values(p_cohort,p_actor,selected,'match_reassigned','New selection after an ended relationship',jsonb_build_object('previous_match_ids',previous));
  end if;
  return selected;
end $$;

create function public.ascenso_selection_action(p_id uuid,p_actor uuid,p_action text)
returns text language plpgsql security invoker set search_path='' as $$
declare m public.cohort_matches; c uuid;
begin
  select cohort_id into strict c from public.cohort_matches where id=p_id;
  perform public.ascenso_assert_admin(p_actor,c);
  perform 1 from public.cohorts where id=c for share;
  perform pg_advisory_xact_lock(hashtextextended(c::text,2));
  select * into strict m from public.cohort_matches where id=p_id for update;
  if p_action='approve' and m.status='proposed' then
    update public.cohort_matches set status='board_approved',approved_by=p_actor,approved_at=now() where id=p_id;
  elsif p_action='remove' and m.status in ('proposed','board_approved') then
    delete from public.cohort_matches where id=p_id;
  else raise exception 'Only an eligible unactivated selection can be changed' using errcode='23514'; end if;
  insert into public.cohort_operation_events(cohort_id,actor_id,target_id,action,reason,changes)
    values(c,p_actor,p_id,case when p_action='approve' then 'match_approved' else 'match_selection_removed' end,
      case when p_action='approve' then 'Board approved proposed pair' else 'Board removed unactivated selection' end,
      jsonb_build_object('from',m.status,'mentor_id',m.mentor_id,'mentee_id',m.mentee_id));
  return p_action;
end $$;

create function public.ascenso_record_export(p_cohort uuid,p_actor uuid,p_table text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform public.ascenso_assert_admin(p_actor,p_cohort);
  if p_table not in ('members','matches','meetings','goals','milestones','applications','surveys','events','sessions') then
    raise exception 'Unknown export';
  end if;
  insert into public.cohort_operation_events(cohort_id,actor_id,target_id,action,reason,changes)
    values(p_cohort,p_actor,p_cohort,'export_requested','Administrator requested CSV',jsonb_build_object('table',p_table));
end $$;

revoke all on function public.ascenso_select_match(uuid,uuid,uuid,uuid,text,numeric),public.ascenso_selection_action(uuid,uuid,text),public.ascenso_record_export(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ascenso_select_match(uuid,uuid,uuid,uuid,text,numeric),public.ascenso_selection_action(uuid,uuid,text),public.ascenso_record_export(uuid,uuid,text) to service_role;
commit;
