-- Consented new-customer consultation scheduling. Slots are reserved while the customer
-- confirms the emailed invitation; no external calendar provider is required for this step.
alter table public.meetings drop constraint meetings_status_check;
alter table public.meetings add constraint meetings_status_check check
  (status in ('requested','pending_confirmation','confirmed','cancelled','completed'));
alter table public.meetings add column confirmation_token_sha256 text unique
  check (confirmation_token_sha256 is null or confirmation_token_sha256 ~ '^[0-9a-f]{64}$');
alter table public.meetings add column confirmation_expires_at timestamptz;
alter table public.meetings add column confirmation_sent_at timestamptz;
alter table public.meetings add column confirmed_at timestamptz;

create index meetings_pending_confirmation_idx on public.meetings(confirmation_expires_at)
  where status = 'pending_confirmation';
create index meetings_active_consultant_slot_idx
  on public.meetings(consultant_employee_id, requested_start_at)
  where status in ('pending_confirmation','confirmed');

create table public.meeting_submissions (
  submission_key text primary key,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  meeting_id uuid not null unique references public.meetings(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.meeting_submissions enable row level security;
revoke all on public.meeting_submissions from public,anon,authenticated,service_role;
grant select,insert on public.meeting_submissions to service_role;

alter table public.tool_executions drop constraint tool_executions_tool_name_check;
alter table public.tool_executions add constraint tool_executions_tool_name_check check
  (tool_name in ('search_company_knowledge','create_project_inquiry','lookup_support_project',
    'create_support_ticket','check_consultation_availability','schedule_consultation'));
alter table public.tool_executions add column meeting_id uuid references public.meetings(id);
create index tool_executions_meeting_idx on public.tool_executions(meeting_id)
  where meeting_id is not null;

create function public.record_consultation(
  submission text,
  payload_hash text,
  inquiry_reference text,
  consultant uuid,
  start_at timestamptz,
  email text,
  details jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare i public.inquiries; person public.contacts; previous public.meeting_submissions;
  meeting_uuid uuid := gen_random_uuid(); reference text; consultant_name text;
  contact_email text; local_start timestamp;
begin
  if length(submission) not between 8 and 250 or payload_hash !~ '^[0-9a-f]{64}$'
    or details->>'confirmed' is distinct from 'yes'
    or inquiry_reference !~ '^INQ-[0-9a-f-]{36}$' then
    raise exception using errcode = '22023', message = 'Invalid or unconfirmed consultation request.';
  end if;
  select * into i from public.inquiries where code = inquiry_reference;
  if not found then raise exception using errcode = '22023', message = 'Project inquiry not found.'; end if;
  select * into person from public.contacts where id = i.contact_id;
  if not found then raise exception using errcode = '22023', message = 'Inquiry contact not found.'; end if;
  contact_email := person.email_normalized;
  if contact_email is null then
    if coalesce(length(btrim(email)),0) = 0 then
      return jsonb_build_object('status','email_required','inquiry_reference',inquiry_reference);
    end if;
    contact_email := lower(btrim(email));
    update public.contacts set email_normalized = contact_email, updated_at = now()
      where id = person.id;
  end if;
  select full_name into consultant_name from public.employees
    where id = consultant and is_active;
  if not found then
    raise exception using errcode = '22023', message = 'Consultant is not available.';
  end if;

  local_start := start_at at time zone 'Asia/Kolkata';
  if start_at < now() + interval '24 hours' or start_at > now() + interval '14 days'
    or extract(dow from local_start) = 0
    or local_start::time < time '11:00' or local_start::time > time '17:30'
    or extract(minute from local_start)::int not in (0,30)
    or extract(second from local_start) <> 0 then
    raise exception using errcode = '22023', message = 'Requested time is outside consultation hours.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(submission, 2));
  perform pg_advisory_xact_lock(hashtextextended(consultant::text || start_at::text, 3));
  select * into previous from public.meeting_submissions where submission_key = submission;
  if found then
    if previous.payload_sha256 <> payload_hash or not exists(select 1 from public.meetings m
      where m.id = previous.meeting_id and m.inquiry_id = i.id and m.consultant_employee_id = consultant) then
      raise exception using errcode = '23505', message = 'Consultation submission conflict.';
    end if;
    select code into reference from public.meetings where id = previous.meeting_id;
    return jsonb_build_object('status','scheduled','meeting_id',previous.meeting_id,'reference',reference,
      'start_at',start_at,'consultant_name',consultant_name,'duplicate',true);
  end if;

  if exists(select 1 from public.meetings m where m.consultant_employee_id = consultant
    and m.status in ('pending_confirmation','confirmed')
    and tstzrange(m.requested_start_at, m.requested_start_at + make_interval(mins => m.duration_minutes), '[)')
      && tstzrange(start_at, start_at + interval '30 minutes', '[)')) then
    raise exception using errcode = '23P01', message = 'Consultation slot is no longer available.';
  end if;

  reference := 'MTG-' || upper(substr(replace(meeting_uuid::text,'-',''),1,10));
  insert into public.meetings(id,code,customer_account_id,contact_id,consultant_employee_id,inquiry_id,
    title,requested_start_at,duration_minutes,timezone,status,provider,provider_event_id)
    values(meeting_uuid,reference,i.customer_account_id,i.contact_id,consultant,i.id,
      'Consultation · ' || left(i.title,180),start_at,30,'Asia/Kolkata','pending_confirmation',null,null);
  insert into public.meeting_submissions(submission_key,payload_sha256,meeting_id)
    values(submission,payload_hash,meeting_uuid);
  insert into public.integration_jobs(job_type,dedupe_key,status,payload)
    values('send_email','meeting:confirmation:' || meeting_uuid,'pending',
      jsonb_build_object('meeting_id',meeting_uuid,'template','meeting_confirmation'));
  insert into public.activity_events(customer_account_id,contact_id,event_type,description,occurred_at,event_payload)
    values(i.customer_account_id,i.contact_id,'meeting_requested',
      'Consultation slot reserved with ' || consultant_name || '; customer confirmation pending.',now(),
      jsonb_build_object('meeting_id',meeting_uuid,'inquiry_id',i.id,'reference',reference));
  return jsonb_build_object('status','scheduled','meeting_id',meeting_uuid,'reference',reference,
    'start_at',start_at,'consultant_name',consultant_name,'duplicate',false);
end $$;

create function public.get_meeting_confirmation(token_hash text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare m public.meetings; consultant_name text; result_status text;
begin
  if token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status','invalid'); end if;
  select * into m from public.meetings where confirmation_token_sha256 = token_hash;
  if not found then return jsonb_build_object('status','invalid'); end if;
  select full_name into consultant_name from public.employees where id = m.consultant_employee_id;
  result_status := case
    when m.status = 'confirmed' then 'confirmed'
    when m.status <> 'pending_confirmation' then 'unavailable'
    when m.confirmation_expires_at is null or m.confirmation_expires_at <= now() then 'expired'
    else 'pending' end;
  return jsonb_build_object('status',result_status,'reference',m.code,'title',m.title,
    'start_at',m.requested_start_at,'duration_minutes',m.duration_minutes,'timezone',m.timezone,
    'consultant_name',consultant_name,'expires_at',m.confirmation_expires_at);
end $$;

create function public.confirm_meeting(token_hash text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare m public.meetings; consultant_name text; was_confirmed boolean := false;
begin
  if token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status','invalid'); end if;
  select * into m from public.meetings where confirmation_token_sha256 = token_hash for update;
  if not found then return jsonb_build_object('status','invalid'); end if;
  select full_name into consultant_name from public.employees where id = m.consultant_employee_id;
  if m.status = 'confirmed' then
    was_confirmed := true;
  elsif m.status <> 'pending_confirmation' then
    return jsonb_build_object('status','unavailable','reference',m.code);
  elsif m.confirmation_expires_at is null or m.confirmation_expires_at <= now() then
    return jsonb_build_object('status','expired','reference',m.code);
  else
    update public.meetings set status = 'confirmed', provider = 'customer_confirmation',
      provider_event_id = m.id::text, confirmed_at = now() where id = m.id;
    insert into public.activity_events(customer_account_id,contact_id,event_type,description,occurred_at,event_payload)
      values(m.customer_account_id,m.contact_id,'meeting_confirmed',
        'Customer confirmed the consultation through the emailed link.',now(),
        jsonb_build_object('meeting_id',m.id,'reference',m.code));
    m.status := 'confirmed';
  end if;
  return jsonb_build_object('status','confirmed','reference',m.code,'title',m.title,
    'start_at',m.requested_start_at,'duration_minutes',m.duration_minutes,'timezone',m.timezone,
    'consultant_name',consultant_name,'already_confirmed',was_confirmed);
end $$;

create function public.claim_meeting_email(job_id uuid default null)
returns setof public.integration_jobs language sql security invoker set search_path = '' as $$
  update public.integration_jobs j set status='processing',attempts=j.attempts+1,
    locked_until=now()+interval '60 seconds'
  where j.id=(select q.id from public.integration_jobs q where q.job_type='send_email'
    and q.payload->>'template'='meeting_confirmation'
    and (job_id is null or q.id=job_id) and q.attempts<5 and q.available_at<=now()
    and (q.status in ('pending','failed') or (q.status='processing' and q.locked_until<now()))
    order by q.available_at,q.id for update skip locked limit 1)
  returning j.*;
$$;

revoke all on function public.record_consultation(text,text,text,uuid,timestamptz,text,jsonb),
  public.get_meeting_confirmation(text),public.confirm_meeting(text),public.claim_meeting_email(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.record_consultation(text,text,text,uuid,timestamptz,text,jsonb),
  public.get_meeting_confirmation(text),public.confirm_meeting(text),public.claim_meeting_email(uuid)
  to service_role;

comment on column public.meetings.confirmation_token_sha256 is
  'Hashed capability used only by the emailed customer-confirmation page; never exposed in dashboard records.';
comment on column public.meetings.provider is
  'Calendar provider when integrated; customer_confirmation records an internal email confirmation without an external event.';
