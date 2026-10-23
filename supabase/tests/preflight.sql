-- Read-only metadata. No customer rows, credentials, Auth identities, or server files.
select jsonb_build_object(
  'database', current_database(),
  'role', current_user,
  'postgres_version', current_setting('server_version'),
  'transaction_read_only', current_setting('transaction_read_only'),
  'public_tables', coalesce((
    select jsonb_agg(jsonb_build_object('table', c.relname, 'rls', c.relrowsecurity) order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  ), '[]'::jsonb),
  'private_namespace_exists', to_regnamespace('asterbyte_private') is not null,
  'migration_ledger_exists', to_regclass('supabase_migrations.schema_migrations') is not null,
  'installed_extensions', (select jsonb_agg(jsonb_build_object('name', extname, 'version', extversion) order by extname) from pg_extension),
  'public_grants', coalesce((select jsonb_agg(jsonb_build_object('table', table_name, 'grantee', grantee, 'privilege', privilege_type))
    from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role')), '[]'::jsonb),
  'public_policies', coalesce((select jsonb_agg(jsonb_build_object('table', tablename, 'name', policyname, 'roles', roles, 'operation', cmd, 'using', qual, 'check', with_check))
    from pg_policies where schemaname = 'public'), '[]'::jsonb),
  'default_grants', coalesce((select jsonb_agg(jsonb_build_object('owner', pg_get_userbyid(d.defaclrole), 'namespace', n.nspname, 'object_type', d.defaclobjtype, 'acl', d.defaclacl::text))
    from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace where n.nspname = 'public' or d.defaclnamespace = 0), '[]'::jsonb),
  'user_triggers', coalesce((select jsonb_agg(jsonb_build_object('table', c.relname, 'trigger', t.tgname, 'function_schema', pn.nspname, 'function', p.proname))
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
    where n.nspname = 'public' and not t.tgisinternal), '[]'::jsonb),
  'event_triggers', coalesce((select jsonb_agg(jsonb_build_object('name', e.evtname, 'enabled', e.evtenabled, 'function_schema', n.nspname, 'function', p.proname))
    from pg_event_trigger e join pg_proc p on p.oid = e.evtfoid join pg_namespace n on n.oid = p.pronamespace), '[]'::jsonb)
) as database_preflight;
