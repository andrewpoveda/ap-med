-- Required fresh-database bootstrap state only. This is not a production-data
-- export. It is safe to run repeatedly on a disposable or new database.

insert into public.app_settings (id, ascenso_visible)
values (1, false)
on conflict (id) do nothing;
