begin;

-- The worker has not called the provider when its final eligibility read fails.
-- Let that same worker put the claim back into the retryable queue. An actual
-- provider attempt still uses sms_finish_outbox and is never released here.
create function public.sms_release_unsent_claim(p_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  if p_id is null then
    raise exception 'SMS intent ID is required' using errcode = '22023';
  end if;
  update public.sms_outbox set
    state = 'pending', first_attempt_at = null, last_attempt_at = null,
    detail = 'Eligibility check unavailable before provider call; retry pending'
  where id = p_id and state = 'sending' and first_attempt_at is not null
    and provider is null and provider_message_id is null and sent_at is null;
  get diagnostics changed = row_count;
  return changed = 1;
end $$;

revoke execute on function public.sms_release_unsent_claim(uuid)
  from public, anon, authenticated;
grant execute on function public.sms_release_unsent_claim(uuid) to service_role;

commit;
