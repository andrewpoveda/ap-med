begin;

-- Existing cohorts have no creation request. Keeping the request on the row
-- lets a retry find its cohort even after later settings edits.
alter table public.cohorts
  add column creation_request_id uuid unique,
  add column creation_request_payload jsonb,
  add column config_version bigint not null default 0;

create function public.ascenso_cohort_config_version() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  new.config_version := old.config_version + 1;
  return new;
end $$;
create trigger ascenso_cohort_config_version before update on public.cohorts
for each row execute function public.ascenso_cohort_config_version();
revoke execute on function public.ascenso_cohort_config_version() from public, anon, authenticated;
grant execute on function public.ascenso_cohort_config_version() to service_role;

-- This guarded entry point keeps the existing lifecycle RPC and its callers
-- intact. The server calls it with a stable creation key or settings version.
create function public.ascenso_configure_cohort_guarded(
  p_id uuid,
  p_actor uuid,
  p_name text,
  p_org text,
  p_orientation date,
  p_status text,
  p_expected text,
  p_reason text,
  p_organization uuid,
  p_create_request uuid,
  p_expected_version bigint
)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  c uuid;
  original_payload jsonb;
  request_payload jsonb;
  current_version bigint;
begin
  if p_id is null then
    if p_create_request is null then
      raise exception 'Creation request ID required' using errcode='22023';
    end if;
    if not exists(select 1 from public.admin_users where id=p_actor and role='super' and disabled_at is null) then
      raise exception 'Not found' using errcode='42501';
    end if;
    request_payload := jsonb_build_object(
      'actor', p_actor, 'name', btrim(p_name), 'org', btrim(p_org),
      'orientation', p_orientation, 'status', p_status,
      'reason', btrim(p_reason), 'organization', p_organization
    );
    -- Serialize retries before the old RPC's insert trigger creates an owner.
    perform pg_advisory_xact_lock(hashtextextended('ascenso-cohort-create:' || p_create_request::text, 19));
    select id, creation_request_payload into c, original_payload
      from public.cohorts where creation_request_id=p_create_request;
    if found then
      if original_payload is distinct from request_payload then
        raise exception 'Creation request changed; check the cohort list before starting a new one' using errcode='23505';
      end if;
      return c;
    end if;
    c := public.ascenso_configure_cohort(
      null,p_actor,p_name,p_org,p_orientation,p_status,p_expected,p_reason,p_organization
    );
    update public.cohorts set creation_request_id=p_create_request,
      creation_request_payload=request_payload where id=c;
    return c;
  end if;

  if p_create_request is not null then
    raise exception 'Creation request applies only to new cohorts' using errcode='22023';
  end if;
  if p_expected_version is null or p_expected_version<0 then
    raise exception 'Expected settings version required' using errcode='22023';
  end if;
  perform public.ascenso_assert_admin(p_actor,p_id);
  select config_version into strict current_version from public.cohorts where id=p_id for update;
  if current_version<>p_expected_version then
    raise exception 'Cohort settings changed; refresh' using errcode='23514';
  end if;
  return public.ascenso_configure_cohort(
    p_id,p_actor,p_name,p_org,p_orientation,p_status,p_expected,p_reason,p_organization
  );
end $$;

revoke execute on function public.ascenso_configure_cohort_guarded(uuid,uuid,text,text,date,text,text,text,uuid,uuid,bigint)
  from public, anon, authenticated;
grant execute on function public.ascenso_configure_cohort_guarded(uuid,uuid,text,text,date,text,text,text,uuid,uuid,bigint)
  to service_role;

commit;
