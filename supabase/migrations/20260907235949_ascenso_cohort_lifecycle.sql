begin;
alter table public.admin_users add column disabled_at timestamptz;
create table public.admin_cohort_grants (
  admin_id uuid not null references public.admin_users(id),
  cohort_id uuid not null references public.cohorts(id),
  granted_at timestamptz not null default now(),
  granted_by uuid references public.admin_users(id),
  revoked_at timestamptz,
  revoked_by uuid references public.admin_users(id),
  primary key(admin_id,cohort_id)
);
-- Preserve existing grants without inventing who originally issued them.
insert into public.admin_cohort_grants(admin_id,cohort_id)
select id,cohort_id from public.admin_users where role='cohort_admin' and cohort_id is not null;
alter table public.admin_cohort_grants enable row level security;
revoke all on public.admin_cohort_grants from anon,authenticated;
grant all on public.admin_cohort_grants to service_role;

create or replace function public.ascenso_assert_admin(p_actor uuid,p_cohort uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.admin_users a where a.id=p_actor and a.disabled_at is null and
    (a.role='super' or (a.role='cohort_admin' and exists(select 1 from public.admin_cohort_grants g where g.admin_id=a.id and g.cohort_id=p_cohort and g.revoked_at is null)))) then
    raise exception 'Not found' using errcode='42501';
  end if;
end $$;

create function public.ascenso_manage_grant(p_actor uuid,p_cohort uuid,p_email text,p_grant boolean,p_reason text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare target uuid;
begin
  if not exists(select 1 from public.admin_users where id=p_actor and role='super' and disabled_at is null) then
    raise exception 'Not found' using errcode='42501';
  end if;
  if length(btrim(p_reason))<3 or p_email<>lower(btrim(p_email)) or p_email not like '%@%' then raise exception 'Invalid grant'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_email,6));
  select id into target from public.admin_users where email=p_email;
  if target is null then
    if not p_grant then raise exception 'Administrator not found'; end if;
    insert into public.admin_users(email,role) values(p_email,'cohort_admin') returning id into target;
  end if;
  if exists(select 1 from public.admin_users where id=target and (role<>'cohort_admin' or disabled_at is not null)) then raise exception 'Global or disabled administrators require operator management'; end if;
  if p_grant then
    insert into public.admin_cohort_grants(admin_id,cohort_id,granted_by) values(target,p_cohort,p_actor)
    on conflict(admin_id,cohort_id) do update set revoked_at=null,revoked_by=null,granted_at=clock_timestamp(),granted_by=p_actor;
  else
    update public.admin_cohort_grants set revoked_at=clock_timestamp(),revoked_by=p_actor where admin_id=target and cohort_id=p_cohort and revoked_at is null;
  end if;
  insert into public.cohort_operation_events(cohort_id,actor_id,target_id,action,reason)
    values(p_cohort,p_actor,target,case when p_grant then 'admin_granted' else 'admin_revoked' end,p_reason);
  return target;
end $$;

create function public.ascenso_configure_cohort(p_id uuid,p_actor uuid,p_name text,p_org text,p_orientation date,p_status text,p_expected text,p_reason text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare prior public.cohorts; c uuid:=coalesce(p_id,gen_random_uuid());
begin
  if p_id is null then
    if not exists(select 1 from public.admin_users where id=p_actor and role='super' and disabled_at is null) then raise exception 'Not found' using errcode='42501'; end if;
    if p_status<>'setup' then raise exception 'New cohorts begin in setup'; end if;
    insert into public.cohorts(id,name,org,status) values(c,p_name,p_org,'setup');
  else
    perform public.ascenso_assert_admin(p_actor,c);
  end if;
  select * into strict prior from public.cohorts where id=c for update;
  if p_id is not null and prior.status is distinct from p_expected then raise exception 'Cohort changed; refresh' using errcode='23514'; end if;
  if length(btrim(p_name)) not between 1 and 200 or length(btrim(p_org)) not between 1 and 200 or length(btrim(p_reason))<3 then raise exception 'Name, organization and reason required'; end if;
  if p_status<>prior.status and not (
    (prior.status='setup' and p_status='applications_open') or
    (prior.status='applications_open' and p_status='matching') or
    (prior.status='matching' and p_status in ('applications_open','active')) or
    (prior.status='active' and p_status='closed')
  ) then raise exception 'Unsupported lifecycle transition' using errcode='23514'; end if;
  if p_status='closed' and prior.status<>'closed' then
    if exists(select 1 from public.cohort_matches where cohort_id=c and status in ('proposed','board_approved','active')) then
      raise exception 'End active matches and remove pending selections before closeout' using errcode='23514';
    end if;
    if exists(select 1 from public.sessions s join public.mentor m on m.id=s.mentor_id where m.cohort_id=c and
      ((s.status='scheduled' and s.scheduled_at>clock_timestamp()) or s.calendar_cleanup_pending)) then
      raise exception 'Cancel future sessions and resolve calendar cleanup before closeout' using errcode='23514';
    end if;
    if exists(select 1 from public.cohort_delivery where cohort_id=c and state in ('sending','failed','needs_review')) then
      raise exception 'Resolve uncertain email before closeout' using errcode='23514';
    end if;
    update public.cohort_delivery set state='superseded',detail='Cohort closed before send' where cohort_id=c and state='pending';
  end if;
  update public.cohorts set name=btrim(p_name),org=btrim(p_org),status=p_status,
    config=jsonb_set(config,'{orientation_date}',coalesce(to_jsonb(p_orientation::text),'null'::jsonb)) where id=c;
  insert into public.cohort_operation_events(cohort_id,actor_id,target_id,action,reason,changes)
    values(c,p_actor,c,case when p_id is null then 'cohort_created' else 'cohort_configured' end,p_reason,
      jsonb_build_object('from',prior.status,'to',p_status,'name',p_name,'org',p_org,'orientation_date',p_orientation));
  return c;
end $$;

-- Lock the cohort row so a stale intake/matching request cannot race closeout.
create function public.ascenso_lifecycle_write_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare state text;
begin
  select status into strict state from public.cohorts where id=new.cohort_id for share;
  if tg_table_name='cohort_applications' and state<>'applications_open' then raise exception 'Applications closed' using errcode='23514'; end if;
  if tg_table_name='cohort_matches' and new.status in ('proposed','board_approved','active') and state not in ('applications_open','matching','active') then
    raise exception 'Cohort does not permit matching' using errcode='23514';
  end if;
  return new;
end $$;
create trigger ascenso_lifecycle_intake before insert on public.cohort_applications for each row execute function public.ascenso_lifecycle_write_guard();
create trigger ascenso_lifecycle_matching before insert or update on public.cohort_matches for each row execute function public.ascenso_lifecycle_write_guard();

alter function public.ascenso_claim_delivery(uuid,jsonb) rename to ascenso_claim_delivery_v4;
create function public.ascenso_claim_delivery(p_id uuid,p_message jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c uuid; state text;
begin
  select cohort_id into strict c from public.cohort_delivery where id=p_id;
  select status into strict state from public.cohorts where id=c for share;
  if state='closed' then return null; end if;
  return public.ascenso_claim_delivery_v4(p_id,p_message);
end $$;

alter function public.ascenso_review_application(uuid,uuid,text,text,text) rename to ascenso_review_application_v2;
create function public.ascenso_review_application(p_id uuid,p_actor uuid,p_status text,p_notes text,p_email text)
returns text language plpgsql security invoker set search_path='' as $$
declare c uuid; state text;
begin
  select cohort_id into strict c from public.cohort_applications where id=p_id;
  select status into strict state from public.cohorts where id=c for share;
  if state not in ('applications_open','matching','active') then raise exception 'Cohort is not accepting review decisions' using errcode='23514'; end if;
  return public.ascenso_review_application_v2(p_id,p_actor,p_status,p_notes,p_email);
end $$;

do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'ascenso_%' loop
    execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
