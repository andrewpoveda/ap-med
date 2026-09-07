begin;

alter table public.mentor add column membership_status text not null default 'active'
  check (membership_status in ('active','withdrawn','offboarded'));
alter table public.mentees add column membership_status text not null default 'active'
  check (membership_status in ('active','withdrawn','offboarded'));
alter table public.cohort_matches
  add column ended_at timestamptz,
  add column ended_by uuid references public.admin_users(id),
  add column end_reason text;

-- Do not repair legacy conflicts by silently ending relationships. These
-- indexes fail the entire migration if operators must first resolve conflicts.
create unique index cohort_matches_one_live_mentor on public.cohort_matches(mentor_id)
  where status in ('proposed','board_approved','active');
create unique index cohort_matches_one_live_mentee on public.cohort_matches(mentee_id)
  where status in ('proposed','board_approved','active');
-- The existing all-status exact-pair unique index is deliberately retained.

create table public.cohort_operation_events (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id),
  actor_id uuid not null references public.admin_users(id),
  target_id uuid not null,
  action text not null,
  reason text not null,
  changes jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index cohort_operation_events_cohort_idx on public.cohort_operation_events(cohort_id,created_at);
alter table public.cohort_operation_events enable row level security;

-- Narrow, durable intents for Phase 2 decisions/introductions only. Provider
-- acceptance is not inbox delivery. Never infer historic sends from match state.
create table public.cohort_delivery (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id),
  source_id uuid not null,
  kind text not null check (kind in ('decision','introduction')),
  variant text not null,
  recipient_email text not null,
  payload jsonb not null,
  message jsonb,
  state text not null default 'pending' check (state in ('pending','sending','failed','accepted','superseded','needs_review')),
  attempt_key uuid not null default gen_random_uuid(),
  claim_token uuid,
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  accepted_at timestamptz,
  provider_id text,
  reservation_id uuid,
  detail text,
  created_at timestamptz not null default now(),
  unique(source_id,kind,variant)
);
create index cohort_delivery_cohort_idx on public.cohort_delivery(cohort_id,source_id);
alter table public.cohort_delivery enable row level security;

create function public.ascenso_assert_admin(p_actor uuid,p_cohort uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.admin_users where id=p_actor and (role='super' or cohort_id=p_cohort)) then
    raise exception 'Not found' using errcode='42501';
  end if;
end $$;

create function public.ascenso_match_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='DELETE' then
    if old.status in ('active','ended') then raise exception 'Historical matches cannot be deleted'; end if;
    return old;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.cohort_id::text,2));
  if TG_OP='UPDATE' then
    if (new.cohort_id,new.mentor_id,new.mentee_id) is distinct from (old.cohort_id,old.mentor_id,old.mentee_id) then
      raise exception 'Match participants are immutable';
    end if;
    if old.status='ended' and new.status<>'ended' then raise exception 'Ended matches are history; select a new pair'; end if;
    if old.status='active' and new.status not in ('active','ended') then raise exception 'Active matches can only be ended'; end if;
    if new.status='ended' and old.status<>'ended' and
       (old.status<>'active' or nullif(btrim(new.end_reason),'') is null or new.ended_by is null or new.ended_at is null) then
      raise exception 'Ending an active match requires an actor, timestamp and reason';
    end if;
  end if;
  if new.status in ('proposed','board_approved','active') then
    if not exists(select 1 from public.mentor where id=new.mentor_id and cohort_id=new.cohort_id and membership_status='active')
       or not exists(select 1 from public.mentees where id=new.mentee_id and cohort_id=new.cohort_id and membership_status='active') then
      raise exception 'Both participants must be active members of this cohort' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger ascenso_match_guard before insert or update or delete on public.cohort_matches
for each row execute function public.ascenso_match_guard();

create function public.ascenso_member_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.cohort_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.cohort_id::text,2));
    if new.membership_status<>'active' then
      if new.auth_user_id is distinct from old.auth_user_id then raise exception 'Inactive membership cannot be claimed'; end if;
      if exists(select 1 from public.cohort_matches where cohort_id=new.cohort_id
          and status in ('proposed','board_approved','active')
          and ((TG_TABLE_NAME='mentor' and mentor_id=new.id) or (TG_TABLE_NAME='mentees' and mentee_id=new.id))) then
        raise exception 'End active matches and remove selections before changing membership status' using errcode='23514';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger ascenso_member_guard before update on public.mentor for each row execute function public.ascenso_member_guard();
create trigger ascenso_member_guard before update on public.mentees for each row execute function public.ascenso_member_guard();

-- JSON intake arrays were validated by the public route; tolerate absent legacy
-- arrays, preserve exact stored labels, and union existing member tags.
create function public.ascenso_tags(p_answers jsonb,p_key text) returns text[]
language sql immutable security invoker set search_path='' as $$
  select coalesce(array_agg(v #>> '{}'),'{}') from jsonb_array_elements(
    case when jsonb_typeof(p_answers->p_key)='array' then p_answers->p_key else '[]'::jsonb end) v
  where jsonb_typeof(v)='string';
$$;
create function public.ascenso_union(a text[],b text[]) returns text[]
language sql immutable security invoker set search_path='' as $$ select coalesce(array_agg(distinct x),'{}') from unnest(a||b) x $$;

-- Decision, promotion and notification intent commit together. Email is sent
-- afterwards and cannot undo a decision. Same-status repeats are no-ops.
create function public.ascenso_review_application(p_id uuid,p_actor uuid,p_status text,p_notes text,p_email text)
returns text language plpgsql security invoker set search_path='' as $$
declare a public.cohort_applications; m uuid; c uuid; s text; n integer; an jsonb; t text; fullname text;
begin
  select * into strict a from public.cohort_applications where id=p_id for update;
  perform public.ascenso_assert_admin(p_actor,a.cohort_id);
  if p_status not in ('approved','rejected','waitlisted') then raise exception 'Invalid decision'; end if;
  if a.status=p_status then return a.status; end if;
  if a.status='approved' then raise exception 'Approval is final; use member management' using errcode='23514'; end if;
  -- Refuse to change a decision while an older email may be in flight.
  perform 1 from public.cohort_delivery where source_id=a.id for update;
  if exists(select 1 from public.cohort_delivery where source_id=a.id and state in ('sending','failed','needs_review')) then
    raise exception 'Resolve the uncertain decision email before changing the decision' using errcode='23514';
  end if;
  if p_status='approved' then
    perform pg_advisory_xact_lock(hashtextextended(p_email,1));
    perform pg_advisory_xact_lock(hashtextextended(a.cohort_id::text,2));
    an:=coalesce(a.answers,'{}'); fullname:=btrim(a.full_name);
    if a.role='mentor' then
      select count(*) into n from public.mentor where normalized_email=p_email;
      if n>1 then raise exception 'Ambiguous email identity' using errcode='23514'; end if;
      select id,cohort_id,membership_status into m,c,s from public.mentor where normalized_email=p_email for update;
      if m is not null and (c is not null and c<>a.cohort_id or s<>'active') then raise exception 'Member belongs to another cohort or is inactive' using errcode='23514'; end if;
      if m is null then
        insert into public.mentor(first_name,last_name,"current_role",institution,bio,current_stage,email,cohort_id,linkedin_url,approved)
        values(split_part(fullname,' ',1),ltrim(substr(fullname,length(split_part(fullname,' ',1))+1)),left(coalesce(an->>'current_position',''),500),left(coalesce(an->>'institution',''),500),'','',a.email,a.cohort_id,left(coalesce(an->>'linkedin_url',''),500),false) returning id into m;
      end if;
      update public.mentor set cohort_id=a.cohort_id,
        identity=public.ascenso_union(identity,public.ascenso_tags(an,'identity')),
        specialty=public.ascenso_union(specialty,public.ascenso_tags(an,'specialty')),
        can_help_with=public.ascenso_union(can_help_with,public.ascenso_tags(an,'can_help_with')) where id=m;
    elsif a.role='mentee' then
      select count(*) into n from public.mentees where normalized_email=p_email and cohort_id is not null;
      if n>1 or exists(select 1 from public.mentees where normalized_email=p_email and cohort_id<>a.cohort_id) then raise exception 'Ambiguous or other-cohort email identity' using errcode='23514'; end if;
      select id,cohort_id,membership_status into m,c,s from public.mentees where normalized_email=p_email order by cohort_id nulls last,created_at desc,id limit 1 for update;
      if m is not null and s<>'active' then raise exception 'Member is inactive' using errcode='23514'; end if;
      if m is null then
        insert into public.mentees(full_name,email,school,current_stage,cohort_id,linkedin_url)
        values(fullname,a.email,left(coalesce(an->>'institution',''),500),'',a.cohort_id,left(coalesce(an->>'linkedin_url',''),500)) returning id into m;
      end if;
      update public.mentees set cohort_id=a.cohort_id,
        identity=public.ascenso_union(identity,public.ascenso_tags(an,'identity')),
        interests=public.ascenso_union(interests,public.ascenso_tags(an,'preferred_specialty')),
        help_with=public.ascenso_union(help_with,public.ascenso_tags(an,'help_with')) where id=m;
    else raise exception 'Invalid role'; end if;
  end if;
  update public.cohort_applications set status=p_status,reviewed_by=p_actor,reviewed_at=now(),review_notes=nullif(p_notes,''),member_id=coalesce(m,member_id) where id=a.id;
  update public.cohort_delivery set state='superseded',detail='Decision replaced before acceptance'
    where source_id=a.id and kind='decision' and state in ('pending','failed','needs_review');
  select name into t from public.cohorts where id=a.cohort_id;
  insert into public.cohort_delivery(cohort_id,source_id,kind,variant,recipient_email,payload)
    values(a.cohort_id,a.id,'decision',p_status,a.email,jsonb_build_object('name',a.full_name,'cohortName',t,'status',p_status))
    on conflict(source_id,kind,variant) do update set state=case when cohort_delivery.state='superseded' then 'pending' else cohort_delivery.state end;
  insert into public.cohort_operation_events(cohort_id,actor_id,target_id,action,reason,changes)
    values(a.cohort_id,p_actor,a.id,'application_decision',coalesce(p_notes,''),jsonb_build_object('from',a.status,'to',p_status));
  return p_status;
end $$;

create function public.ascenso_change_member(p_id uuid,p_cohort uuid,p_role text,p_actor uuid,p_changes jsonb,p_reason text,p_expected jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare tbl text; before_row jsonb; after_row jsonb;
begin
  perform public.ascenso_assert_admin(p_actor,p_cohort);
  if p_role not in ('mentor','mentee') or nullif(btrim(p_reason),'') is null then raise exception 'Role and reason required'; end if;
  tbl:=case when p_role='mentor' then 'mentor' else 'mentees' end;
  perform pg_advisory_xact_lock(hashtextextended(p_cohort::text,2));
  execute format('select to_jsonb(m) from public.%I m where id=$1 and cohort_id=$2 for update',tbl) into before_row using p_id,p_cohort;
  if before_row is null then raise exception 'Not found' using errcode='42501'; end if;
  if p_expected is null or not (before_row @> p_expected) then raise exception 'Member changed since this page loaded; refresh before saving' using errcode='23514'; end if;
  -- Identity, cohort, auth ownership and application answers are not editable.
  if p_role='mentor' then
    if p_changes - array['first_name','last_name','institution','current_role','bio','membership_status'] <> '{}'::jsonb then raise exception 'Unsupported correction'; end if;
    update public.mentor set first_name=coalesce(p_changes->>'first_name',first_name),last_name=coalesce(p_changes->>'last_name',last_name),
      institution=coalesce(p_changes->>'institution',institution),"current_role"=coalesce(p_changes->>'current_role',"current_role"),
      bio=coalesce(p_changes->>'bio',bio),membership_status=coalesce(p_changes->>'membership_status',membership_status) where id=p_id;
  else
    if p_changes - array['full_name','school','membership_status'] <> '{}'::jsonb then raise exception 'Unsupported correction'; end if;
    update public.mentees set full_name=coalesce(p_changes->>'full_name',full_name),school=coalesce(p_changes->>'school',school),
      membership_status=coalesce(p_changes->>'membership_status',membership_status) where id=p_id;
  end if;
  execute format('select to_jsonb(m) from public.%I m where id=$1',tbl) into after_row using p_id;
  if after_row->>'membership_status'<>'active' then
    perform 1 from public.cohort_delivery where source_id in (select id from public.cohort_applications where member_id=p_id and cohort_id=p_cohort and role=p_role) for update;
    if exists(select 1 from public.cohort_delivery where source_id in (select id from public.cohort_applications where member_id=p_id and cohort_id=p_cohort and role=p_role) and state='sending') then
      raise exception 'Resolve in-flight decision email before offboarding' using errcode='23514';
    end if;
    update public.cohort_delivery set state='superseded',detail='Membership inactive' where source_id in (select id from public.cohort_applications where member_id=p_id and cohort_id=p_cohort and role=p_role) and state in ('pending','failed','needs_review');
  end if;
  insert into public.cohort_operation_events(cohort_id,actor_id,target_id,action,reason,changes)
    values(p_cohort,p_actor,p_id,'member_correction',p_reason,jsonb_build_object('before',
      (select jsonb_object_agg(k,before_row->k) from jsonb_object_keys(p_changes) k),'after',p_changes));
end $$;

create function public.ascenso_match_action(p_id uuid,p_actor uuid,p_action text,p_reason text default '')
returns text language plpgsql security invoker set search_path='' as $$
declare m public.cohort_matches; mr public.mentor; me public.mentees; cn text;
begin
  select * into strict m from public.cohort_matches where id=p_id;
  perform public.ascenso_assert_admin(p_actor,m.cohort_id);
  perform pg_advisory_xact_lock(hashtextextended(m.cohort_id::text,2));
  select * into strict m from public.cohort_matches where id=p_id for update;
  if p_action='end' then
    if m.status='ended' then return m.status; end if;
    if m.status<>'active' or nullif(btrim(p_reason),'') is null then raise exception 'Only active matches can end; a reason is required' using errcode='23514'; end if;
    perform 1 from public.cohort_delivery where source_id=m.id for update;
    if exists(select 1 from public.cohort_delivery where source_id=m.id and state='sending') then raise exception 'Resolve in-flight introductions before ending the match' using errcode='23514'; end if;
    update public.cohort_matches set status='ended',ended_at=now(),ended_by=p_actor,end_reason=p_reason where id=m.id;
    update public.cohort_delivery set state='superseded',detail='Match ended' where source_id=m.id and state in ('pending','failed','needs_review');
  elsif p_action='activate' then
    if m.status='active' then return m.status; end if;
    if m.status<>'board_approved' then raise exception 'Only a board-approved match can activate' using errcode='23514'; end if;
    select * into strict mr from public.mentor where id=m.mentor_id and cohort_id=m.cohort_id;
    select * into strict me from public.mentees where id=m.mentee_id and cohort_id=m.cohort_id;
    select name into cn from public.cohorts where id=m.cohort_id;
    update public.cohort_matches set status='active' where id=m.id;
    insert into public.cohort_delivery(cohort_id,source_id,kind,variant,recipient_email,payload) values
      (m.cohort_id,m.id,'introduction','mentor',mr.email,jsonb_build_object('name',mr.first_name||' '||mr.last_name,'partnerName',me.full_name,'partnerEmail',me.email,'cohortName',cn)),
      (m.cohort_id,m.id,'introduction','mentee',me.email,jsonb_build_object('name',me.full_name,'partnerName',mr.first_name||' '||mr.last_name,'partnerEmail',mr.email,'cohortName',cn));
  else raise exception 'Invalid match action'; end if;
  insert into public.cohort_operation_events(cohort_id,actor_id,target_id,action,reason,changes)
    values(m.cohort_id,p_actor,m.id,'match_'||p_action,p_reason,jsonb_build_object('from',m.status));
  return case when p_action='end' then 'ended' else 'active' end;
end $$;

create function public.ascenso_claim_delivery(p_id uuid,p_message jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.cohort_delivery; reservation uuid;
begin
  select * into strict d from public.cohort_delivery where id=p_id for update;
  if d.state in ('accepted','superseded','needs_review') then return null; end if;
  if d.state='sending' and d.last_attempt_at>clock_timestamp()-interval '2 minutes' then return null; end if;
  -- Resend retains keys for 24h. Stop before expiry instead of risking a
  -- duplicate after an ambiguous response or crashed process.
  if d.first_attempt_at<clock_timestamp()-interval '23 hours' then
    update public.cohort_delivery set state='needs_review',detail='Check provider before retrying: idempotency window elapsed' where id=p_id;
    return null;
  end if;
  reservation:=public.reserve_email_budget(1);
  if reservation is null then
    update public.cohort_delivery set detail='Daily email budget reached; retry later' where id=p_id;
    return null;
  end if;
  update public.cohort_delivery set state='sending',message=coalesce(message,p_message),
    first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),last_attempt_at=clock_timestamp(),
    claim_token=gen_random_uuid(),reservation_id=reservation,detail=null where id=p_id returning * into d;
  return to_jsonb(d);
end $$;

create function public.ascenso_finish_delivery(p_id uuid,p_token uuid,p_provider_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare d public.cohort_delivery;
begin
  select * into strict d from public.cohort_delivery where id=p_id for update;
  if d.state<>'sending' or d.claim_token is distinct from p_token then return false; end if;
  if p_provider_id is null then
    -- Unknown transport failures retain budget capacity conservatively.
    update public.cohort_delivery set state='failed',detail='Provider acceptance unconfirmed; retry uses the same key' where id=p_id;
  else
    insert into public.email_log(cohort_id,kind,recipient_email,ref_id)
      values(d.cohort_id,case when d.kind='decision' then 'application_decision' else 'match_notify' end,d.recipient_email,d.source_id);
    -- A midnight-crossing reservation may already have expired.
    if exists(select 1 from public.email_budget_reservations where id=d.reservation_id) then
      perform public.release_email_budget_slots(d.reservation_id,1);
    end if;
    update public.cohort_delivery set state='accepted',accepted_at=clock_timestamp(),provider_id=p_provider_id,detail=null where id=p_id;
  end if;
  return true;
end $$;

-- An operator can resolve an expired/uncertain attempt only after checking the
-- provider. No timer resets the key automatically.
create function public.ascenso_resolve_delivery(p_id uuid,p_actor uuid,p_accepted boolean,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare d public.cohort_delivery;
begin
  select * into strict d from public.cohort_delivery where id=p_id for update;
  perform public.ascenso_assert_admin(p_actor,d.cohort_id);
  if d.state not in ('failed','needs_review','sending') or (d.state='sending' and d.last_attempt_at>clock_timestamp()-interval '2 minutes')
     or length(btrim(p_reason))<10 then raise exception 'Check provider and describe the result; an active send cannot be resolved'; end if;
  if p_accepted then
    insert into public.email_log(cohort_id,kind,recipient_email,ref_id) values(d.cohort_id,'operator_confirmed',d.recipient_email,d.source_id);
    if exists(select 1 from public.email_budget_reservations where id=d.reservation_id) then
      perform public.release_email_budget_slots(d.reservation_id,1);
    end if;
    update public.cohort_delivery set state='accepted',accepted_at=now(),detail='Provider acceptance confirmed by administrator' where id=p_id;
  else
    if exists(select 1 from public.email_budget_reservations where id=d.reservation_id) then
      perform public.release_email_budget_slots(d.reservation_id,1);
    end if;
    update public.cohort_delivery set state='pending',attempt_key=gen_random_uuid(),first_attempt_at=null,claim_token=null,detail='Administrator confirmed not accepted' where id=p_id;
  end if;
  insert into public.cohort_operation_events(cohort_id,actor_id,target_id,action,reason,changes)
    values(d.cohort_id,p_actor,d.id,'delivery_resolution',p_reason,jsonb_build_object('accepted',p_accepted));
end $$;

grant all on public.cohort_delivery,public.cohort_operation_events to service_role;
revoke all on public.cohort_delivery,public.cohort_operation_events from anon,authenticated;
do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'ascenso_%' loop
    execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
