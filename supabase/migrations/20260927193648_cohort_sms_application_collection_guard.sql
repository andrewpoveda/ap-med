begin;

-- The intake trigger already locks the cohort row FOR SHARE to serialize
-- applications with lifecycle changes. Read phone collection policy under
-- that same lock so an admin setting change cannot race the application insert.
create or replace function public.ascenso_lifecycle_write_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  state text;
  collection_mode text;
  sms_phone text;
begin
  select status, config->>'sms_phone_collection'
    into strict state, collection_mode
    from public.cohorts where id=new.cohort_id for share;

  if tg_table_name='cohort_applications' then
    if state<>'applications_open' then
      raise exception 'Applications closed' using errcode='23514';
    end if;

    if collection_mode='required' then
      sms_phone := new.answers->>'sms_phone_e164';
      if jsonb_typeof(new.answers->'sms_phone_e164') is distinct from 'string' or
         sms_phone is null or sms_phone !~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$' then
        raise exception 'Phone collection settings changed; reload and enter a valid phone number'
          using errcode='23514';
      end if;
    elsif collection_mode is distinct from 'optional' then
      -- Missing, off, and unrecognized values all disable collection.
      -- Keep the rest of the application instead of saving stale SMS data.
      new.answers := new.answers - array[
        'sms_phone_e164', 'sms_consent', 'sms_consented_at',
        'sms_consent_notice', 'sms_consent_notice_version'
      ];
    end if;
  end if;

  if tg_table_name='cohort_matches' and
     new.status in ('proposed','board_approved','active') and
     state not in ('applications_open','matching','active') then
    raise exception 'Cohort does not permit matching' using errcode='23514';
  end if;
  return new;
end $$;

commit;
