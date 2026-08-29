-- Exact grants on current application-owned objects for Supabase compatibility.
-- Run after the active application-schema migrations.
--
-- Supabase's owner-specific ALTER DEFAULT PRIVILEGES configuration is
-- deliberately excluded. New migrations should grant privileges explicitly.

grant usage on schema public, extensions to anon, authenticated, service_role;

grant all privileges on table
  public.admin_users,
  public.announcements,
  public.app_settings,
  public.cohort_applications,
  public.cohort_matches,
  public.cohorts,
  public.email_log,
  public.goals,
  public.meeting_logs,
  public.member_milestones,
  public.mentee_requests,
  public.mentor_availability,
  public.mentor_google_tokens,
  public.sessions,
  public.survey_responses,
  public.surveys
to anon, authenticated, service_role;

revoke all privileges on table public.email_budget_reservations
  from anon, authenticated;
grant all privileges on table public.email_budget_reservations
  to service_role;

revoke all privileges on table public.mentor, public.mentees
  from anon, authenticated;
grant all privileges on table public.mentor, public.mentees to service_role;

revoke all privileges on table public.waitlist from anon, authenticated;
grant all privileges on table public.waitlist to service_role;

grant execute on function public.app_settings_touch_updated_at()
  to anon, authenticated, service_role;

revoke execute on function public.reserve_email_budget(integer)
  from public, anon, authenticated;
grant execute on function public.reserve_email_budget(integer)
  to service_role;

revoke execute on function public.release_email_budget_slots(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.release_email_budget_slots(uuid, integer)
  to service_role;
