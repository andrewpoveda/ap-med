begin;
-- Current implementation supports only this released definition. Do not
-- reinterpret old cohorts when adding a future policy implementation.
alter table public.cohorts add column definition_version text not null default 'ascenso-v1'
  check(definition_version='ascenso-v1');
create function public.ascenso_definition_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.definition_version is distinct from old.definition_version then
    raise exception 'Program definition is immutable; create a new cohort';
  end if;
  return new;
end $$;
create trigger ascenso_definition_guard before update on public.cohorts
for each row execute function public.ascenso_definition_guard();
revoke all on function public.ascenso_definition_guard() from public,anon,authenticated;
grant execute on function public.ascenso_definition_guard() to service_role;
commit;
