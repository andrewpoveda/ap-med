begin;

-- A monotonic revision distinguishes a current dashboard view from an old tab,
-- even when two preference writes land in the same timestamp precision tick.
alter table public.cohort_sms_contacts
  add column revision bigint not null default 1 check (revision >= 1);

create function public.sms_contact_revision_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.revision := case when tg_op = 'INSERT' then 1 else old.revision + 1 end;
  return new;
end $$;

create trigger sms_contact_revision_guard
  before insert or update on public.cohort_sms_contacts
  for each row execute function public.sms_contact_revision_guard();

-- Revocation, removal, and saving a number without consent use the same
-- optimistic boundary as consent grants. Lock the contact and compare the
-- displayed revision before modifying it; an absent row is also a version.
create function public.sms_save_contact_without_consent(
  p_cohort_id uuid,
  p_person_id uuid,
  p_phone_e164 text,
  p_expected_contact_id uuid,
  p_expected_contact_revision bigint,
  p_allow_new_phone boolean
) returns text language plpgsql security invoker set search_path = '' as $$
declare prior public.cohort_sms_contacts;
        revoked_at timestamptz; changed integer;
begin
  if p_phone_e164 is not null and p_phone_e164 !~ '^\+[1-9][0-9]{1,14}$' then
    raise exception 'Invalid SMS phone' using errcode = '22023';
  end if;
  if (p_expected_contact_id is null) <> (p_expected_contact_revision is null) then
    raise exception 'Invalid SMS contact revision' using errcode = '22023';
  end if;
  if not (
    exists(select 1 from public.mentor where cohort_id = p_cohort_id
      and person_id = p_person_id and membership_status = 'active') or
    exists(select 1 from public.mentees where cohort_id = p_cohort_id
      and person_id = p_person_id and membership_status = 'active')
  ) then return 'inactive'; end if;

  select * into prior from public.cohort_sms_contacts
    where cohort_id = p_cohort_id and person_id = p_person_id for update;
  if (prior.id, prior.revision) is distinct from
    (p_expected_contact_id, p_expected_contact_revision) then
    return 'changed';
  end if;

  if p_phone_e164 is not null and
    (prior.id is null or p_phone_e164 is distinct from prior.phone_e164) then
    if p_allow_new_phone is not true then return 'disabled'; end if;
    perform 1 from public.cohorts where id = p_cohort_id
      and status = 'active' and sms_enabled for share;
    if not found then return 'disabled'; end if;
  end if;

  if prior.id is null and p_phone_e164 is null then return 'saved'; end if;
  revoked_at := greatest(clock_timestamp(), prior.opted_out_at + interval '1 microsecond');
  if prior.id is null then
    insert into public.cohort_sms_contacts(
      cohort_id, person_id, phone_e164, opted_out_at
    ) values (p_cohort_id, p_person_id, p_phone_e164, revoked_at)
    on conflict (cohort_id, person_id) do nothing;
  else
    update public.cohort_sms_contacts set
      phone_e164 = p_phone_e164,
      consented_at = case when p_phone_e164 is not null and
        p_phone_e164 = prior.phone_e164 then prior.consented_at else null end,
      consent_source = case when p_phone_e164 is not null and
        p_phone_e164 = prior.phone_e164 then prior.consent_source else null end,
      consent_notice = case when p_phone_e164 is not null and
        p_phone_e164 = prior.phone_e164 then prior.consent_notice else null end,
      consent_notice_version = case when p_phone_e164 is not null and
        p_phone_e164 = prior.phone_e164 then prior.consent_notice_version else null end,
      opted_out_at = revoked_at
    where id = prior.id and revision = p_expected_contact_revision;
  end if;
  get diagnostics changed = row_count;
  if changed <> 1 then return 'changed'; end if;
  return 'saved';
end $$;

revoke execute on function public.sms_contact_revision_guard(),
  public.sms_save_contact_without_consent(uuid,uuid,text,uuid,bigint,boolean)
  from public, anon, authenticated;
grant execute on function public.sms_contact_revision_guard(),
  public.sms_save_contact_without_consent(uuid,uuid,text,uuid,bigint,boolean)
  to service_role;

commit;
