begin;
alter table public.cohort_matches add column activated_at timestamptz;
-- Only transactionally recorded activation events can establish history.
update public.cohort_matches m set activated_at=e.at from (
  select target_id,min(created_at) at from public.cohort_operation_events
  where action='match_activate' group by target_id
) e where e.target_id=m.id and m.status in ('active','ended');

create function public.ascenso_activation_time()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    new.activated_at:=case when new.status='active' then clock_timestamp() else null end;
  elsif old.status<>'active' and new.status='active' then
    new.activated_at:=clock_timestamp();
  else
    new.activated_at:=old.activated_at;
  end if;
  return new;
end $$;
create trigger ascenso_activation_time before insert or update on public.cohort_matches
for each row execute function public.ascenso_activation_time();
revoke execute on function public.ascenso_activation_time() from public,anon,authenticated;
grant execute on function public.ascenso_activation_time() to service_role;
commit;
