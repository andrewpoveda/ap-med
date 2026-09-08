-- READ ONLY. Run only with separately authorized database access. Keep results
-- private; IDs identify program records. No records are repaired by this file.

-- Duplicate identities within a role/cohort must be resolved deliberately.
select 'mentor' role,cohort_id,array_agg(id) record_ids,count(*) records
from public.mentor where normalized_email<>'' group by cohort_id,normalized_email having count(*)>1
union all
select 'mentee',cohort_id,array_agg(id),count(*) from public.mentees where cohort_id is not null
group by cohort_id,normalized_email having count(*)>1;

-- One mailbox with conflicting auth owners, or one auth owner with conflicting
-- mailbox identities. Do not choose one by recency.
with identities as (
  select id,normalized_email,auth_user_id from public.mentor
  union all select id,normalized_email,auth_user_id from public.mentees where cohort_id is not null
)
select array_agg(id) record_ids,count(distinct auth_user_id) owners
from identities where auth_user_id is not null group by normalized_email having count(distinct auth_user_id)>1;
with identities as (
  select id,normalized_email,auth_user_id from public.mentor
  union all select id,normalized_email,auth_user_id from public.mentees where cohort_id is not null
)
select array_agg(id) record_ids,count(distinct normalized_email) mailbox_identities
from identities where auth_user_id is not null group by auth_user_id having count(distinct normalized_email)>1;

-- Relationships that would fail the new composite foreign keys.
select id general_mentee_with_unexpected_auth from public.mentees where cohort_id is null and auth_user_id is not null;
select m.id match_id from public.cohort_matches m
left join public.mentor mr on mr.id=m.mentor_id and mr.cohort_id=m.cohort_id
left join public.mentees me on me.id=m.mentee_id and me.cohort_id=m.cohort_id
where mr.id is null or me.id is null;
select g.id goal_id from public.goals g left join public.cohort_matches m on m.id=g.match_id and m.cohort_id=g.cohort_id where m.id is null;
select l.id log_id from public.meeting_logs l left join public.cohort_matches m on m.id=l.match_id and m.cohort_id=l.cohort_id where m.id is null;
select r.id response_id from public.survey_responses r left join public.surveys s on s.id=r.survey_id and s.cohort_id=r.cohort_id where s.id is null;

-- Sessions lacking direct log evidence or a known activation window will stay
-- unattributed. This is a review inventory, not permission to guess a match.
select s.id session_id from public.sessions s
where not exists(select 1 from public.meeting_logs l where l.session_id=s.id)
and exists(select 1 from public.mentor m where m.id=s.mentor_id and m.cohort_id is not null)
and not exists(select 1 from public.cohort_matches m where m.mentor_id=s.mentor_id and m.mentee_id=s.mentee_id
  and m.activated_at is not null and m.activated_at<=s.scheduled_at and (m.ended_at is null or s.scheduled_at<=m.ended_at));
