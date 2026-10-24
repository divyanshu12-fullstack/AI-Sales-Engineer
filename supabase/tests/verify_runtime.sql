-- Current integration metadata only: no caller content or credentials.
select jsonb_build_object(
  'approved_documents',(select count(*) from public.knowledge_documents where approval_status='approved'),
  'owner_authorizations',(select count(*) from asterbyte_private.owner_knowledge_approvals),
  'chunks',(select count(*) from public.knowledge_chunks),
  'wrong_dimensions',(select count(*) from public.knowledge_chunks where extensions.vector_dims(embedding)<>4096),
  'ineligible_chunks',(select count(*) from public.knowledge_chunks c join public.knowledge_documents d on d.id=c.document_id
    where d.approval_status<>'approved' or d.visibility<>'public' or d.content_sha256<>c.document_sha256),
  'public_tables_without_rls',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),
  'anonymous_table_grants',(select count(*) from information_schema.role_table_grants where table_schema='public' and grantee='anon'),
  'browser_write_grants',(select count(*) from information_schema.role_table_grants where table_schema='public' and grantee='authenticated' and privilege_type<>'SELECT'),
  'anonymous_search',has_function_privilege('anon','public.search_company_knowledge(extensions.vector)','execute'),
  'browser_inquiry',has_function_privilege('authenticated','public.record_project_inquiry(text,text,jsonb)','execute'),
  'anonymous_ingestion',has_function_privilege('anon','public.ingest_bolna_execution(jsonb)','execute'),
  'backend_owner_approval_insert',has_table_privilege('service_role','asterbyte_private.owner_knowledge_approvals','insert'),
  'unvalidated_constraints',(select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and not c.convalidated),
  'auth_users',(select count(*) from auth.users),
  'admin_profiles',(select count(*) from public.admin_profiles),
  'imported_calls',(select count(*) from public.calls where import_batch='asterbyte-initial-v1'),
  'imported_inquiries',(select count(*) from public.inquiries where import_batch='asterbyte-initial-v1'),
  'provider_calls',(select count(*) from public.calls where record_source='provider'),
  'runtime_inquiries',(select count(*) from public.inquiries where import_batch is null),
  'successful_backend_tool_checks',(select count(*) from public.tool_executions where status='succeeded')
) as runtime_verification;
