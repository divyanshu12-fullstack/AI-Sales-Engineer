-- Developer-only, SECURITY INVOKER import entry point. Not an application RPC.
-- Filename version matches the applied Supabase migration ledger.
-- A single SELECT is one atomic PostgreSQL transaction, including constraint triggers.
create function asterbyte_private.import_initial_records(payload jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  names constant text[] := array[
    'agency_profile','services','employees','customer_accounts','contacts','account_contacts',
    'projects','project_services','project_contacts','calls','inquiries','support_tickets',
    'meetings','customer_notes','knowledge_documents','admin_profiles','knowledge_candidates',
    'activity_events','integration_jobs','knowledge_chunks'
  ];
  expected_counts constant integer[] := array[1,10,7,9,11,11,6,10,7,10,4,5,3,6,7,0,2,4,0,0];
  -- Reviewed column-name/type/nullability fingerprints, including the two nullable approval fields.
  column_contracts constant jsonb := '{
    "agency_profile":"b2f81782777ddbfa11efaad68c205a281a75d62f467934f6159bdeb1cbe8ed33",
    "services":"88c7609660124073c758380ecee1137fe50c57bb9caaa0d386ccb3ac47a6e6ee",
    "employees":"498d09c05dd32989924112ca75b35298c27e1b0796b2b2a6cfa56d1ea3cb9fcc",
    "customer_accounts":"9420df21ecc326bc1e129a09b45c25d74d59872542e06921b85294266526379d",
    "contacts":"7b3058a3bede87ca205ddc30c915784ace9f1ea0a1f80ffafcb720fbd1e39a40",
    "account_contacts":"7ba3c96a822e8b781b19c03b0b7eb0a37c4a60a62c2969549023afacb86a01e4",
    "projects":"d5d4fcdd8d3b4dcd4b70f1f58f4a7d252152dea9d9118ad2bb7fa798f922fb14",
    "project_services":"9323a580fb3162809cc25fb2ac981259fafe0038d30007676c2cfb7ac7a9065a",
    "project_contacts":"4d2a93e4a5640b1c816ecaf3bdbab24f87224a402c0b392d1ca48fc2277f3adb",
    "calls":"58c0d545ce024cffaaed7a5e45df9bf2c16b0e76cda18bdd195bd4dbcd940f99",
    "inquiries":"7238213191786559db66058afcfc267b5970ef72640cd443f13bc83c0b288279",
    "support_tickets":"9570da97271f0a4fab62a965f2964fc5cc1ff523c77022ca94b9cfde017ef0a9",
    "meetings":"a2e2ad74aabd775666867aa6c4fa92c6603def6f7d8c06083f2c81bdfc1042c6",
    "customer_notes":"03d784f149fa75875272f2c11abf270cfbb5d03ed356f3a0bb55eb6ec5f3520a",
    "knowledge_documents":"e588c191dfb239a667b83429991ef77380611d0a8ac978beb292d22a97ae8172",
    "admin_profiles":"473aafaec9a71dadd936df325f0d4dec41ec777dcd6262e7597d56bf58fa17fb",
    "knowledge_candidates":"ce9e1817e1febbb68b046035d612443a802b3cb0322597b852508dbb97a16747",
    "activity_events":"862932ba37918f66cecae70307083778a8063bcec7cbcfd4aaa737ad4d59f02a",
    "integration_jobs":"f75c482413be5fbcc9252408f3ac67e7c87ffb6be93f14b30b25921db6586093"
  }'::jsonb;
  index integer;
  table_name text;
  table_oid regclass;
  incoming jsonb;
  typed_incoming jsonb;
  collisions jsonb;
  columns_sql text;
  columns_expected text[];
  columns_received text[];
  collision_predicate text;
  differing_fields text[];
  inserted integer;
  skipped integer;
  batch_total integer;
  jobs_before bigint;
  actual_contract text;
  report jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or payload->>'format_version' is distinct from '1.0'
    or payload->>'import_batch' is distinct from 'asterbyte-initial-v1'
    or jsonb_typeof(payload->'tables') is distinct from 'object' then
    raise exception 'Invalid initial import envelope.';
  end if;
  if (select array_agg(key order by key) from jsonb_object_keys(payload->'tables') key)
    is distinct from (select array_agg(name order by name) from unnest(names) name) then
    raise exception 'Initial import must contain exactly the 20 reviewed table arrays.';
  end if;
  for index in 1..array_length(names, 1) loop
    if jsonb_typeof(payload->'tables'->names[index]) is distinct from 'array'
      or jsonb_array_length(payload->'tables'->names[index]) <> expected_counts[index] then
      raise exception 'Unexpected initial record count for %.', names[index];
    end if;
  end loop;

  perform pg_advisory_xact_lock(205031, 1);
  -- Prevent another writer from changing collision/trigger checks during this transaction.
  for index in 1..19 loop
    execute format('lock table public.%I in share row exclusive mode', names[index]);
    select encode(sha256(convert_to(string_agg(
      a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text,
      '|' order by a.attname collate "C"
    ), 'UTF8')), 'hex') into actual_contract
    from pg_attribute a where a.attrelid = format('public.%I', names[index])::regclass
      and a.attnum > 0 and not a.attisdropped;
    if actual_contract is distinct from column_contracts->>names[index] then
      raise exception 'Schema column/type/nullability drift: %.', names[index];
    end if;
  end loop;
  if exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
    where n.nspname = 'public' and c.relname = any(names) and not t.tgisinternal
      and not (pn.nspname = 'asterbyte_private' and (
        (t.tgname = 'asterbyte_touch_updated_at' and p.proname = 'touch_updated_at')
        or (t.tgname = 'asterbyte_source_project' and p.proname = 'validate_source_project')
        or (t.tgname = 'asterbyte_ticket_permission' and p.proname = 'validate_ticket_permission')
        or (t.tgname = 'asterbyte_activity_scope' and p.proname = 'validate_activity_scope')
        or (t.tgname = 'asterbyte_knowledge_review' and p.proname = 'validate_knowledge_review')
        or (t.tgname = 'asterbyte_commercial_relationship' and p.proname = 'validate_commercial_relationship')
      ))
  ) then
    raise exception 'Unreviewed trigger found: import stopped before insertion.';
  end if;
  select count(*) into jobs_before from public.integration_jobs;

  for index in 1..19 loop
    table_name := names[index];
    table_oid := format('public.%I', table_name)::regclass;
    inserted := 0;
    skipped := 0;
    select array_agg(a.attname::text order by a.attname),
      string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into columns_expected, columns_sql
    from pg_attribute a
    where a.attrelid = table_oid and a.attnum > 0 and not a.attisdropped
      and not (table_name = 'knowledge_documents' and a.attname in ('approved_by_admin_id', 'approved_at'));

    -- Compare every primary/unique business key, not just the supplied UUID.
    select string_agg('(' || group_columns.predicate || ')', ' or ')
    into collision_predicate
    from (
      select string_agg(format('t.%1$I = i.%1$I', a.attname), ' and ' order by k.ordinality) predicate
      from pg_constraint c
      cross join lateral unnest(c.conkey) with ordinality k(attnum, ordinality)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      where c.conrelid = table_oid and c.contype in ('p', 'u')
      group by c.oid
    ) group_columns;
    if collision_predicate is null then raise exception 'Missing collision constraints for %.', table_name; end if;

    for incoming in select value from jsonb_array_elements(payload->'tables'->table_name) loop
      if jsonb_typeof(incoming) is distinct from 'object'
        or incoming->>'import_batch' is distinct from 'asterbyte-initial-v1' then
        raise exception 'Invalid record envelope in %.', table_name;
      end if;
      select array_agg(key order by key) into columns_received from jsonb_object_keys(incoming) key;
      if columns_received is distinct from columns_expected then
        raise exception 'Column contract mismatch in %.', table_name;
      end if;
      if table_name = 'agency_profile' and incoming->>'name' is distinct from 'AsterByte Solutions' then
        raise exception 'Company name must be AsterByte Solutions.';
      elsif table_name = 'calls' and (
        incoming->>'record_source' is distinct from 'imported_history'
        or incoming->>'identity_status' is distinct from 'unverified'
        or incoming->>'provider' is not null or incoming->>'provider_execution_id' is not null
      ) then
        raise exception 'Imported call must remain unverified history without provider identifiers.';
      elsif table_name = 'meetings' and (
        incoming->>'status' is distinct from 'requested'
        or incoming->>'provider' is not null or incoming->>'provider_event_id' is not null
      ) then
        raise exception 'Imported meeting must remain an unconfirmed request.';
      elsif table_name = 'knowledge_documents' and incoming->>'approval_status' is distinct from 'draft' then
        raise exception 'Imported knowledge must remain under review.';
      elsif table_name = 'knowledge_candidates' and (
        incoming->>'review_status' is distinct from 'pending'
        or incoming->>'reviewed_by_admin_id' is not null or incoming->>'reviewed_at' is not null
      ) then
        raise exception 'Imported knowledge candidate must remain pending.';
      elsif table_name = 'activity_events' and incoming->>'event_type' is distinct from 'history_imported' then
        raise exception 'Imported activity cannot claim a live integration action.';
      end if;

      execute format('select to_jsonb(i) from jsonb_populate_record(null::public.%I, $1) i', table_name)
        into typed_incoming using incoming;
      execute format('select jsonb_agg(to_jsonb(t)) from public.%1$I t cross join jsonb_populate_record(null::public.%1$I, $1) i where %2$s', table_name, collision_predicate)
        into collisions using incoming;
      if collisions is null then
        execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1)', table_name, columns_sql)
          using incoming;
        inserted := inserted + 1;
      elsif jsonb_array_length(collisions) = 1 and collisions->0 = typed_incoming then
        skipped := skipped + 1;
      else
        select array_agg(key order by key) into differing_fields
        from jsonb_each(typed_incoming) field
        where (collisions->0)->field.key is distinct from field.value;
        -- Report identifiers and FIELD NAMES only, never customer content or credentials.
        raise exception 'Import conflict: table=%, id=%, differing_fields=%', table_name, incoming->>'id', differing_fields;
      end if;
    end loop;
    execute format('select count(*) from public.%I where import_batch = $1', table_name)
      into batch_total using 'asterbyte-initial-v1';
    if batch_total <> expected_counts[index] then
      raise exception 'Unexpected seed-batch total in %: expected %, found %.', table_name, expected_counts[index], batch_total;
    end if;
    report := report || jsonb_build_array(jsonb_build_object(
      'table', table_name, 'inserted', inserted, 'identical_skipped', skipped, 'batch_total', batch_total
    ));
  end loop;
  if (select count(*) from public.integration_jobs) <> jobs_before then
    raise exception 'Import changed the integration job count.';
  end if;
  return jsonb_build_object('import_batch', 'asterbyte-initial-v1', 'tables', report, 'total_records', 113,
    'deferred_tables', jsonb_build_array('knowledge_chunks'), 'new_integration_jobs', 0);
end;
$$;
revoke all on function asterbyte_private.import_initial_records(jsonb) from public, anon, authenticated, service_role;
comment on function asterbyte_private.import_initial_records(jsonb) is 'Owner-only transactional initial import. Complete typed equality or conflict; no updates, deletes, Auth identities or external actions.';
