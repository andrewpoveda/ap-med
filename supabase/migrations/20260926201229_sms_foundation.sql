begin;

-- All existing and future cohorts remain SMS-off until explicitly enabled.
alter table public.cohorts
  add column sms_enabled boolean not null default false;

-- Consent belongs to a person in a cohort, not to a particular mentor/mentee
-- row: one person may have more than one participation. A phone may be stored
-- without consent, but it must never be used for sending in that state.
create table public.cohort_sms_contacts (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id),
  person_id uuid not null references public.people(id),
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  consented_at timestamptz,
  consent_source text,
  consent_notice_version text,
  consent_notice text,
  opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cohort_id, person_id),
  unique (cohort_id, phone_e164),
  unique (id, cohort_id),
  constraint cohort_sms_contacts_consent_detail check (
    (consented_at is null or
      (nullif(btrim(consent_source), '') is not null and
       nullif(btrim(consent_notice_version), '') is not null and
       nullif(btrim(consent_notice), '') is not null and
       length(btrim(consent_notice)) <= 2000))
    and (phone_e164 is not null or consented_at is null or opted_out_at is not null)
  )
);
create index cohort_sms_contacts_phone_idx on public.cohort_sms_contacts(phone_e164);

-- STOP applies to a destination number across every cohort and participation.
create table public.sms_phone_suppressions (
  phone_e164 text primary key check (phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  opted_out_at timestamptz not null default now(),
  resumed_at timestamptz,
  source text not null default 'stop'
);

-- A check-in is a program record shared by web and SMS. The session determines
-- the exact pair and cohort; a reply does not assert that a meeting occurred.
create table public.meeting_checkins (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id),
  match_id uuid not null,
  session_id uuid not null references public.sessions(id),
  member_type text not null check (member_type in ('mentor', 'mentee')),
  member_id uuid not null,
  prompted_at timestamptz,
  response_text text,
  response_channel text check (response_channel in ('web', 'sms')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, member_type, member_id),
  unique (id, cohort_id, session_id),
  constraint meeting_checkins_match_cohort_fk foreign key (match_id, cohort_id)
    references public.cohort_matches(id, cohort_id),
  constraint meeting_checkins_response_complete check (
    (response_text is null and response_channel is null and responded_at is null) or
    (response_text is not null and length(btrim(response_text)) between 1 and 2000
      and response_channel is not null and responded_at is not null)
  )
);
create index meeting_checkins_cohort_idx on public.meeting_checkins(cohort_id, created_at);

-- Durable send intents keep the exact context used to issue each reminder or
-- question. A unique reply code avoids guessing when one phone has multiple
-- cohorts, participations, or outstanding meetings.
create table public.sms_outbox (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id),
  contact_id uuid not null,
  session_id uuid not null references public.sessions(id),
  checkin_id uuid,
  kind text not null check (kind in ('reminder', 'checkin')),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  sender_phone_e164 text check (sender_phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  body text not null check (length(btrim(body)) between 1 and 1600),
  state text not null default 'pending'
    check (state in ('pending', 'sending', 'accepted', 'failed', 'needs_review', 'superseded')),
  reply_code text unique,
  reply_expires_at timestamptz,
  provider text,
  provider_message_id text unique,
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  detail text,
  created_at timestamptz not null default now(),
  unique (kind, session_id, contact_id),
  constraint sms_outbox_contact_cohort_fk foreign key (contact_id, cohort_id)
    references public.cohort_sms_contacts(id, cohort_id),
  constraint sms_outbox_checkin_context_fk foreign key (checkin_id, cohort_id, session_id)
    references public.meeting_checkins(id, cohort_id, session_id),
  constraint sms_outbox_kind_context check (
    (kind = 'reminder' and checkin_id is null and reply_code is null
      and reply_expires_at is null) or
    (kind = 'checkin' and checkin_id is not null
      and nullif(btrim(reply_code), '') is not null and reply_expires_at is not null)
  ),
  constraint sms_outbox_sender_on_claim check (
    kind <> 'checkin' or state not in ('sending', 'accepted')
      or sender_phone_e164 is not null
  )
);
create index sms_outbox_pending_idx on public.sms_outbox(created_at, id)
  where state = 'pending';

-- Retain webhook IDs for deduplication and recovery. Unmatched/STOP messages
-- may have no cohort or outgoing message context.
create table public.sms_inbound_receipts (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_message_id text not null,
  from_phone_e164 text not null check (from_phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  to_phone_e164 text not null check (to_phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  cohort_id uuid references public.cohorts(id),
  matched_outbox_id uuid references public.sms_outbox(id),
  resolution text not null default 'received'
    check (resolution in ('received', 'responded', 'stop', 'start', 'unmatched', 'ignored')),
  received_at timestamptz not null default now(),
  unique (provider, provider_message_id)
);

-- The existing discarded-cohort migration installed this guard only on tables
-- that existed then. Attach it explicitly to each new cohort-scoped table.
create trigger ascenso_discarded_cohort_write before insert or update of cohort_id
  on public.cohort_sms_contacts for each row
  execute function public.ascenso_reject_discarded_cohort_write();
create trigger ascenso_discarded_cohort_write before insert or update of cohort_id
  on public.meeting_checkins for each row
  execute function public.ascenso_reject_discarded_cohort_write();
create trigger ascenso_discarded_cohort_write before insert or update of cohort_id
  on public.sms_outbox for each row
  execute function public.ascenso_reject_discarded_cohort_write();
create trigger ascenso_discarded_cohort_write before insert or update of cohort_id
  on public.sms_inbound_receipts for each row
  execute function public.ascenso_reject_discarded_cohort_write();

-- Bind a contact to an actual cohort participation. Phone changes need fresh
-- consent if the old number had consent; opt-out can always be recorded.
create function public.sms_contact_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (new.cohort_id, new.person_id) is distinct from (old.cohort_id, old.person_id) then
      raise exception 'SMS contact identity cannot change' using errcode = '23514';
    end if;
    if new.phone_e164 is not null and new.phone_e164 is distinct from old.phone_e164
      and old.consented_at is not null
      and new.consented_at is not distinct from old.consented_at then
      raise exception 'A new phone number requires new SMS consent' using errcode = '23514';
    end if;
  end if;
  if not (
    exists(select 1 from public.mentor m where m.person_id = new.person_id and m.cohort_id = new.cohort_id) or
    exists(select 1 from public.mentees m where m.person_id = new.person_id and m.cohort_id = new.cohort_id)
  ) then
    raise exception 'SMS contact must belong to a cohort member' using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger sms_contact_guard before insert or update on public.cohort_sms_contacts
  for each row execute function public.sms_contact_guard();

-- The session's immutable context and the selected side of the pair determine
-- ownership. A past booked session may be checked in through either channel,
-- including before an SMS prompt exists.
create function public.meeting_checkin_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare s public.sessions; m public.cohort_matches; cohort_status text;
begin
  if tg_op = 'UPDATE' then
    if (new.cohort_id, new.match_id, new.session_id, new.member_type, new.member_id)
      is distinct from (old.cohort_id, old.match_id, old.session_id, old.member_type, old.member_id) then
      raise exception 'Meeting check-in identity cannot change' using errcode = '23514';
    end if;
    if old.responded_at is not null and
      (new.response_text, new.response_channel, new.responded_at)
      is distinct from (old.response_text, old.response_channel, old.responded_at) then
      raise exception 'Meeting check-in response is final' using errcode = '23514';
    end if;
  end if;
  select status into strict cohort_status from public.cohorts where id = new.cohort_id for share;
  if cohort_status in ('closed', 'discarded') then
    raise exception 'Cohort is closed to check-ins' using errcode = '23514';
  end if;
  select * into strict s from public.sessions where id = new.session_id;
  select * into strict m from public.cohort_matches where id = new.match_id;
  if (s.cohort_id, s.match_id) is distinct from (new.cohort_id, new.match_id)
    or (s.mentor_id, s.mentee_id) is distinct from (m.mentor_id, m.mentee_id)
    or (new.member_type = 'mentor' and new.member_id <> m.mentor_id)
    or (new.member_type = 'mentee' and new.member_id <> m.mentee_id)
    or s.scheduled_at > clock_timestamp() or s.status = 'cancelled' then
    raise exception 'Meeting check-in must reference a past session and its member' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger meeting_checkin_guard before insert or update on public.meeting_checkins
  for each row execute function public.meeting_checkin_guard();

-- Queueing and claiming both recheck consent, suppression, phone snapshot, and
-- the cohort flag. The provider worker must move pending -> sending before it
-- calls the provider; an uncertain attempt stays visible for operator review.
create function public.sms_outbox_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare c public.cohorts; contact public.cohort_sms_contacts; s public.sessions;
        m public.cohort_matches; checkin public.meeting_checkins;
        mentor_person uuid; mentee_person uuid;
        mentor_status text; mentee_status text; check_eligibility boolean;
begin
  if tg_op = 'INSERT' then
    if new.state <> 'pending' then
      raise exception 'New SMS intents must be pending' using errcode = '23514';
    end if;
    check_eligibility := true;
  else
    if (new.cohort_id, new.contact_id, new.session_id, new.checkin_id, new.kind,
       new.phone_e164, new.body, new.reply_code, new.reply_expires_at)
      is distinct from
      (old.cohort_id, old.contact_id, old.session_id, old.checkin_id, old.kind,
       old.phone_e164, old.body, old.reply_code, old.reply_expires_at) then
      raise exception 'Queued SMS context cannot change' using errcode = '23514';
    end if;
    if old.sender_phone_e164 is not null
      and new.sender_phone_e164 is distinct from old.sender_phone_e164 then
      raise exception 'SMS sender number cannot change after assignment' using errcode = '23514';
    end if;
    check_eligibility := new.state = 'sending' and old.state is distinct from 'sending';
  end if;
  if check_eligibility then
    select * into strict c from public.cohorts where id = new.cohort_id for share;
    select * into strict contact from public.cohort_sms_contacts where id = new.contact_id for share;
    select * into strict s from public.sessions where id = new.session_id;
    if s.match_id is null then
      raise exception 'SMS session has no cohort match' using errcode = '23514';
    end if;
    select * into strict m from public.cohort_matches where id = s.match_id;
    select person_id, membership_status into strict mentor_person, mentor_status
      from public.mentor where id = s.mentor_id;
    select person_id, membership_status into strict mentee_person, mentee_status
      from public.mentees where id = s.mentee_id;
    if not c.sms_enabled or c.status in ('closed', 'discarded')
      or contact.cohort_id <> c.id or contact.phone_e164 is distinct from new.phone_e164
      or contact.consented_at is null or contact.opted_out_at is not null
      or exists(select 1 from public.sms_phone_suppressions
        where phone_e164 = new.phone_e164 and
          (resumed_at is null or resumed_at <= opted_out_at
            or contact.consented_at <= opted_out_at))
      or (s.cohort_id, m.cohort_id, s.mentor_id, s.mentee_id)
        is distinct from (new.cohort_id, new.cohort_id, m.mentor_id, m.mentee_id) then
      raise exception 'SMS is not eligible for this cohort, contact, or session' using errcode = '23514';
    end if;
    if new.kind = 'reminder' then
      if not ((contact.person_id = mentor_person and mentor_status = 'active')
        or (contact.person_id = mentee_person and mentee_status = 'active'))
        or m.status <> 'active' or s.status <> 'scheduled'
        or s.scheduled_at <= clock_timestamp() then
        raise exception 'Meeting reminder is no longer eligible' using errcode = '23514';
      end if;
    else
      select * into strict checkin from public.meeting_checkins where id = new.checkin_id;
      if (checkin.cohort_id, checkin.session_id, checkin.match_id)
        is distinct from (new.cohort_id, new.session_id, m.id)
        or (checkin.member_type = 'mentor' and
          (contact.person_id <> mentor_person or mentor_status <> 'active'))
        or (checkin.member_type = 'mentee' and
          (contact.person_id <> mentee_person or mentee_status <> 'active'))
        or checkin.responded_at is not null or s.status = 'cancelled'
        or new.reply_expires_at <= clock_timestamp() then
        raise exception 'Meeting check-in SMS is no longer eligible' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger sms_outbox_guard before insert or update on public.sms_outbox
  for each row execute function public.sms_outbox_guard();

alter table public.cohort_sms_contacts enable row level security;
alter table public.sms_phone_suppressions enable row level security;
alter table public.meeting_checkins enable row level security;
alter table public.sms_outbox enable row level security;
alter table public.sms_inbound_receipts enable row level security;
revoke all on public.cohort_sms_contacts, public.sms_phone_suppressions,
  public.meeting_checkins, public.sms_outbox, public.sms_inbound_receipts
  from anon, authenticated;
grant all on public.cohort_sms_contacts, public.sms_phone_suppressions,
  public.meeting_checkins, public.sms_outbox, public.sms_inbound_receipts
  to service_role;
revoke execute on function public.sms_contact_guard(), public.meeting_checkin_guard(),
  public.sms_outbox_guard() from public, anon, authenticated;
grant execute on function public.sms_contact_guard(), public.meeting_checkin_guard(),
  public.sms_outbox_guard() to service_role;

commit;
