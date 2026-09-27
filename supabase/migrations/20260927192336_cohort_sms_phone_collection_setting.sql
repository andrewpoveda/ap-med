begin;

-- Collection is an onboarding choice. It does not enable SMS sending.
-- Missing or unrecognized config values are treated as off by the app.
create function public.cohort_set_sms_phone_collection(
  p_cohort uuid,
  p_actor uuid,
  p_mode text,
  p_reason text,
  p_expected_version bigint
)
returns bigint language plpgsql security invoker set search_path='' as $$
declare
  prior public.cohorts;
  previous_mode text;
begin
  if p_mode is null or p_mode not in ('off', 'optional', 'required') or
     p_reason is null or length(btrim(p_reason)) not between 3 and 2000 or
     p_expected_version is null or p_expected_version < 0 then
    raise exception 'Valid collection mode, reason and cohort version required' using errcode='22023';
  end if;

  perform public.ascenso_assert_admin(p_actor, p_cohort);
  select * into prior from public.cohorts where id=p_cohort for update;
  if not found then raise exception 'Not found' using errcode='42501'; end if;
  if prior.status='discarded' then
    raise exception 'Discarded cohort settings are frozen' using errcode='23514';
  end if;
  if prior.config_version<>p_expected_version then
    raise exception 'Cohort settings changed; refresh' using errcode='23514';
  end if;

  previous_mode := case
    when prior.config->>'sms_phone_collection' in ('off', 'optional', 'required')
      then prior.config->>'sms_phone_collection'
    else 'off'
  end;
  if previous_mode=p_mode then return prior.config_version; end if;

  update public.cohorts
    set config=jsonb_set(config, '{sms_phone_collection}', to_jsonb(p_mode), true)
    where id=p_cohort;
  insert into public.cohort_operation_events(cohort_id, actor_id, target_id, action, reason, changes)
    values(p_cohort, p_actor, p_cohort, 'sms_phone_collection_configured', btrim(p_reason),
      jsonb_build_object('from', previous_mode, 'to', p_mode));
  return prior.config_version+1;
end $$;

revoke execute on function public.cohort_set_sms_phone_collection(uuid,uuid,text,text,bigint)
  from public, anon, authenticated;
grant execute on function public.cohort_set_sms_phone_collection(uuid,uuid,text,text,bigint)
  to service_role;

commit;
