set role service_role;
do $$ declare selected uuid; prior uuid; c uuid:='11111111-1111-4111-8111-111111111111'; actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; begin
  selected:=public.ascenso_select_match(c,actor,'33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666','test',55);
  assert exists(select 1 from public.cohort_operation_events where target_id=selected and actor_id=actor and action='match_selected');
  begin
    perform public.ascenso_selection_action(selected,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','remove');
    raise exception 'Expected cross-cohort denial';
  exception when insufficient_privilege then null; end;
  perform public.ascenso_selection_action(selected,actor,'remove');
  assert not exists(select 1 from public.cohort_matches where id=selected);
  assert exists(select 1 from public.cohort_operation_events where target_id=selected and action='match_selection_removed' and changes->>'mentor_id'='33333333-3333-4333-8333-333333333333');
  insert into public.cohort_matches(cohort_id,mentor_id,mentee_id,track,status)
    values(c,'33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666','test','proposed') returning id into selected;
  perform public.ascenso_selection_action(selected,actor,'approve');
  assert exists(select 1 from public.cohort_operation_events where target_id=selected and action='match_approved' and actor_id=actor);
  perform public.ascenso_selection_action(selected,actor,'remove');
  prior:=public.ascenso_select_match(c,actor,'33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666','test',55);
  perform public.ascenso_match_action(prior,actor,'activate');
  perform public.ascenso_match_action(prior,actor,'end','Pilot reassignment');
  selected:=public.ascenso_select_match(c,actor,'44444444-4444-4444-8444-444444444444','66666666-6666-4666-8666-666666666666','test',45);
  assert exists(select 1 from public.cohort_operation_events where target_id=selected and action='match_reassigned' and changes->'previous_match_ids' @> to_jsonb(array[prior]));
  perform public.ascenso_record_export(c,actor,'events');
  assert exists(select 1 from public.cohort_operation_events where actor_id=actor and cohort_id=c and action='export_requested' and changes='{"table":"events"}'::jsonb);
  assert not has_function_privilege('authenticated','public.ascenso_record_export(uuid,uuid,text)','EXECUTE');
  begin
    perform public.ascenso_record_export(c,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','members');
    raise exception 'Expected export scope denial';
  exception when insufficient_privilege then null; end;
end $$;
