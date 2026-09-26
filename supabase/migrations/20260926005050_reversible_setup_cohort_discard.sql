begin;

-- A discarded setup cohort remains available for restoration and keeps its
-- organization owner and operation history. No existing cohort changes state.
alter table public.cohorts add column discarded_at timestamptz;

-- Service-role writes must not attach new records to a discarded cohort. This
-- is checked in the database so a stale admin tab cannot race the discard RPC.
create function public.ascenso_reject_discarded_cohort_write()
returns trigger language plpgsql security invoker set search_path='' as $$
declare cohort_status text;
begin
  if new.cohort_id is not null then
    -- Lock by ID even while status is setup. A status-filtered lookup would
    -- take no lock, allowing a child insert to race the discard preflight.
    select status into cohort_status from public.cohorts where id=new.cohort_id for share;
    if cohort_status='discarded' then
      raise exception 'Discarded cohorts cannot receive new records' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

-- Stale deep links must not change a discarded cohort's configuration. The
-- discard/restore RPC may change only the state fields; the independent
-- config_version trigger advances the revision for stale-tab detection.
create function public.ascenso_discarded_cohort_update_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.status='discarded' or new.status='discarded' or
     old.discarded_at is distinct from new.discarded_at then
    if not (
      ((old.status='setup' and old.discarded_at is null and new.status='discarded' and new.discarded_at is not null) or
       (old.status='discarded' and old.discarded_at is not null and new.status='setup' and new.discarded_at is null))
      and (to_jsonb(new)-'status'-'discarded_at'-'config_version') =
          (to_jsonb(old)-'status'-'discarded_at'-'config_version')
    ) then
      raise exception 'Discarded cohort settings are frozen' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger ascenso_discarded_cohort_update_guard
  before update on public.cohorts for each row execute function public.ascenso_discarded_cohort_update_guard();

-- Cover every current application table with a cohort_id, including tables
-- where the relationship is logical rather than a foreign key. Operation
-- events are exempt so discard and restore remain auditable.
do $$ declare child record; begin
  for child in
    select n.nspname, c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attname='cohort_id' and not a.attisdropped
    where n.nspname='public' and c.relkind in ('r','p') and c.relname<>'cohort_operation_events'
  loop
    execute format('create trigger ascenso_discarded_cohort_write before insert or update of cohort_id on %I.%I for each row execute function public.ascenso_reject_discarded_cohort_write()', child.nspname, child.relname);
  end loop;
end $$;

create function public.ascenso_set_cohort_discarded(
  p_id uuid, p_actor uuid, p_discard boolean, p_reason text, p_expected_version bigint
)
returns boolean language plpgsql security invoker set search_path='' as $$
declare
  prior public.cohorts;
  child record;
  occupied boolean;
begin
  if not exists (
    select 1 from public.admin_users
    where id=p_actor and role='super' and disabled_at is null
  ) then
    raise exception 'Not found' using errcode='42501';
  end if;
  if p_id is null or p_discard is null or p_reason is null or length(btrim(p_reason)) not between 3 and 2000 or
     p_expected_version is null or p_expected_version<0 then
    raise exception 'Action and reason required' using errcode='23514';
  end if;

  select * into prior from public.cohorts where id=p_id for update;
  if not found then raise exception 'Not found' using errcode='P0002'; end if;
  if p_discard and prior.status='discarded' and prior.discarded_at is not null then return true; end if;
  if not p_discard and prior.status='setup' and prior.discarded_at is null then return false; end if;
  if prior.config_version<>p_expected_version then
    raise exception 'Cohort changed; refresh before discarding or restoring' using errcode='23514';
  end if;

  if p_discard then
    if prior.status<>'setup' or prior.discarded_at is not null then
      raise exception 'Only setup cohorts can be discarded' using errcode='23514';
    end if;

    -- A cohort with any member, grant, survey, mail, or other linked record
    -- cannot be discarded. The creation/configuration audit events are retained.
    for child in
      select n.nspname, c.relname
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attname='cohort_id' and not a.attisdropped
      where n.nspname='public' and c.relkind in ('r','p') and c.relname<>'cohort_operation_events'
    loop
      execute format('select exists(select 1 from %I.%I where cohort_id=$1)', child.nspname, child.relname)
        into occupied using p_id;
      if occupied then
        raise exception 'Cohort has linked records in %', child.relname using errcode='23514';
      end if;
    end loop;

    update public.cohorts set status='discarded', discarded_at=clock_timestamp() where id=p_id;
    insert into public.cohort_operation_events(cohort_id,actor_id,target_id,action,reason,changes)
      values(p_id,p_actor,p_id,'cohort_discarded',btrim(p_reason),jsonb_build_object('from','setup','to','discarded'));
  else
    if prior.status<>'discarded' or prior.discarded_at is null then
      raise exception 'Only discarded cohorts can be restored' using errcode='23514';
    end if;
    update public.cohorts set status='setup', discarded_at=null where id=p_id;
    insert into public.cohort_operation_events(cohort_id,actor_id,target_id,action,reason,changes)
      values(p_id,p_actor,p_id,'cohort_restored',btrim(p_reason),jsonb_build_object('from','discarded','to','setup'));
  end if;
  return p_discard;
end $$;

revoke execute on function public.ascenso_reject_discarded_cohort_write() from public, anon, authenticated;
grant execute on function public.ascenso_reject_discarded_cohort_write() to service_role;
revoke execute on function public.ascenso_discarded_cohort_update_guard() from public, anon, authenticated;
grant execute on function public.ascenso_discarded_cohort_update_guard() to service_role;
revoke execute on function public.ascenso_set_cohort_discarded(uuid,uuid,boolean,text,bigint) from public, anon, authenticated;
grant execute on function public.ascenso_set_cohort_discarded(uuid,uuid,boolean,text,bigint) to service_role;

commit;
