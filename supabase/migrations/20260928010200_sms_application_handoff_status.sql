begin;

-- Keep the optional phone handoff visible if the application server stops after
-- approval commits. Existing rows remain NULL and require no data backfill.
alter table public.cohort_applications add column sms_handoff_state text
  constraint cohort_applications_sms_handoff_state_check
  check (sms_handoff_state in ('pending', 'complete', 'needs_review', 'conflict'));

create function public.sms_application_handoff_pending()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' and (
    new.answers->>'sms_phone_e164' is not null or
    new.answers->>'sms_consent' = 'true' or
    new.answers->>'sms_consented_at' is not null or
    new.answers->>'sms_consent_notice' is not null or
    new.answers->>'sms_consent_notice_version' is not null
  ) then
    new.sms_handoff_state := 'pending';
  end if;
  return new;
end $$;

create trigger sms_application_handoff_pending
  before update of status on public.cohort_applications
  for each row execute function public.sms_application_handoff_pending();

-- Concurrent admin retries must not replace a confirmed handoff with an older
-- failure result. The server still owns the actual contact copy/verification.
create function public.sms_record_application_handoff(
  p_application uuid, p_cohort uuid, p_actor uuid, p_state text
)
returns text language plpgsql security invoker set search_path='' as $$
declare a public.cohort_applications;
begin
  if p_state not in ('complete', 'needs_review', 'conflict') then
    raise exception 'Invalid handoff state' using errcode='23514';
  end if;
  select * into strict a from public.cohort_applications
    where id=p_application and cohort_id=p_cohort for update;
  perform public.ascenso_assert_admin(p_actor,a.cohort_id);
  if a.status <> 'approved' then
    raise exception 'Application is not approved' using errcode='23514';
  end if;
  if a.sms_handoff_state = 'complete' and p_state <> 'complete' then
    return a.sms_handoff_state;
  end if;
  update public.cohort_applications set sms_handoff_state=p_state where id=a.id;
  return p_state;
end $$;

revoke execute on function public.sms_application_handoff_pending() from public, anon, authenticated;
revoke execute on function public.sms_record_application_handoff(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.sms_record_application_handoff(uuid,uuid,uuid,text) to service_role;

commit;
