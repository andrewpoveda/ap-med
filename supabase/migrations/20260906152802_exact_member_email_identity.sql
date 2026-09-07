-- Additive: preserve original addresses, auth links, grants, and historical rows.
-- The trim set matches ECMAScript String.trim(), including legacy whitespace.
-- Non-unique indexes deliberately preserve duplicates; identity readers fail
-- closed on ambiguity instead of merging or assigning historical identities.
begin;

alter table public.mentor add column normalized_email text generated always as (
  lower(btrim(email, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))
) stored;
alter table public.mentees add column normalized_email text generated always as (
  lower(btrim(email, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))
) stored;

create index mentor_normalized_email_idx on public.mentor (normalized_email);
create index mentees_normalized_email_idx on public.mentees (normalized_email);

commit;
