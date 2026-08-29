begin;

-- Short-lived application bookkeeping for email capacity that has been
-- reserved but is not yet represented by an actual-send row in email_log.
-- Rows are scoped to a UTC day; abandoned reservations deliberately remain
-- counted until that day ends so a crashed request fails closed rather than
-- allowing the account-wide limit to be exceeded.
create table public.email_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  budget_date date not null,
  slots_remaining smallint not null,
  created_at timestamptz not null default now(),
  constraint email_budget_reservations_slots_check
    check (slots_remaining between 1 and 90)
);

create index email_budget_reservations_budget_date_idx
  on public.email_budget_reservations (budget_date);

alter table public.email_budget_reservations enable row level security;

-- Serialize all reservation decisions for this application. Advisory locks
-- are transaction-scoped and are standard PostgreSQL, including RDS/Aurora.
create function public.reserve_email_budget(p_slots integer)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_budget_date date := (pg_catalog.clock_timestamp() at time zone 'UTC')::date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_sent integer;
  v_reserved integer;
  v_reservation_id uuid;
begin
  if p_slots is null or p_slots < 1 or p_slots > 90 then
    raise exception 'p_slots must be between 1 and 90'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(1948031597);

  v_day_start := v_budget_date::timestamp at time zone 'UTC';
  v_day_end := (v_budget_date + 1)::timestamp at time zone 'UTC';

  -- Previous-day reservations no longer affect today's independent budget.
  delete from public.email_budget_reservations
  where budget_date < v_budget_date;

  select count(*)::integer
    into v_sent
  from public.email_log
  where sent_at >= v_day_start
    and sent_at < v_day_end;

  select coalesce(sum(slots_remaining), 0)::integer
    into v_reserved
  from public.email_budget_reservations
  where budget_date = v_budget_date;

  if v_sent + v_reserved + p_slots > 90 then
    return null;
  end if;

  insert into public.email_budget_reservations (budget_date, slots_remaining)
  values (v_budget_date, p_slots)
  returning id into v_reservation_id;

  return v_reservation_id;
end
$function$;

-- Release slots after they either become visible in email_log or are known
-- not to have been used. Logging happens before release, so an intermediate
-- failure can only under-use the budget; it cannot create extra capacity.
create function public.release_email_budget_slots(
  p_reservation_id uuid,
  p_slots integer
)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_remaining integer;
begin
  if p_reservation_id is null then
    raise exception 'p_reservation_id is required'
      using errcode = '22023';
  end if;

  if p_slots is null or p_slots < 1 or p_slots > 90 then
    raise exception 'p_slots must be between 1 and 90'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(1948031597);

  select slots_remaining
    into v_remaining
  from public.email_budget_reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'email budget reservation not found'
      using errcode = 'P0002';
  end if;

  if p_slots > v_remaining then
    raise exception 'cannot release more slots than remain reserved'
      using errcode = '22023';
  end if;

  v_remaining := v_remaining - p_slots;

  if v_remaining = 0 then
    delete from public.email_budget_reservations
    where id = p_reservation_id;
  else
    update public.email_budget_reservations
    set slots_remaining = v_remaining
    where id = p_reservation_id;
  end if;

  return v_remaining;
end
$function$;

-- Supabase exposes public-schema functions through PostgREST. Keep this
-- server-only: the application invokes it with service_role, while portable
-- PostgreSQL installations can map that role in the compatibility layer.
revoke all privileges on table public.email_budget_reservations
  from anon, authenticated;
grant all privileges on table public.email_budget_reservations
  to service_role;

revoke execute on function public.reserve_email_budget(integer)
  from public, anon, authenticated;
grant execute on function public.reserve_email_budget(integer)
  to service_role;

revoke execute on function public.release_email_budget_slots(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.release_email_budget_slots(uuid, integer)
  to service_role;

commit;
