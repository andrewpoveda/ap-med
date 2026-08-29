-- Canonical, owner-independent catalog signature for AP MED application-owned
-- PostgreSQL objects. Run after all active migrations and optional Supabase
-- compatibility grants have been applied.

set search_path = public, extensions, pg_catalog;

with recursive
visible_columns as (
  select c.relname as table_name,
         row_number() over (partition by c.oid order by a.attnum) as visible_position,
         a.attname as column_name,
         format_type(a.atttypid, a.atttypmod) as data_type,
         a.attnotnull as not_null,
         replace(
           pg_get_expr(ad.adbin, ad.adrelid, true),
           'pg_catalog.gen_random_uuid()',
           'gen_random_uuid()'
         ) as default_expression
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid
  left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
  where n.nspname = 'public'
    and c.relkind = 'r'
    and a.attnum > 0
    and not a.attisdropped
),
entries(category, signature) as (
  select 'tables',
         concat_ws('|', c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relreplident)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'

  union all

  select 'columns.' || table_name,
         concat_ws('|', table_name, visible_position, column_name, data_type,
                   not_null, coalesce(default_expression, '<null>'))
  from visible_columns

  union all

  select 'constraints',
         concat_ws('|', c.relname, con.conname, con.contype,
                   pg_get_constraintdef(con.oid, true))
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'

  union all

  select 'indexes',
         concat_ws('|', t.relname, i.relname, pg_get_indexdef(i.oid))
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'

  union all

  select 'functions',
         concat_ws('|', p.proname, pg_get_function_identity_arguments(p.oid),
                   l.lanname, p.prosecdef, p.provolatile,
                   regexp_replace(pg_get_functiondef(p.oid), '\\s+', ' ', 'g'))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  where n.nspname = 'public'

  union all

  select 'triggers',
         concat_ws('|', c.relname, t.tgname, pg_get_triggerdef(t.oid, true))
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal

  union all

  select 'policies',
         concat_ws('|', tablename, policyname, permissive, cmd,
                   array_to_string(roles, ','), coalesce(qual, '<null>'),
                   coalesce(with_check, '<null>'))
  from pg_policies
  where schemaname = 'public'

  union all

  select 'table_grants',
         concat_ws('|', c.relname, pg_get_userbyid(a.grantee),
                   a.privilege_type, a.is_grantable)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where n.nspname = 'public'
    and c.relkind = 'r'
    and pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role')

  union all

  select 'schema_grants',
         concat_ws('|', n.nspname,
                   case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
                   a.privilege_type, a.is_grantable)
  from pg_namespace n
  cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
  where n.nspname in ('public', 'extensions')
    and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role'))

  union all

  select 'function_grants',
         concat_ws('|', p.oid::regprocedure::text,
                   case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
                   a.privilege_type, a.is_grantable)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where n.nspname = 'public'
    and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role'))

  union all

  select 'compatibility_roles',
         concat_ws('|', rolname, rolsuper, rolinherit, rolcreaterole,
                   rolcreatedb, rolcanlogin, rolreplication, rolbypassrls)
  from pg_roles
  where rolname in ('anon', 'authenticated', 'service_role')

  union all

  select 'required_extensions',
         concat_ws('|', e.extname, e.extversion, n.nspname)
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname in ('plpgsql', 'uuid-ossp')
)
select category,
       count(*) as entry_count,
       md5(string_agg(signature, E'\n' order by signature)) as signature_md5
from entries
group by category
order by category;
