begin;

-- A row revision makes STOP then START observable even when their timestamps
-- fall within the same clock tick. Existing rows start at revision zero.
alter table public.sms_phone_suppressions
  add column revision bigint not null default 0
    check (revision >= 0);

-- Both webhook commands and dashboard opt-ins serialize on the destination
-- phone. The webhook RPC already writes this table for STOP and START; doing
-- this in a trigger also covers either command's INSERT/ON CONFLICT path.
-- Use clock time only after acquiring the lock: a webhook may have waited for
-- a dashboard save, and a timestamp captured before that wait reverses order.
create function public.sms_suppression_order_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare event_at timestamptz;
begin
  if tg_op = 'UPDATE' and new.phone_e164 is distinct from old.phone_e164 then
    raise exception 'SMS suppression phone cannot change' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ap-med-sms-phone:' || new.phone_e164, 0)
  );
  event_at := clock_timestamp();
  if tg_op = 'INSERT' then
    new.revision := 1;
    if new.resumed_at is null then
      new.opted_out_at := event_at;
      new.source := 'stop';
    else
      -- START without a recorded STOP must still invalidate old consent.
      new.opted_out_at := event_at - interval '1 microsecond';
      new.resumed_at := event_at;
      new.source := 'start_without_recorded_stop';
    end if;
  else
    event_at := greatest(
      event_at,
      old.opted_out_at + interval '1 microsecond',
      old.resumed_at + interval '1 microsecond'
    );
    new.revision := old.revision + 1;
    if new.resumed_at is null then
      new.opted_out_at := event_at;
      new.source := 'stop';
    else
      new.opted_out_at := old.opted_out_at;
      new.resumed_at := event_at;
    end if;
  end if;
  return new;
end $$;

create trigger sms_suppression_order_guard
  before insert or update on public.sms_phone_suppressions
  for each row execute function public.sms_suppression_order_guard();

-- The dashboard first reads a revision while deciding what to show the member.
-- The final opt-in must observe that same revision under the phone lock, or a
-- STOP/START interleaving could silently turn that earlier request into fresh
-- consent. Application approval still copies its historical consent evidence
-- directly; old evidence is blocked by the existing outbound STOP guards.
create function public.sms_save_contact_consent(
  p_cohort_id uuid,
  p_person_id uuid,
  p_phone_e164 text,
  p_expected_revision bigint,
  p_expected_contact_id uuid,
  p_expected_phone_e164 text,
  p_expected_consented_at timestamptz,
  p_expected_opted_out_at timestamptz,
  p_consent_notice text,
  p_consent_notice_version text
) returns text language plpgsql security invoker set search_path = '' as $$
declare observed_revision bigint; stopped_at timestamptz; resume_at timestamptz;
        prior public.cohort_sms_contacts; consent_at timestamptz;
        keep_prior boolean; changed integer;
begin
  if p_phone_e164 is null or p_phone_e164 !~ '^\+[1-9][0-9]{1,14}$' or
    nullif(btrim(p_consent_notice), '') is null or
    length(btrim(p_consent_notice)) > 2000 or
    nullif(btrim(p_consent_notice_version), '') is null then
    raise exception 'Invalid SMS consent input' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ap-med-sms-phone:' || p_phone_e164, 0)
  );
  -- Ordinary SELECT is intentional: a competing UPDATE can hold the row lock
  -- before its BEFORE trigger waits for our advisory lock. Its event follows
  -- this transaction, so the currently committed revision is the right one.
  select s.revision, s.opted_out_at, s.resumed_at
    into observed_revision, stopped_at, resume_at
    from public.sms_phone_suppressions s where s.phone_e164 = p_phone_e164;
  if observed_revision is distinct from p_expected_revision then
    return 'changed';
  end if;
  if stopped_at is not null and
    (resume_at is null or resume_at <= stopped_at) then
    return 'opted_out';
  end if;
  perform 1 from public.cohorts where id = p_cohort_id
    and status = 'active' and sms_enabled for share;
  if not found then return 'disabled'; end if;
  if not (
    exists(select 1 from public.mentor where cohort_id = p_cohort_id
      and person_id = p_person_id and membership_status = 'active') or
    exists(select 1 from public.mentees where cohort_id = p_cohort_id
      and person_id = p_person_id and membership_status = 'active')
  ) then return 'inactive'; end if;

  select * into prior from public.cohort_sms_contacts
    where cohort_id = p_cohort_id and person_id = p_person_id for update;
  if (prior.id, prior.phone_e164, prior.consented_at, prior.opted_out_at)
    is distinct from (p_expected_contact_id, p_expected_phone_e164,
      p_expected_consented_at, p_expected_opted_out_at) then
    return 'changed';
  end if;
  keep_prior := prior.id is not null and prior.phone_e164 = p_phone_e164
    and prior.consented_at is not null and prior.opted_out_at is null
    and (stopped_at is null or prior.consented_at > stopped_at);
  consent_at := case when keep_prior then prior.consented_at
    else greatest(clock_timestamp(), stopped_at + interval '1 microsecond') end;
  if not keep_prior and consent_at = prior.consented_at then
    consent_at := consent_at + interval '1 microsecond';
  end if;

  insert into public.cohort_sms_contacts(
    cohort_id, person_id, phone_e164, consented_at, consent_source,
    consent_notice, consent_notice_version, opted_out_at
  ) values (
    p_cohort_id, p_person_id, p_phone_e164, consent_at,
    case when keep_prior then prior.consent_source else 'member_dashboard' end,
    case when keep_prior then prior.consent_notice else p_consent_notice end,
    case when keep_prior then prior.consent_notice_version else p_consent_notice_version end,
    null
  ) on conflict (cohort_id, person_id) do update set
    phone_e164 = excluded.phone_e164,
    consented_at = excluded.consented_at,
    consent_source = excluded.consent_source,
    consent_notice = excluded.consent_notice,
    consent_notice_version = excluded.consent_notice_version,
    opted_out_at = null,
    updated_at = clock_timestamp()
  where (public.cohort_sms_contacts.id, public.cohort_sms_contacts.phone_e164,
    public.cohort_sms_contacts.consented_at, public.cohort_sms_contacts.opted_out_at)
    is not distinct from (p_expected_contact_id, p_expected_phone_e164,
      p_expected_consented_at, p_expected_opted_out_at);
  get diagnostics changed = row_count;
  if changed <> 1 then return 'changed'; end if;
  return 'saved';
end $$;

revoke execute on function public.sms_suppression_order_guard(),
  public.sms_save_contact_consent(uuid,uuid,text,bigint,uuid,text,timestamptz,timestamptz,text,text)
  from public, anon, authenticated;
grant execute on function public.sms_suppression_order_guard(),
  public.sms_save_contact_consent(uuid,uuid,text,bigint,uuid,text,timestamptz,timestamptz,text,text)
  to service_role;

commit;
