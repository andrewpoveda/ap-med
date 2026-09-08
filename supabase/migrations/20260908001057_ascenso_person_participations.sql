begin;

-- Abort ambiguous legacy ownership; never merge or choose records by recency.
do $$ begin
  if exists(select 1 from (
    select normalized_email,auth_user_id from public.mentor
    union all select normalized_email,auth_user_id from public.mentees where cohort_id is not null
  ) r where auth_user_id is not null group by normalized_email having count(distinct auth_user_id)>1)
  or exists(select 1 from (
    select normalized_email,auth_user_id from public.mentor
    union all select normalized_email,auth_user_id from public.mentees where cohort_id is not null
  ) r where auth_user_id is not null group by auth_user_id having count(distinct normalized_email)>1)
  or exists(select 1 from public.mentor where normalized_email<>'' group by normalized_email,cohort_id having count(*)>1)
  or exists(select 1 from public.mentees where cohort_id is not null group by normalized_email,cohort_id having count(*)>1) then
    raise exception 'Resolve ambiguous legacy email/auth/participation identities before Phase 7';
  end if;
end $$;

create table public.people (
  id uuid primary key default gen_random_uuid(),
  normalized_email text unique,
  auth_user_id uuid unique,
  created_at timestamptz not null default now()
);
alter table public.people enable row level security;
revoke all on public.people from anon,authenticated;
grant all on public.people to service_role;
alter table public.mentor add column person_id uuid references public.people(id);
alter table public.mentees add column person_id uuid references public.people(id);

do $$ declare r record; p uuid; begin
  for r in select 'mentor'::text tbl,id,normalized_email,auth_user_id from public.mentor
    union all select 'mentees',id,normalized_email,auth_user_id from public.mentees where cohort_id is not null loop
    insert into public.people(normalized_email,auth_user_id) values(nullif(r.normalized_email,''),r.auth_user_id)
    on conflict(normalized_email) do update set auth_user_id=coalesce(people.auth_user_id,excluded.auth_user_id) returning id into p;
    execute format('update public.%I set person_id=$1 where id=$2',r.tbl) using p,r.id;
  end loop;
end $$;

drop index public.mentor_auth_user_id_key;
drop index public.mentees_auth_user_id_key;
drop index public.mentees_cohort_email_key;
create unique index mentor_person_cohort_key on public.mentor(person_id,cohort_id) where cohort_id is not null;
create unique index mentor_person_general_key on public.mentor(person_id) where cohort_id is null;
create unique index mentees_person_cohort_key on public.mentees(person_id,cohort_id) where cohort_id is not null;

create function public.ascenso_normalize_email(p_email text) returns text language sql immutable set search_path='' as $$
  select lower(btrim(p_email,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'));
$$;

create function public.ascenso_bind_person() returns trigger language plpgsql security invoker set search_path='' as $$
declare identity public.people; normalized text:=nullif(public.ascenso_normalize_email(new.email),'');
begin
  if tg_op='UPDATE' and new.cohort_id is distinct from old.cohort_id then raise exception 'Participation cohort is immutable; enroll a new participation'; end if;
  if tg_table_name='mentees' and new.cohort_id is null then
    if new.auth_user_id is not null or new.person_id is not null then raise exception 'General mentees do not have authenticated participation'; end if;
    return new;
  end if;
  if tg_op='UPDATE' and (new.person_id is distinct from old.person_id or public.ascenso_normalize_email(new.email) is distinct from public.ascenso_normalize_email(old.email)) then
    raise exception 'Participation identity is immutable';
  end if;
  if new.person_id is null then
    insert into public.people(normalized_email) values(normalized)
      on conflict(normalized_email) do update set normalized_email=excluded.normalized_email returning * into identity;
    new.person_id:=identity.id;
  else
    select * into strict identity from public.people where id=new.person_id for update;
    if identity.normalized_email is distinct from normalized then raise exception 'Person email mismatch'; end if;
  end if;
  if new.auth_user_id is not null then
    if identity.auth_user_id is not null and identity.auth_user_id<>new.auth_user_id then raise exception 'Person already owned'; end if;
    update public.people set auth_user_id=new.auth_user_id where id=identity.id and auth_user_id is null;
  end if;
  if tg_op='INSERT' and new.auth_user_id is null then new.auth_user_id:=identity.auth_user_id; end if;
  return new;
end $$;
create trigger ascenso_bind_person before insert or update on public.mentor for each row execute function public.ascenso_bind_person();
create trigger ascenso_bind_person before insert or update on public.mentees for each row execute function public.ascenso_bind_person();

-- Auth identity is stable; participation status still controls program access.
create function public.ascenso_claim_person(p_user uuid,p_email text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare p public.people;
begin
  select * into p from public.people where normalized_email=public.ascenso_normalize_email(p_email) for update;
  if not found then return null; end if;
  if p.auth_user_id is not null and p.auth_user_id<>p_user then raise exception 'Identity already owned' using errcode='42501'; end if;
  if exists(select 1 from public.people where auth_user_id=p_user and id<>p.id) then raise exception 'Conflicting identity' using errcode='42501'; end if;
  if not (exists(select 1 from public.mentor where person_id=p.id and (cohort_id is null or membership_status='active')) or
    exists(select 1 from public.mentees where person_id=p.id and cohort_id is not null and membership_status='active')) then return null; end if;
  update public.people set auth_user_id=p_user where id=p.id and auth_user_id is null;
  return p.id;
end $$;

-- Organization labels are not identities. Start each historical cohort with
-- its own owner record rather than silently merging equal labels.
create table public.organizations(id uuid primary key default gen_random_uuid(),name text not null,created_at timestamptz not null default now());
alter table public.organizations enable row level security;
revoke all on public.organizations from anon,authenticated;
grant all on public.organizations to service_role;
alter table public.cohorts add column organization_id uuid references public.organizations(id);
do $$ declare r record; o uuid; begin
  for r in select id,org from public.cohorts loop
    insert into public.organizations(name) values(r.org) returning id into o;
    update public.cohorts set organization_id=o where id=r.id;
  end loop;
end $$;
alter table public.cohorts alter column organization_id set not null;
create function public.ascenso_cohort_owner() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' and new.organization_id is null then
    insert into public.organizations(name) values(new.org) returning id into new.organization_id;
  elsif tg_op='UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'Organization ownership is immutable; requires deliberate migration';
  end if;
  return new;
end $$;
create trigger ascenso_cohort_owner before insert or update on public.cohorts for each row execute function public.ascenso_cohort_owner();

create or replace function public.ascenso_review_application_v2(p_id uuid,p_actor uuid,p_status text,p_notes text,p_email text)
returns text language plpgsql security invoker set search_path='' as $$
declare a public.cohort_applications; m uuid; c uuid; s text; n integer; an jsonb; t text; fullname text;
begin
  select * into strict a from public.cohort_applications where id=p_id for update;
  perform public.ascenso_assert_admin(p_actor,a.cohort_id);
  if public.ascenso_normalize_email(a.email) is distinct from p_email then raise exception 'Application email changed' using errcode='23514'; end if;
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
      select count(*) into n from public.mentor where normalized_email=p_email and cohort_id=a.cohort_id;
      if n>1 then raise exception 'Ambiguous cohort participation' using errcode='23514'; end if;
      select id,cohort_id,membership_status into m,c,s from public.mentor where normalized_email=p_email and cohort_id=a.cohort_id for update;
      if m is not null and s<>'active' then raise exception 'Existing participation is inactive' using errcode='23514'; end if;
      if m is null then
        insert into public.mentor(first_name,last_name,"current_role",institution,bio,current_stage,email,cohort_id,linkedin_url,approved)
        values(split_part(fullname,' ',1),ltrim(substr(fullname,length(split_part(fullname,' ',1))+1)),left(coalesce(an->>'current_position',''),500),left(coalesce(an->>'institution',''),500),'','',a.email,a.cohort_id,left(coalesce(an->>'linkedin_url',''),500),false) returning id into m;
      end if;
      update public.mentor set cohort_id=a.cohort_id,
        identity=public.ascenso_union(identity,public.ascenso_tags(an,'identity')),
        specialty=public.ascenso_union(specialty,public.ascenso_tags(an,'specialty')),
        can_help_with=public.ascenso_union(can_help_with,public.ascenso_tags(an,'can_help_with')) where id=m;
    elsif a.role='mentee' then
      select count(*) into n from public.mentees where normalized_email=p_email and cohort_id=a.cohort_id;
      if n>1 then raise exception 'Ambiguous cohort participation' using errcode='23514'; end if;
      select id,cohort_id,membership_status into m,c,s from public.mentees where normalized_email=p_email and cohort_id=a.cohort_id for update;
      if m is not null and s<>'active' then raise exception 'Existing participation is inactive' using errcode='23514'; end if;
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

alter table public.mentor alter column person_id set not null;
alter table public.mentees add constraint mentees_person_context check(
  (cohort_id is null and person_id is null and auth_user_id is null) or (cohort_id is not null and person_id is not null)
);
alter table public.mentor add constraint mentor_id_cohort_unique unique(id,cohort_id);
alter table public.mentees add constraint mentees_id_cohort_unique unique(id,cohort_id);
alter table public.cohort_matches add constraint match_id_cohort_unique unique(id,cohort_id);
alter table public.cohort_matches add constraint match_mentor_cohort_fk foreign key(mentor_id,cohort_id) references public.mentor(id,cohort_id);
alter table public.cohort_matches add constraint match_mentee_cohort_fk foreign key(mentee_id,cohort_id) references public.mentees(id,cohort_id);
alter table public.goals add constraint goal_match_cohort_fk foreign key(match_id,cohort_id) references public.cohort_matches(id,cohort_id);
alter table public.meeting_logs add constraint log_match_cohort_fk foreign key(match_id,cohort_id) references public.cohort_matches(id,cohort_id);
alter table public.surveys add constraint survey_id_cohort_unique unique(id,cohort_id);
alter table public.survey_responses add constraint response_survey_cohort_fk foreign key(survey_id,cohort_id) references public.surveys(id,cohort_id);

alter table public.sessions add column cohort_id uuid references public.cohorts(id);
alter table public.sessions add column match_id uuid;
alter table public.sessions add constraint session_match_cohort_fk foreign key(match_id,cohort_id) references public.cohort_matches(id,cohort_id);
alter table public.sessions add constraint session_context_pair check((match_id is null)=(cohort_id is null));
-- A linked log is direct evidence. Otherwise require a known activation window.
update public.sessions s set match_id=l.match_id,cohort_id=l.cohort_id
from public.meeting_logs l where l.session_id=s.id;
update public.sessions s set match_id=m.id,cohort_id=m.cohort_id from public.cohort_matches m
where s.match_id is null and s.mentor_id=m.mentor_id and s.mentee_id=m.mentee_id
  and m.activated_at is not null and m.activated_at<=s.scheduled_at
  and (m.ended_at is null or s.scheduled_at<=m.ended_at);

create function public.ascenso_relationship_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare m public.cohort_matches; c uuid; p uuid; partner uuid;
begin
  if tg_table_name='cohort_matches' then
    select person_id into p from public.mentor where id=new.mentor_id;
    select person_id into partner from public.mentees where id=new.mentee_id;
    if p=partner then raise exception 'A person cannot be matched with themselves' using errcode='23514'; end if;
  elsif tg_table_name='sessions' then
    if tg_op='UPDATE' and (new.mentor_id,new.mentee_id,new.match_id,new.cohort_id) is distinct from (old.mentor_id,old.mentee_id,old.match_id,old.cohort_id) then
      raise exception 'Session relationship context is immutable';
    end if;
    select cohort_id into c from public.mentor where id=new.mentor_id;
    if new.match_id is not null then
      -- Match end and cohort closeout must not race a newly accepted booking.
      -- Lock cohort before match, matching the lifecycle controller's order.
      if tg_op='INSERT' then
        perform 1 from public.cohorts where id=new.cohort_id for share;
        select * into strict m from public.cohort_matches where id=new.match_id for share;
      else
        select * into strict m from public.cohort_matches where id=new.match_id;
      end if;
      if (new.cohort_id,new.mentor_id,new.mentee_id) is distinct from (m.cohort_id,m.mentor_id,m.mentee_id) then raise exception 'Session pair/context mismatch' using errcode='23514'; end if;
      if tg_op='INSERT' and (m.status<>'active' or not exists(select 1 from public.cohorts where id=m.cohort_id and status in ('applications_open','matching','active'))) then raise exception 'Session requires an active relationship' using errcode='23514'; end if;
    elsif tg_op='INSERT' and (c is not null or exists(select 1 from public.mentees where id=new.mentee_id and cohort_id is not null)) then
      raise exception 'Cohort session requires explicit match context' using errcode='23514';
    end if;
  elsif tg_table_name='meeting_logs' then
    select * into strict m from public.cohort_matches where id=new.match_id;
    if new.logged_by_type not in ('mentor','mentee','admin') or
      (new.logged_by_type='mentor' and new.logged_by_id<>m.mentor_id) or
      (new.logged_by_type='mentee' and new.logged_by_id<>m.mentee_id) then raise exception 'Logger must belong to this pair' using errcode='23514'; end if;
    if new.logged_by_type='admin' then perform public.ascenso_assert_admin(new.logged_by_id,new.cohort_id); end if;
    if new.session_id is not null and not exists(select 1 from public.sessions where id=new.session_id and match_id=new.match_id and cohort_id=new.cohort_id) then
      raise exception 'Session relationship must match the log' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger ascenso_relationship_guard before insert or update on public.cohort_matches for each row execute function public.ascenso_relationship_guard();
create trigger ascenso_relationship_guard before insert or update on public.sessions for each row execute function public.ascenso_relationship_guard();
create trigger ascenso_relationship_guard before insert or update on public.meeting_logs for each row execute function public.ascenso_relationship_guard();

create function public.ascenso_member_reference_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare member_role text; member_id uuid;
begin
  if tg_table_name='cohort_applications' then member_role:=new.role; member_id:=new.member_id;
  else member_role:=new.member_type; member_id:=new.member_id; end if;
  if member_id is null and tg_table_name='cohort_applications' then return new; end if;
  if not ((member_role='mentor' and exists(select 1 from public.mentor where id=member_id and cohort_id=new.cohort_id)) or
    (member_role='mentee' and exists(select 1 from public.mentees where id=member_id and cohort_id=new.cohort_id))) then
    raise exception 'Member reference must belong to this cohort and role' using errcode='23514';
  end if;
  return new;
end $$;
create trigger ascenso_member_reference_guard before insert or update on public.cohort_applications for each row execute function public.ascenso_member_reference_guard();
create trigger ascenso_member_reference_guard before insert or update on public.member_milestones for each row execute function public.ascenso_member_reference_guard();
create trigger ascenso_member_reference_guard before insert or update on public.survey_responses for each row execute function public.ascenso_member_reference_guard();

-- Validate old polymorphic references too, not just future service-role writes.
do $$ begin
  if exists(select 1 from (
    select cohort_id,member_type role,member_id from public.member_milestones
    union all select cohort_id,member_type,member_id from public.survey_responses
    union all select cohort_id,role,member_id from public.cohort_applications where member_id is not null
  ) r where not ((r.role='mentor' and exists(select 1 from public.mentor m where m.id=r.member_id and m.cohort_id=r.cohort_id)) or
    (r.role='mentee' and exists(select 1 from public.mentees m where m.id=r.member_id and m.cohort_id=r.cohort_id)))) then
    raise exception 'Resolve historical cross-cohort member references before Phase 7';
  end if;
  if exists(select 1 from public.sessions s join public.cohort_matches m on m.id=s.match_id
    where (s.mentor_id,s.mentee_id,s.cohort_id) is distinct from (m.mentor_id,m.mentee_id,m.cohort_id)) then
    raise exception 'Resolve historical session/log pair conflicts before Phase 7';
  end if;
  if exists(select 1 from public.meeting_logs l join public.cohort_matches m on m.id=l.match_id where
    l.logged_by_type not in ('mentor','mentee','admin') or
    (l.logged_by_type='mentor' and l.logged_by_id<>m.mentor_id) or (l.logged_by_type='mentee' and l.logged_by_id<>m.mentee_id) or
    (l.logged_by_type='admin' and not exists(select 1 from public.admin_users a where a.id=l.logged_by_id))) then
    raise exception 'Resolve historical meeting logger references before Phase 7';
  end if;
end $$;

-- Google events currently have a fixed 30-minute duration. Serialize across
-- every role/program for the same person, including separate Calendar setups.
create function public.ascenso_person_booking_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare p uuid; q uuid; x uuid;
begin
  if new.status<>'scheduled' then return new; end if;
  if tg_op='UPDATE' and old.status='scheduled' and old.scheduled_at=new.scheduled_at then return new; end if;
  select person_id into p from public.mentor where id=new.mentor_id;
  select person_id into q from public.mentees where id=new.mentee_id;
  for x in select distinct v from unnest(array[p,q]) v where v is not null order by v loop
    perform pg_advisory_xact_lock(hashtextextended(x::text,7));
  end loop;
  if exists(select 1 from public.sessions s join public.mentor m on m.id=s.mentor_id join public.mentees me on me.id=s.mentee_id
    where s.id<>new.id and s.status='scheduled'
      and (m.person_id in (p,q) or me.person_id in (p,q))
      and s.scheduled_at<new.scheduled_at+interval '30 minutes' and s.scheduled_at+interval '30 minutes'>new.scheduled_at) then
    raise exception 'Person is already booked in another participation' using errcode='23505';
  end if;
  return new;
end $$;
create trigger ascenso_person_booking_guard before insert or update on public.sessions for each row execute function public.ascenso_person_booking_guard();

create function public.ascenso_person_busy(p_mentor uuid,p_start timestamptz,p_end timestamptz)
returns table(scheduled_at timestamptz) language sql security invoker set search_path='' as $$
  select s.scheduled_at from public.sessions s join public.mentor m on m.id=s.mentor_id join public.mentees me on me.id=s.mentee_id
  where s.status='scheduled' and s.scheduled_at>=p_start-interval '30 minutes' and s.scheduled_at<=p_end
    and (m.person_id=(select person_id from public.mentor where id=p_mentor) or me.person_id=(select person_id from public.mentor where id=p_mentor));
$$;

create or replace function public.ascenso_claim_delivery_v4(p_id uuid,p_message jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.cohort_delivery;
begin
  select * into strict d from public.cohort_delivery where id=p_id for update;
  if d.kind='digest' and d.expires_at<=clock_timestamp() and d.first_attempt_at is not null and d.state in ('pending','failed','sending') then
    if d.state='sending' and d.last_attempt_at>clock_timestamp()-interval '2 minutes' then return null; end if;
    update public.cohort_delivery set state='needs_review',detail='Reminder expired after an uncertain attempt; check provider before resolving' where id=p_id;
    return null;
  end if;
  if d.kind='digest' and d.first_attempt_at is null and exists(
    select 1 from public.cohort_delivery prior where prior.kind='digest' and prior.cohort_id=d.cohort_id and lower(prior.recipient_email)=lower(d.recipient_email) and prior.id<>d.id
      and prior.first_attempt_at is not null and prior.state in ('failed','sending','needs_review')
  ) then
    update public.cohort_delivery set detail='An earlier digest needs provider confirmation first' where id=p_id;
    return null;
  end if;
  if d.kind in ('announcement','digest') and d.state='pending' and d.first_attempt_at is null then
    if (d.expires_at is not null and d.expires_at<=clock_timestamp()) or
      not exists(select 1 from public.cohorts where id=d.cohort_id and (d.kind<>'digest' or status='active')) or
      not (exists(select 1 from public.mentor where cohort_id=d.cohort_id and normalized_email=lower(btrim(d.recipient_email)) and membership_status='active') or
           exists(select 1 from public.mentees where cohort_id=d.cohort_id and normalized_email=lower(btrim(d.recipient_email)) and membership_status='active')) then
      update public.cohort_delivery set state='superseded',detail='Expired or recipient no longer eligible' where id=p_id;
      return null;
    end if;
  end if;
  return public.ascenso_claim_delivery_v2(p_id,p_message);
end $$;

create or replace function public.ascenso_resolve_delivery(p_id uuid,p_actor uuid,p_accepted boolean,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare d public.cohort_delivery;
begin
  select * into strict d from public.cohort_delivery where id=p_id for update;
  perform public.ascenso_resolve_delivery_v2(p_id,p_actor,p_accepted,p_reason);
  if p_accepted and d.kind='digest' then
    update public.email_log set kind='digest' where cohort_id=d.cohort_id and ref_id=d.source_id and recipient_email=d.recipient_email and kind='operator_confirmed';
  end if;
end $$;

drop function public.ascenso_configure_cohort(uuid,uuid,text,text,date,text,text,text);
create function public.ascenso_configure_cohort(p_id uuid,p_actor uuid,p_name text,p_org text,p_orientation date,p_status text,p_expected text,p_reason text,p_organization uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare prior public.cohorts; c uuid:=coalesce(p_id,gen_random_uuid());
begin
  if p_id is null then
    if not exists(select 1 from public.admin_users where id=p_actor and role='super' and disabled_at is null) then raise exception 'Not found' using errcode='42501'; end if;
    if p_status<>'setup' then raise exception 'New cohorts begin in setup'; end if;
    insert into public.cohorts(id,name,org,status,organization_id) values(c,p_name,p_org,'setup',p_organization);
  else
    perform public.ascenso_assert_admin(p_actor,c);
    if p_organization is not null then raise exception 'Existing organization ownership is immutable'; end if;
  end if;
  select * into strict prior from public.cohorts where id=c for update;
  if p_id is not null and prior.status is distinct from p_expected then raise exception 'Cohort changed; refresh' using errcode='23514'; end if;
  if length(btrim(p_name)) not between 1 and 200 or length(btrim(p_org)) not between 1 and 200 or length(btrim(p_reason))<3 then raise exception 'Name, organization and reason required'; end if;
  if p_status<>prior.status and not (
    (prior.status='setup' and p_status='applications_open') or
    (prior.status='applications_open' and p_status='matching') or
    (prior.status='matching' and p_status in ('applications_open','active')) or
    (prior.status='active' and p_status='closed')
  ) then raise exception 'Unsupported lifecycle transition' using errcode='23514'; end if;
  if p_status='closed' and prior.status<>'closed' then
    if exists(select 1 from public.cohort_matches where cohort_id=c and status in ('proposed','board_approved','active')) then
      raise exception 'End active matches and remove pending selections before closeout' using errcode='23514';
    end if;
    if exists(select 1 from public.sessions s join public.mentor m on m.id=s.mentor_id where m.cohort_id=c and
      ((s.status='scheduled' and s.scheduled_at>clock_timestamp()) or s.calendar_cleanup_pending)) then
      raise exception 'Cancel future sessions and resolve calendar cleanup before closeout' using errcode='23514';
    end if;
    if exists(select 1 from public.cohort_delivery where cohort_id=c and state in ('sending','failed','needs_review')) then
      raise exception 'Resolve uncertain email before closeout' using errcode='23514';
    end if;
    update public.cohort_delivery set state='superseded',detail='Cohort closed before send' where cohort_id=c and state='pending';
  end if;
  update public.cohorts set name=btrim(p_name),org=btrim(p_org),status=p_status,
    config=jsonb_set(config,'{orientation_date}',coalesce(to_jsonb(p_orientation::text),'null'::jsonb)) where id=c;
  insert into public.cohort_operation_events(cohort_id,actor_id,target_id,action,reason,changes)
    values(c,p_actor,c,case when p_id is null then 'cohort_created' else 'cohort_configured' end,p_reason,
      jsonb_build_object('from',prior.status,'to',p_status,'name',p_name,'org',p_org,'orientation_date',p_orientation));
  return c;
end $$;

do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'ascenso_%' loop
    execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
