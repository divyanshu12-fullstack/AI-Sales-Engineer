-- Read-only post-import evidence. Count this batch, never all unrelated table records.
with counts(table_name, expected, actual) as (
  select 'agency_profile', 1, count(*) from public.agency_profile where import_batch = 'asterbyte-initial-v1'
  union all select 'services', 10, count(*) from public.services where import_batch = 'asterbyte-initial-v1'
  union all select 'employees', 7, count(*) from public.employees where import_batch = 'asterbyte-initial-v1'
  union all select 'customer_accounts', 9, count(*) from public.customer_accounts where import_batch = 'asterbyte-initial-v1'
  union all select 'contacts', 11, count(*) from public.contacts where import_batch = 'asterbyte-initial-v1'
  union all select 'account_contacts', 11, count(*) from public.account_contacts where import_batch = 'asterbyte-initial-v1'
  union all select 'projects', 6, count(*) from public.projects where import_batch = 'asterbyte-initial-v1'
  union all select 'project_services', 10, count(*) from public.project_services where import_batch = 'asterbyte-initial-v1'
  union all select 'project_contacts', 7, count(*) from public.project_contacts where import_batch = 'asterbyte-initial-v1'
  union all select 'calls', 10, count(*) from public.calls where import_batch = 'asterbyte-initial-v1'
  union all select 'inquiries', 4, count(*) from public.inquiries where import_batch = 'asterbyte-initial-v1'
  union all select 'support_tickets', 5, count(*) from public.support_tickets where import_batch = 'asterbyte-initial-v1'
  union all select 'meetings', 3, count(*) from public.meetings where import_batch = 'asterbyte-initial-v1'
  union all select 'customer_notes', 6, count(*) from public.customer_notes where import_batch = 'asterbyte-initial-v1'
  union all select 'knowledge_documents', 7, count(*) from public.knowledge_documents where import_batch = 'asterbyte-initial-v1'
  union all select 'admin_profiles', 0, count(*) from public.admin_profiles where import_batch = 'asterbyte-initial-v1'
  union all select 'knowledge_candidates', 2, count(*) from public.knowledge_candidates where import_batch = 'asterbyte-initial-v1'
  union all select 'activity_events', 4, count(*) from public.activity_events where import_batch = 'asterbyte-initial-v1'
  union all select 'integration_jobs', 0, count(*) from public.integration_jobs where import_batch = 'asterbyte-initial-v1'
)
select jsonb_build_object(
  'counts', (select jsonb_agg(jsonb_build_object('table', table_name, 'expected', expected, 'actual', actual) order by table_name) from counts),
  'total_records', (select sum(actual) from counts),
  'count_mismatches', (select count(*) from counts where expected <> actual),
  'deferred_chunks_absent', to_regclass('public.knowledge_chunks') is null,
  'unvalidated_constraints', (select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public' and not c.convalidated),
  'rls_tables', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
  'anonymous_grants', (select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'),
  'browser_write_grants', (select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated' and privilege_type <> 'SELECT'),
  'admin_rows', (select count(*) from public.admin_profiles),
  'integration_jobs', (select count(*) from public.integration_jobs),
  'draft_documents', (select count(*) from public.knowledge_documents where import_batch = 'asterbyte-initial-v1' and approval_status = 'draft' and approved_by_admin_id is null and approved_at is null),
  'hash_mismatches', (select count(*) from public.knowledge_documents where content_sha256 <> encode(sha256(convert_to(content_markdown, 'UTF8')), 'hex')),
  'unsafe_imported_calls', (select count(*) from public.calls where import_batch = 'asterbyte-initial-v1' and (record_source <> 'imported_history' or identity_status <> 'unverified' or provider is not null or provider_execution_id is not null)),
  'confirmed_imported_meetings', (select count(*) from public.meetings where import_batch = 'asterbyte-initial-v1' and (status <> 'requested' or provider is not null or provider_event_id is not null)),
  'reviewed_imported_candidates', (select count(*) from public.knowledge_candidates where import_batch = 'asterbyte-initial-v1' and (review_status <> 'pending' or reviewed_by_admin_id is not null or reviewed_at is not null)),
  'unsupported_customer_stages', (select count(*) from public.customer_accounts a where (a.relationship_stage in ('customer', 'former_customer')) <> exists(select 1 from public.projects p where p.customer_account_id = a.id and p.contract_status = 'signed')),
  'tickets_without_current_support_grant', (select count(*) from public.support_tickets t where not exists (
    select 1 from public.project_contacts p join public.account_contacts m on m.customer_account_id = p.customer_account_id and m.contact_id = p.contact_id
    where p.project_id = t.project_id and p.customer_account_id = t.customer_account_id and p.contact_id = t.reporter_contact_id
      and p.access_status = 'active' and p.access_role in ('project_owner', 'support_contact') and m.membership_status = 'active'
  )),
  'source_project_mismatches', (select count(*) from (
    select n.id from public.customer_notes n join public.calls c on c.id = n.source_call_id where c.project_id is not null and c.project_id is distinct from n.project_id
    union all select t.id from public.support_tickets t join public.calls c on c.id = t.source_call_id where c.project_id is not null and c.project_id is distinct from t.project_id
  ) violations),
  'canonical_company_name', (select name = 'AsterByte Solutions' from public.agency_profile where singleton_key = 'asterbyte')
) as initial_database_verification;
