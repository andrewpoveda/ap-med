#!/bin/sh
# Synthetic SMS transaction checks in a disposable local PostgreSQL 17 cluster.
# No .env, hosted project, or SMS provider is used.
set -eu
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
pg_bin=${PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/ap-med-sms-atomic.XXXXXX")
mkdir -p "$work_dir/socket"
cleanup() {
  if [ -f "$work_dir/data/postmaster.pid" ]; then
    "$pg_bin/pg_ctl" -D "$work_dir/data" -m fast stop >/dev/null 2>&1 || true
  fi
  case "$work_dir" in "${TMPDIR:-/tmp}"/ap-med-sms-atomic.*) rm -rf -- "$work_dir" ;; esac
}
trap cleanup EXIT INT TERM
"$pg_bin/initdb" -D "$work_dir/data" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$pg_bin/pg_ctl" -D "$work_dir/data" -l "$work_dir/postgres.log" \
  -o "-k $work_dir/socket -p 55457 -c listen_addresses=''" -w start >/dev/null
psql_local() { "$pg_bin/psql" -X -q -v ON_ERROR_STOP=1 -h "$work_dir/socket" -p 55457 -d postgres "$@"; }
psql_local -f "$repo_root/database/baseline/supabase_compatibility_roles.sql"
for migration in "$repo_root"/supabase/migrations/*.sql; do psql_local -f "$migration"; done
psql_local -f "$repo_root/database/baseline/supabase_compatibility_grants.sql"
psql_local <<'SQL'
insert into public.cohorts(id,name,org,status,sms_enabled)
values ('11111111-1111-4111-8111-111111111111','SMS synthetic','Test','active',true);
insert into public.mentor(id,first_name,last_name,"current_role",institution,bio,current_stage,email,cohort_id)
values ('22222222-2222-4222-8222-222222222222','M','One','Doctor','Test','','','mentor@example.com','11111111-1111-4111-8111-111111111111');
insert into public.mentees(id,full_name,email,cohort_id)
values ('33333333-3333-4333-8333-333333333333','Mentee','mentee@example.com','11111111-1111-4111-8111-111111111111');
insert into public.cohort_matches(id,cohort_id,mentor_id,mentee_id,track,status)
values ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','test','active');
insert into public.sessions(id,mentor_id,mentee_id,scheduled_at,cohort_id,match_id)
values
  ('55555555-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',now()-interval '1 day',
    '11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444'),
  ('66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',now()+interval '19 hours',
    '11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',now()+interval '21 hours',
    '11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff','22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',now()+interval '27 hours',
    '11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444'),
  ('abababab-abab-4aba-8aba-abababababab','22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',now()+interval '1 day',
    '11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444');
insert into public.cohort_sms_contacts(id,cohort_id,person_id,phone_e164,consented_at,consent_source,consent_notice_version,consent_notice)
select '77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111',
  person_id,'+15555550111',now(),'test','v1','Synthetic consent notice'
from public.mentor where id='22222222-2222-4222-8222-222222222222';
insert into public.cohort_sms_contacts(id,cohort_id,person_id,phone_e164,consented_at,consent_source,consent_notice_version,consent_notice)
select '88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111',
  person_id,'+15555550112',now(),'test','v1','Synthetic consent notice'
from public.mentees where id='33333333-3333-4333-8333-333333333333';
insert into public.meeting_checkins(id,cohort_id,match_id,session_id,member_type,member_id)
values ('99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555',
  'mentee','33333333-3333-4333-8333-333333333333');
insert into public.sms_outbox(id,cohort_id,contact_id,session_id,checkin_id,kind,phone_e164,body,reply_code,reply_expires_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
  '88888888-8888-4888-8888-888888888888','55555555-5555-4555-8555-555555555555',
  '99999999-9999-4999-8999-999999999999','checkin','+15555550112',
  'How did it go? Reply ABCDEF123456','ABCDEF123456',now()+interval '2 days');
insert into public.sms_outbox(id,cohort_id,contact_id,session_id,kind,phone_e164,body)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111',
    '77777777-7777-4777-8777-777777777777','66666666-6666-4666-8666-666666666666',
    'reminder','+15555550111','Reminder'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',
    '88888888-8888-4888-8888-888888888888','66666666-6666-4666-8666-666666666666',
    'reminder','+15555550112','Reminder'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111',
    '77777777-7777-4777-8777-777777777777','dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'reminder','+15555550111','Reminder'),
  ('f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1','11111111-1111-4111-8111-111111111111',
    '88888888-8888-4888-8888-888888888888','ffffffff-ffff-4fff-8fff-ffffffffffff',
    'reminder','+15555550112','Reminder'),
  ('acacacac-acac-4cac-8cac-acacacacacac','11111111-1111-4111-8111-111111111111',
    '77777777-7777-4777-8777-777777777777','abababab-abab-4aba-8aba-abababababab',
    'reminder','+15555550111','Reminder');

do $$
declare result jsonb; sms_table text;
begin
  foreach sms_table in array array[
    'cohort_sms_contacts', 'sms_phone_suppressions', 'meeting_checkins',
    'sms_outbox', 'sms_inbound_receipts'
  ] loop
    assert (select relrowsecurity from pg_class
      where oid=('public.' || sms_table)::regclass);
    assert not has_table_privilege('anon', 'public.' || sms_table, 'SELECT');
    assert not has_table_privilege('anon', 'public.' || sms_table, 'INSERT');
    assert not has_table_privilege('authenticated', 'public.' || sms_table, 'SELECT');
    assert not has_table_privilege('authenticated', 'public.' || sms_table, 'INSERT');
    assert has_table_privilege('service_role', 'public.' || sms_table, 'SELECT');
    assert has_table_privilege('service_role', 'public.' || sms_table, 'INSERT');
  end loop;
  assert not has_function_privilege('anon','public.sms_process_inbound(text,text,text,text,text,text)','EXECUTE');
  assert has_function_privilege('service_role','public.sms_process_inbound(text,text,text,text,text,text)','EXECUTE');
  assert not has_function_privilege('anon','public.sms_claim_outbox(uuid,text)','EXECUTE');
  assert has_function_privilege('service_role','public.sms_claim_outbox(uuid,text)','EXECUTE');
  assert not has_function_privilege('anon','public.sms_check_claim_eligible(uuid)','EXECUTE');
  assert has_function_privilege('service_role','public.sms_check_claim_eligible(uuid)','EXECUTE');
  assert not has_function_privilege('anon','public.sms_reminder_window_guard()','EXECUTE');
  assert has_function_privilege('service_role','public.sms_reminder_window_guard()','EXECUTE');
  assert not has_function_privilege('anon','public.sms_finish_outbox(uuid,text,text,text,text)','EXECUTE');
  assert has_function_privilege('service_role','public.sms_finish_outbox(uuid,text,text,text,text)','EXECUTE');
  assert not has_function_privilege('anon','public.sms_reconcile_stale_outbox(timestamptz)','EXECUTE');
  assert has_function_privilege('service_role','public.sms_reconcile_stale_outbox(timestamptz)','EXECUTE');
  result := public.sms_claim_outbox('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','+15555559999');
  assert result->>'id' = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  assert result->>'contact_id' = '88888888-8888-4888-8888-888888888888';
  assert public.sms_check_claim_eligible('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert public.sms_claim_outbox('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','+15555559999') is null;
  result := public.sms_finish_outbox('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','accepted','twilio','SM-OUT-001',null);
  assert result->>'state' = 'accepted';
  assert public.sms_finish_outbox('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','accepted','twilio','SM-OUT-001',null)->>'state' = 'accepted';
  begin
    perform public.sms_finish_outbox('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','accepted','twilio','SM-OUT-DIFFERENT',null);
    raise exception 'Different provider result was accepted';
  exception when check_violation then null; end;
  assert public.sms_process_inbound('twilio','SM-IN-WRONG','+15555550111','+15555559999',
    'ABCDEF123456 Great meeting',null)->>'resolution' = 'unmatched';
  assert public.sms_process_inbound('twilio','SM-IN-001','+15555550112','+15555559999',
    'ABCDEF123456 Great meeting',null)->>'resolution' = 'responded';
  assert (select response_text from public.meeting_checkins where id='99999999-9999-4999-8999-999999999999') = 'Great meeting';
  assert (select response_channel from public.meeting_checkins where id='99999999-9999-4999-8999-999999999999') = 'sms';
  assert (select count(*) from public.meeting_logs) = 0;
  assert public.sms_process_inbound('twilio','SM-IN-001','+15555550112','+15555559999',
    'ABCDEF123456 Great meeting',null)->>'resolution' = 'duplicate';
  assert public.sms_process_inbound('twilio','SM-IN-002','+15555550112','+15555559999',
    'ABCDEF123456 Another answer',null)->>'resolution' = 'unmatched';

  result := public.sms_claim_outbox('acacacac-acac-4cac-8cac-acacacacacac','+15555559999');
  assert result->>'id' = 'acacacac-acac-4cac-8cac-acacacacacac';
  assert public.sms_finish_outbox('acacacac-acac-4cac-8cac-acacacacacac',
    'unknown','twilio','SM-UNKNOWN','Provider result uncertain')->>'state' = 'needs_review';
  assert (select provider_message_id from public.sms_outbox
    where id='acacacac-acac-4cac-8cac-acacacacacac') = 'SM-UNKNOWN';
  assert public.sms_claim_outbox('acacacac-acac-4cac-8cac-acacacacacac','+15555559999') is null;

  result := public.sms_claim_outbox('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','+15555559999');
  assert result->>'id' = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert public.sms_check_claim_eligible('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  update public.sms_outbox set last_attempt_at=now()-interval '20 minutes'
    where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert public.sms_reconcile_stale_outbox(now()-interval '15 minutes') = 1;
  assert (select state from public.sms_outbox where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')='needs_review';
  assert public.sms_claim_outbox('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','+15555559999') is null;

  update public.sessions set scheduled_at=now()+interval '2 days'
    where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  assert public.sms_claim_outbox('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','+15555559999') is null;
  assert (select state from public.sms_outbox where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')='pending';
  update public.sessions set scheduled_at=now()+interval '21 hours'
    where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  result := public.sms_claim_outbox('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','+15555559999');
  assert result->>'id' = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  update public.sessions set scheduled_at=now()+interval '2 days'
    where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  assert not public.sms_check_claim_eligible('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  update public.sessions set scheduled_at=now()+interval '21 hours'
    where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  result := public.sms_claim_outbox('f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1','+15555559999');
  assert result->>'id' = 'f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1';
  assert public.sms_check_claim_eligible('f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1');
  assert public.sms_process_inbound('twilio','SM-IN-STOP','+15555550112','+15555559999',
    'A custom opt-out word','STOP')->>'resolution' = 'stop';
  assert (select state from public.sms_outbox where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc') = 'superseded';
  assert not public.sms_check_claim_eligible('f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1');
  assert public.sms_finish_outbox('f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1',
    'skipped','twilio',null,'STOP before provider call')->>'state' = 'superseded';

  insert into public.sms_outbox(id,cohort_id,contact_id,session_id,kind,phone_e164,body)
  values ('51515151-5151-4515-8515-515151515151','11111111-1111-4111-8111-111111111111',
    '77777777-7777-4777-8777-777777777777','ffffffff-ffff-4fff-8fff-ffffffffffff',
    'reminder','+15555550111','Reminder');
  update public.sessions set scheduled_at=now()+interval '2 hours'
    where id='ffffffff-ffff-4fff-8fff-ffffffffffff';
  assert public.sms_claim_outbox('51515151-5151-4515-8515-515151515151','+15555559999') is null;
  assert (select state from public.sms_outbox where id='51515151-5151-4515-8515-515151515151')='superseded';

  insert into public.meeting_checkins(id,cohort_id,match_id,session_id,member_type,member_id)
  values ('52525252-5252-4525-8525-525252525252','11111111-1111-4111-8111-111111111111',
    '44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555',
    'mentor','22222222-2222-4222-8222-222222222222');
  insert into public.sms_outbox(id,cohort_id,contact_id,session_id,checkin_id,kind,phone_e164,body,reply_code,reply_expires_at)
  values ('53535353-5353-4535-8535-535353535353','11111111-1111-4111-8111-111111111111',
    '77777777-7777-4777-8777-777777777777','55555555-5555-4555-8555-555555555555',
    '52525252-5252-4525-8525-525252525252','checkin','+15555550111',
    'How did it go? Reply BBBBBBBBBBBB','BBBBBBBBBBBB',now()+interval '2 days');
  assert public.sms_claim_outbox('53535353-5353-4535-8535-535353535353','+15555559999') is not null;
  assert public.sms_finish_outbox('53535353-5353-4535-8535-535353535353',
    'accepted','twilio','SM-OUT-002',null)->>'state'='accepted';
  update public.cohorts set sms_enabled=false where id='11111111-1111-4111-8111-111111111111';
  assert public.sms_process_inbound('twilio','SM-IN-PAUSED','+15555550111','+15555559999',
    'BBBBBBBBBBBB Helpful meeting',null)->>'resolution'='responded';
  assert (select response_text from public.meeting_checkins where id='52525252-5252-4525-8525-525252525252')='Helpful meeting';
  assert not public.sms_check_claim_eligible('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  assert public.sms_finish_outbox('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'skipped','twilio',null,'Disabled before provider call')->>'state' = 'superseded';
  assert public.sms_process_inbound('twilio','SM-IN-START','+15555550112','+15555559999',
    'A custom opt-in word','START')->>'resolution' = 'start';
  assert (select resumed_at > opted_out_at from public.sms_phone_suppressions where phone_e164='+15555550112');
  assert (select c.consented_at < stop.opted_out_at from public.cohort_sms_contacts c
    join public.sms_phone_suppressions stop on stop.phone_e164=c.phone_e164
    where c.id='88888888-8888-4888-8888-888888888888');
  update public.cohorts set sms_enabled=true where id='11111111-1111-4111-8111-111111111111';
  insert into public.sessions(id,mentor_id,mentee_id,scheduled_at,cohort_id,match_id)
  values ('54545454-5454-4545-8545-545454545454','22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',now()-interval '2 days',
    '11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444');
  insert into public.meeting_checkins(id,cohort_id,match_id,session_id,member_type,member_id)
  values ('55555555-aaaa-4555-8555-555555555555','11111111-1111-4111-8111-111111111111',
    '44444444-4444-4444-8444-444444444444','54545454-5454-4545-8545-545454545454',
    'mentor','22222222-2222-4222-8222-222222222222');
  insert into public.sms_outbox(id,cohort_id,contact_id,session_id,checkin_id,kind,phone_e164,body,reply_code,reply_expires_at)
  values ('56565656-5656-4565-8565-565656565656','11111111-1111-4111-8111-111111111111',
    '77777777-7777-4777-8777-777777777777','54545454-5454-4545-8545-545454545454',
    '55555555-aaaa-4555-8555-555555555555','checkin','+15555550111',
    'How did it go? Reply CCCCCCCCCCCC','CCCCCCCCCCCC',now()+interval '2 days');
  assert public.sms_process_inbound('twilio','SM-IN-PENDING','+15555550111','+15555559999',
    'CCCCCCCCCCCC Premature reply',null)->>'resolution'='unmatched';
  assert public.sms_claim_outbox('56565656-5656-4565-8565-565656565656','+15555559999') is not null;
  assert public.sms_finish_outbox('56565656-5656-4565-8565-565656565656',
    'unknown','twilio',null,'Provider response unavailable')->>'state'='needs_review';
  assert public.sms_process_inbound('twilio','SM-IN-UNCERTAIN','+15555550111','+15555559999',
    'CCCCCCCCCCCC We talked about goals',null)->>'resolution'='responded';
  assert (select response_text from public.meeting_checkins where id='55555555-aaaa-4555-8555-555555555555')='We talked about goals';
  assert (select state from public.sms_outbox where id='56565656-5656-4565-8565-565656565656')='needs_review';
  assert public.sms_process_inbound('twilio','SM-IN-START-WITHOUT-STOP','+15555550111','+15555559999',
    'START',null)->>'resolution'='start';
  assert (select resumed_at > opted_out_at from public.sms_phone_suppressions
    where phone_e164='+15555550111');
  assert (select contact.consented_at < stop.opted_out_at
    from public.cohort_sms_contacts contact
    join public.sms_phone_suppressions stop on stop.phone_e164=contact.phone_e164
    where contact.id='77777777-7777-4777-8777-777777777777');
  assert not exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='sms_inbound_receipts' and column_name='body');
end $$;
SQL
echo 'SMS atomic RPC checks passed.'
