begin;

drop policy if exists "Public can read mentors" on public.mentor;
drop policy if exists "allow insert for all" on public.mentor;
drop policy if exists "allow insert for all" on public.mentees;

revoke all privileges on table public.mentor from anon, authenticated;
revoke all privileges on table public.mentees from anon, authenticated;

commit;
