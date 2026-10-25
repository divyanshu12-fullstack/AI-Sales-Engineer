-- Additive hackathon support workflow. Existing IDs, imports and approved knowledge stay intact.
-- Filename matches the applied remote migration ledger.
alter table public.customer_accounts add column support_code text unique
  check (support_code ~ '^[0-9]{4}$');
alter table public.projects add column support_code text unique check (support_code ~ '^[0-9]{4}$');
alter table public.projects add column support_demo_enabled boolean not null default false;
alter table public.contacts add column support_email_enabled boolean not null default false;
alter table public.support_tickets add column intake_identity_status text not null default 'historical_unverified'
  check (intake_identity_status in ('historical_unverified','demo_code_match','caller_number_match'));
alter table public.support_tickets add column resolution_version integer not null default 0;
alter table public.integration_jobs add column locked_until timestamptz;
alter table public.integration_jobs add column provider_message_id text;

-- Public-facing aliases only; these are NOT authentication credentials. Only opt-in demo projects qualify.
update public.customer_accounts set support_code = case code
  when 'clearcare' then '1001' when 'brightpath' then '1002' when 'swiftroute' then '1003'
  when 'nextstep' then '1004' when 'blueframe' then '1005' when 'codebridge' then '1006' end
  where import_batch='asterbyte-initial-v1' and code in ('clearcare','brightpath','swiftroute','nextstep','blueframe','codebridge');
update public.projects set support_code = case code
  when 'clinicflow' then '2001' when 'leadbridge' then '2002' when 'dispatchpro' then '2003'
  when 'formpilot' then '2004' when 'draftly' then '2005' when 'repolens' then '2006' end,
  support_demo_enabled=true where import_batch='asterbyte-initial-v1'
  and code in ('clinicflow','leadbridge','dispatchpro','formpilot','draftly','repolens');

create table public.support_access_grants (
  token_sha256 text primary key check (token_sha256 ~ '^[0-9a-f]{64}$'),
  project_id uuid not null,
  customer_account_id uuid not null,
  contact_id uuid not null,
  identity_status text not null check (identity_status in ('demo_code_match','caller_number_match')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '20 minutes',
  foreign key (project_id,customer_account_id) references public.projects(id,customer_account_id),
  foreign key (customer_account_id,contact_id) references public.account_contacts(customer_account_id,contact_id)
);
create table public.support_submissions (
  submission_key text primary key,
  payload_sha256 text not null,
  ticket_id uuid not null unique references public.support_tickets(id),
  created_at timestamptz not null default now()
);
alter table public.support_access_grants enable row level security;
alter table public.support_submissions enable row level security;
revoke all on public.support_access_grants,public.support_submissions from public,anon,authenticated,service_role;
grant select,insert,update on public.support_access_grants,public.support_submissions to service_role;
alter table public.tool_executions drop constraint tool_executions_tool_name_check;
alter table public.tool_executions add constraint tool_executions_tool_name_check check
  (tool_name in ('search_company_knowledge','create_project_inquiry','lookup_support_project','create_support_ticket'));
alter table public.tool_executions add column ticket_id uuid references public.support_tickets(id);
create index tool_executions_ticket_idx on public.tool_executions(ticket_id) where ticket_id is not null;
create index support_tickets_reported_idx on public.support_tickets(reported_at desc);
create index support_grants_expiry_idx on public.support_access_grants(expires_at);
create index support_mail_pending_idx on public.integration_jobs(available_at)
  where job_type='send_email' and status in ('pending','failed','processing');

create view public.support_ticket_dashboard with (security_invoker=true) as
select t.id,t.code,t.title,t.description,t.priority,t.status,t.reported_at,t.resolution_summary,t.resolved_at,
  t.intake_identity_status,t.import_batch,
  jsonb_build_object('name',p.name,'support_code',p.support_code) as projects,
  jsonb_build_object('display_name',a.display_name,'support_code',a.support_code) as customer_accounts,
  jsonb_build_object('full_name',c.full_name,'email_normalized',c.email_normalized,'support_email_enabled',c.support_email_enabled) as contacts,
  jsonb_build_object('full_name',e.full_name) as employees
from public.support_tickets t join public.projects p on p.id=t.project_id
join public.customer_accounts a on a.id=t.customer_account_id
join public.contacts c on c.id=t.reporter_contact_id join public.employees e on e.id=t.assigned_employee_id;
revoke all on public.support_ticket_dashboard from public,anon,authenticated,service_role;
grant select on public.support_ticket_dashboard to service_role;

create function public.lookup_demo_support(project_code text, customer_code text, caller_phone text, token_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.projects; a public.customer_accounts; person uuid; mode text;
begin
  if project_code !~ '^[0-9]{4}$' or token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023', message='Invalid support lookup.';
  end if;
  -- Non-enumerating response: no project/customer/contact information before a scoped match.
  select * into p from public.projects where support_code=project_code and support_demo_enabled and support_status='active';
  if not found then return jsonb_build_object('status','customer_code_required'); end if;
  select * into a from public.customer_accounts where id=p.customer_account_id;
  if nullif(caller_phone,'') is not null then
    select pc.contact_id into person from public.project_contacts pc
      join public.account_contacts ac on ac.customer_account_id=pc.customer_account_id and ac.contact_id=pc.contact_id
      join public.contacts c on c.id=pc.contact_id
      where pc.project_id=p.id and pc.access_status='active' and pc.access_role in ('project_owner','support_contact')
      and ac.membership_status='active' and c.phone_e164=caller_phone order by pc.contact_id limit 1;
    if person is not null then mode := 'caller_number_match'; end if;
  end if;
  if person is null then
    if nullif(customer_code,'') is null or a.support_code is distinct from customer_code then
      return jsonb_build_object('status','customer_code_required');
    end if;
    select pc.contact_id into person from public.project_contacts pc
      join public.account_contacts ac on ac.customer_account_id=pc.customer_account_id and ac.contact_id=pc.contact_id
      where pc.project_id=p.id and pc.access_status='active' and pc.access_role in ('project_owner','support_contact')
      and ac.membership_status='active'
      order by (pc.access_role='project_owner') desc,pc.contact_id limit 1;
    mode := 'demo_code_match';
  end if;
  if person is null then return jsonb_build_object('status','customer_code_required'); end if;
  insert into public.support_access_grants(token_sha256,project_id,customer_account_id,contact_id,identity_status)
    values(token_hash,p.id,a.id,person,mode);
  return jsonb_build_object('status','matched','project_name',p.name,'project_code',p.support_code,
    'identity_status',mode,'scope','demo_support_intake_only');
end $$;

create function public.record_support_ticket(submission text, payload_hash text, grant_hash text, details jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.support_access_grants; p public.projects; previous public.support_submissions;
  ticket uuid := gen_random_uuid(); reference text; existing_code text;
begin
  if length(submission) not between 8 and 250 or payload_hash !~ '^[0-9a-f]{64}$'
    or details->>'confirmed' is distinct from 'yes' or coalesce(length(btrim(details->>'description')),0)<10
    or coalesce(length(btrim(details->>'title')),0)<3 then
    raise exception using errcode='22023',message='Invalid or unconfirmed support request.';
  end if;
  select * into g from public.support_access_grants where token_sha256=grant_hash;
  if not found then raise exception using errcode='42501',message='Support lookup required.'; end if;
  select * into p from public.projects where id=g.project_id and support_demo_enabled and support_status='active';
  if not found or not exists(select 1 from public.project_contacts pc join public.account_contacts ac
    on ac.customer_account_id=pc.customer_account_id and ac.contact_id=pc.contact_id
    where pc.project_id=g.project_id and pc.contact_id=g.contact_id and pc.access_status='active'
    and pc.access_role in ('project_owner','support_contact') and ac.membership_status='active') then
    raise exception using errcode='42501',message='Support access is no longer available.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(submission,2));
  select * into previous from public.support_submissions where submission_key=submission;
  if found then
    if previous.payload_sha256<>payload_hash or not exists(select 1 from public.support_tickets t
      where t.id=previous.ticket_id and t.project_id=g.project_id and t.reporter_contact_id=g.contact_id) then
      raise exception using errcode='23505',message='Support submission conflict.';
    end if;
    select code into existing_code from public.support_tickets where id=previous.ticket_id;
    return jsonb_build_object('ticket_id',previous.ticket_id,'reference',existing_code,'duplicate',true);
  end if;
  if g.expires_at<=now() then raise exception using errcode='42501',message='Support lookup expired.'; end if;
  reference := 'SUP-'||upper(substr(replace(ticket::text,'-',''),1,10));
  insert into public.support_tickets(id,code,project_id,customer_account_id,reporter_contact_id,assigned_employee_id,
    title,description,priority,status,issue_kind,coverage_assessment,reported_at,intake_identity_status)
    values(ticket,reference,p.id,g.customer_account_id,g.contact_id,p.lead_employee_id,
      details->>'title',details->>'description',coalesce(details->>'priority','P3'),'open',
      coalesce(details->>'issue_kind','suspected_bug'),'pending',now(),g.identity_status);
  insert into public.support_submissions values(submission,payload_hash,ticket,now());
  insert into public.integration_jobs(job_type,dedupe_key,status,payload)
    values('send_email','support:ack:'||ticket,'pending',jsonb_build_object('ticket_id',ticket,'template','support_acknowledgement'));
  insert into public.activity_events(customer_account_id,contact_id,event_type,description,occurred_at,event_payload)
    values(g.customer_account_id,g.contact_id,'ticket_created','Support request recorded for the owning engineer.',now(),
      jsonb_build_object('ticket_id',ticket,'identity_status',g.identity_status));
  return jsonb_build_object('ticket_id',ticket,'reference',reference,'duplicate',false);
end $$;

create function public.update_support_ticket(ticket uuid, actor uuid, new_status text, resolution text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.support_tickets;
begin
  if not exists(select 1 from public.admin_profiles where id=actor and is_active and role='admin') then
    raise exception using errcode='42501',message='Active administrator required.';
  end if;
  if new_status not in ('open','triaged','in_progress','waiting_customer','waiting_provider','resolved','closed')
    or (new_status in ('resolved','closed') and coalesce(length(btrim(resolution)),0)<5) then
    raise exception using errcode='22023',message='A resolution is required before resolving a ticket.';
  end if;
  select * into strict t from public.support_tickets where id=ticket for update;
  if t.status=new_status and coalesce(t.resolution_summary,'')=coalesce(nullif(resolution,''),'') then
    return jsonb_build_object('ticket_id',ticket,'changed',false);
  end if;
  update public.support_tickets set status=new_status,
    resolution_summary=case when new_status in ('resolved','closed') then btrim(resolution) else null end,
    resolved_at=case when new_status in ('resolved','closed') then coalesce(t.resolved_at,now()) else null end,
    resolution_version=t.resolution_version+case when new_status='resolved' then 1 else 0 end
    where id=ticket;
  -- Historical seed tickets are visible/manageable but do not emit unsolicited provider mail.
  if new_status='resolved' and t.import_batch is null then
    insert into public.integration_jobs(job_type,dedupe_key,status,payload) values('send_email',
      'support:resolved:'||ticket||':'||(t.resolution_version+1),'pending',
      jsonb_build_object('ticket_id',ticket,'template','support_resolution','resolution',btrim(resolution)))
      on conflict(dedupe_key) do nothing;
  end if;
  insert into public.activity_events(customer_account_id,contact_id,actor_admin_id,event_type,description,occurred_at,event_payload)
    values(t.customer_account_id,t.reporter_contact_id,actor,'ticket_updated','Support ticket status changed to '||new_status,now(),
      jsonb_build_object('ticket_id',ticket));
  return jsonb_build_object('ticket_id',ticket,'changed',true);
end $$;

create function public.claim_support_email(job_id uuid default null)
returns setof public.integration_jobs language sql security invoker set search_path='' as $$
  update public.integration_jobs j set status='processing',attempts=j.attempts+1,locked_until=now()+interval '60 seconds'
  where j.id=(select q.id from public.integration_jobs q where q.job_type='send_email'
    and q.payload->>'template' in ('support_acknowledgement','support_resolution')
    and (job_id is null or q.id=job_id) and q.attempts<5 and q.available_at<=now()
    and (q.status in ('pending','failed') or (q.status='processing' and q.locked_until<now()))
    order by q.available_at,q.id for update skip locked limit 1)
  returning j.*;
$$;
revoke all on function public.lookup_demo_support(text,text,text,text),public.record_support_ticket(text,text,text,jsonb),
  public.update_support_ticket(uuid,uuid,text,text),public.claim_support_email(uuid) from public,anon,authenticated,service_role;
grant execute on function public.lookup_demo_support(text,text,text,text),public.record_support_ticket(text,text,text,jsonb),
  public.update_support_ticket(uuid,uuid,text,text),public.claim_support_email(uuid) to service_role;
comment on column public.projects.support_demo_enabled is 'Explicit opt-in for fictional-data intake by short codes. Not production identity verification.';
comment on column public.contacts.support_email_enabled is 'Enable only for a real inbox controlled by the demo owner; fictional seed recipients default off.';
