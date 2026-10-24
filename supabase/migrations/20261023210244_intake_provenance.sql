-- Unknown preferences/direction/language must remain unknown, not invented English/inbound metadata.
-- Filename matches the migration API's assigned ledger version.
alter table public.contacts alter column preferred_language drop not null;
alter table public.contacts drop constraint contacts_contact_source_check;
alter table public.contacts add constraint contacts_contact_source_check check (
  contact_source in ('web_inquiry','referral','existing_project','manual_entry','voice_agent')
);
alter table public.calls alter column language drop not null;
alter table public.calls alter column direction drop not null;
create unique index knowledge_one_approved_version_idx on public.knowledge_documents(document_key,language)
  where approval_status = 'approved';
revoke update on public.inquiry_submissions from service_role;

create or replace function public.record_project_inquiry(submission text, payload_hash text, details jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare previous public.inquiry_submissions; account_id uuid := gen_random_uuid();
  person_id uuid := gen_random_uuid(); inquiry_uuid uuid := gen_random_uuid(); reference text;
begin
  if length(submission) not between 8 and 250 or payload_hash !~ '^[0-9a-f]{64}$'
    or details->>'confirmed' is distinct from 'yes'
    or coalesce(length(btrim(details->>'customer_name')),0) < 2
    or coalesce(length(btrim(details->>'requirements')),0) < 15
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
  insert into public.customer_accounts(id,code,display_name,industry,relationship_stage,timezone,notes)
    values(account_id,'ACC-'||account_id,coalesce(nullif(details->>'organization',''),details->>'customer_name'),
      'Not provided','prospect','Asia/Kolkata','Unverified caller-provided prospect intake; not a verified customer.');
  insert into public.contacts(id,code,full_name,email_normalized,phone_e164,preferred_language,contact_source)
    values(person_id,'CON-'||person_id,details->>'customer_name',lower(nullif(details->>'email','')),
      nullif(details->>'phone',''),null,'voice_agent');
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

create or replace function public.ingest_bolna_execution(evidence jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare existing public.call_evidence; call_uuid uuid; rank integer := (evidence->>'status_rank')::integer;
  execution uuid := (evidence->>'execution_id')::uuid; revised timestamptz := (evidence->>'provider_updated_at')::timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(execution::text,1));
  select * into existing from public.call_evidence where execution_id = execution for update;
  if found then
    if existing.agent_id <> (evidence->>'agent_id')::uuid then raise exception 'Execution agent mismatch.'; end if;
    if existing.payload_sha256 = evidence->>'payload_sha256' or existing.status_rank > rank
      or existing.provider_updated_at >= revised then
      return jsonb_build_object('accepted',true,'changed',false);
    end if;
    call_uuid := existing.call_id;
  else
    call_uuid := gen_random_uuid();
    insert into public.calls(id,code,channel,direction,language,agent_display_name,intent,status,identity_status,
      provider,provider_execution_id,started_at,ended_at,summary,record_source)
    values(call_uuid,'CALL-'||execution,evidence->>'channel',evidence->>'direction',evidence->>'language',
      (select agent_display_name from public.agency_profile where singleton_key='asterbyte'),'general_inquiry',
      evidence->>'call_status','unverified','bolna',execution::text,(evidence->>'started_at')::timestamptz,
      (evidence->>'ended_at')::timestamptz,coalesce(evidence->>'summary',''),'provider');
  end if;
  update public.calls set status = evidence->>'call_status', ended_at = (evidence->>'ended_at')::timestamptz,
    language = evidence->>'language', direction = evidence->>'direction',
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
  insert into public.activity_events(call_id,event_type,description,occurred_at,event_payload)
    values(call_uuid,'note_recorded','Bolna execution update received: '||(evidence->>'provider_status'),now(),
      jsonb_build_object('execution_id',execution,'provider_status',evidence->>'provider_status'));
  return jsonb_build_object('accepted',true,'changed',true);
end $$;
revoke all on function public.record_project_inquiry(text,text,jsonb),public.ingest_bolna_execution(jsonb)
  from public,anon,authenticated;
grant execute on function public.record_project_inquiry(text,text,jsonb),public.ingest_bolna_execution(jsonb) to service_role;
