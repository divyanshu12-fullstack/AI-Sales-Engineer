-- Owner-run, transaction-local identity simulation; no Auth users are created and no data is changed.
-- This deliberately tests read visibility; mutation-denial cases run in the isolated PGlite suite.
begin;
do $$
declare table_name text; visible_rows bigint;
begin
  foreach table_name in array array[
    'agency_profile','services','employees','customer_accounts','contacts','account_contacts',
    'projects','project_services','project_contacts','calls','inquiries','support_tickets',
    'meetings','customer_notes','knowledge_documents','admin_profiles','knowledge_candidates',
    'activity_events','integration_jobs'
  ] loop
    begin
      execute 'set local role anon';
      execute format('select count(*) from public.%I', table_name) into visible_rows;
      raise exception 'Anonymous read unexpectedly permitted: %.', table_name;
    exception when insufficient_privilege then
      -- Subtransaction rollback also restores the original role.
      null;
    end;
    perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000456', true);
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000456","role":"authenticated"}', true);
    execute 'set local role authenticated';
    execute format('select count(*) from public.%I', table_name) into visible_rows;
    if visible_rows <> 0 then raise exception 'Non-admin read unexpectedly permitted: %.', table_name; end if;
    execute 'reset role';
  end loop;
end;
$$;
rollback;
