-- Incoming opportunities may be unassigned until a human reviews them. Do not invent an owner/service.
-- Filename matches the migration API's assigned ledger version.
alter table public.inquiries alter column primary_service_id drop not null;
alter table public.inquiries alter column owner_employee_id drop not null;
alter table public.inquiries add column intake_details jsonb not null default '{}'::jsonb
  check (jsonb_typeof(intake_details) = 'object');

create table public.inquiry_submissions (
  submission_key text primary key,
  payload_sha256 text not null,
  inquiry_id uuid not null unique references public.inquiries(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.tool_executions (
  id uuid primary key,
  tool_name text not null check (tool_name in ('search_company_knowledge','create_project_inquiry')),
  status text not null check (status in ('started','succeeded','failed')),
  error_code text,
  source_ids uuid[] not null default '{}',
  inquiry_id uuid references public.inquiries(id) on delete restrict,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((status = 'started' and finished_at is null) or (status <> 'started' and finished_at is not null))
);
create index tool_executions_inquiry_idx on public.tool_executions(inquiry_id);
create index tool_executions_created_idx on public.tool_executions(created_at desc);

create table public.call_evidence (
  execution_id uuid primary key,
  agent_id uuid not null,
  call_id uuid not null unique references public.calls(id) on delete restrict,
  provider_status text not null,
  status_rank integer not null,
  provider_updated_at timestamptz not null,
  payload_sha256 text not null,
  conversation_duration double precision not null check (conversation_duration >= 0),
  transcript text,
  summary text,
  extracted_data jsonb not null check (jsonb_typeof(extracted_data) = 'object'),
  contact_observations jsonb not null check (jsonb_typeof(contact_observations) = 'object'),
  updated_at timestamptz not null default now()
);
create index call_evidence_updated_idx on public.call_evidence(updated_at desc);

do $$ declare t text; begin
  foreach t in array array['inquiry_submissions','tool_executions','call_evidence'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant select, insert, update on public.%I to service_role',t);
    execute format('create policy active_admin_read on public.%I for select to authenticated using ((select asterbyte_private.is_active_admin()))',t);
  end loop;
end $$;

create function public.record_project_inquiry(submission text, payload_hash text, details jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare previous public.inquiry_submissions; account_id uuid := gen_random_uuid();
  person_id uuid := gen_random_uuid(); inquiry_uuid uuid := gen_random_uuid(); reference text;
begin
  if length(submission) not between 8 and 250 or payload_hash !~ '^[0-9a-f]{64}$'
    or details->>'confirmed' is distinct from 'yes'
    or length(btrim(details->>'customer_name')) < 2 or length(btrim(details->>'requirements')) < 15
    or (nullif(details->>'email','') is null and nullif(details->>'phone','') is null) then
    raise exception using errcode = '22023', message = 'Invalid or unconfirmed inquiry.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(submission,0));
  select * into previous from public.inquiry_submissions where submission_key = submission;
  if found then
    if previous.payload_sha256 <> payload_hash then
      raise exception using errcode = '23505', message = 'Submission key conflict.';
    end if;
    select code into reference from public.inquiries where id = previous.inquiry_id;
    return jsonb_build_object('inquiry_id',previous.inquiry_id,'reference',reference,'duplicate',true,'identity_status','unverified');
  end if;
  -- No identity lookup/merge or existing account attachment from model-provided personal details.
  insert into public.customer_accounts(id,code,display_name,industry,relationship_stage,timezone,notes)
    values(account_id,'ACC-'||account_id,coalesce(nullif(details->>'organization',''),details->>'customer_name'),
      'Not provided','prospect','Asia/Kolkata','Unverified caller-provided prospect intake; not a verified customer.');
  insert into public.contacts(id,code,full_name,email_normalized,phone_e164,preferred_language,contact_source)
    values(person_id,'CON-'||person_id,details->>'customer_name',lower(nullif(details->>'email','')),
      nullif(details->>'phone',''),'en','manual_entry');
  insert into public.account_contacts(customer_account_id,contact_id,relationship_role,membership_status)
    values(account_id,person_id,'requester','active');
  reference := 'INQ-'||inquiry_uuid;
  insert into public.inquiries(id,code,customer_account_id,contact_id,title,requirements,stage,next_action,intake_details)
    values(inquiry_uuid,reference,account_id,person_id,details->>'title',details->>'requirements','new',
      'Human review and contact verification required.',details||jsonb_build_object(
        'identity_status','unverified','confirmation_source','agent_reported_caller_confirmation',
        'received_at',now(),'call_link_status','unlinked'));
  insert into public.inquiry_submissions(submission_key,payload_sha256,inquiry_id)
    values(submission,payload_hash,inquiry_uuid);
  insert into public.activity_events(customer_account_id,contact_id,event_type,description,occurred_at,event_payload)
    values(account_id,person_id,'inquiry_created','Confirmed prospect inquiry recorded; identity unverified.',now(),
      jsonb_build_object('inquiry_id',inquiry_uuid));
  return jsonb_build_object('inquiry_id',inquiry_uuid,'reference',reference,'duplicate',false,'identity_status','unverified');
end $$;
revoke all on function public.record_project_inquiry(text,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_project_inquiry(text,text,jsonb) to service_role;

create function public.ingest_bolna_execution(evidence jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare existing public.call_evidence; call_uuid uuid; rank integer := (evidence->>'status_rank')::integer;
  execution uuid := (evidence->>'execution_id')::uuid; revised timestamptz := (evidence->>'provider_updated_at')::timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(execution::text,1));
  select * into existing from public.call_evidence where execution_id = execution for update;
  if found then
    if existing.agent_id <> (evidence->>'agent_id')::uuid then raise exception 'Execution agent mismatch.'; end if;
    if existing.payload_sha256 = evidence->>'payload_sha256' or existing.status_rank > rank
      or (existing.status_rank = rank and existing.provider_updated_at >= revised) then
      return jsonb_build_object('accepted',true,'changed',false);
    end if;
    call_uuid := existing.call_id;
  else
    call_uuid := gen_random_uuid();
    insert into public.calls(id,code,channel,direction,language,agent_display_name,intent,status,identity_status,
      provider,provider_execution_id,started_at,ended_at,summary,record_source)
    values(call_uuid,'CALL-'||execution,evidence->>'channel',evidence->>'direction','en','Anjali','general_inquiry',
      evidence->>'call_status','unverified','bolna',execution::text,(evidence->>'started_at')::timestamptz,
      (evidence->>'ended_at')::timestamptz,coalesce(evidence->>'summary',''),'provider');
  end if;
  update public.calls set status = evidence->>'call_status', ended_at = (evidence->>'ended_at')::timestamptz,
    summary = coalesce(evidence->>'summary','') where id = call_uuid;
  insert into public.call_evidence(execution_id,agent_id,call_id,provider_status,status_rank,provider_updated_at,
    payload_sha256,conversation_duration,transcript,summary,extracted_data,contact_observations)
  values(execution,(evidence->>'agent_id')::uuid,call_uuid,evidence->>'provider_status',rank,revised,
    evidence->>'payload_sha256',(evidence->>'conversation_duration')::double precision,evidence->>'transcript',
    evidence->>'summary',evidence->'extracted_data',evidence->'contact_observations')
  on conflict(execution_id) do update set provider_status=excluded.provider_status,status_rank=excluded.status_rank,
    provider_updated_at=excluded.provider_updated_at,payload_sha256=excluded.payload_sha256,
    conversation_duration=excluded.conversation_duration,transcript=excluded.transcript,summary=excluded.summary,
    extracted_data=excluded.extracted_data,contact_observations=excluded.contact_observations,updated_at=now();
  -- Status events are atomic with call/evidence state, not false customer/action claims.
  insert into public.activity_events(call_id,event_type,description,occurred_at,event_payload)
    values(call_uuid,'note_recorded','Bolna execution update received: '||(evidence->>'provider_status'),now(),
      jsonb_build_object('execution_id',execution,'provider_status',evidence->>'provider_status'));
  return jsonb_build_object('accepted',true,'changed',true);
end $$;
revoke all on function public.ingest_bolna_execution(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.ingest_bolna_execution(jsonb) to service_role;

comment on table public.call_evidence is 'Restricted provider evidence; extracted contact data never verifies identity or auto-creates leads. No recording fetch.';
comment on table public.tool_executions is 'Backend tool attempts only; no guessed provider execution linkage.';
