-- Pending customer reservations hold a slot for seven days. Once expired, they remain
-- visible as unconfirmed history but no longer block a future consultation slot.
create or replace function public.record_consultation(
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
    and (m.status = 'confirmed' or (m.status = 'pending_confirmation'
      and (m.confirmation_expires_at is null or m.confirmation_expires_at > now())))
    and tstzrange(m.requested_start_at, m.requested_start_at + make_interval(mins => m.duration_minutes), '[)')
      && tstzrange(start_at, start_at + interval '30 minutes', '[)')) then
    raise exception using errcode = '23P01', message = 'Consultation slot is no longer available.';
  end if;

  reference := 'MTG-' || upper(substr(replace(meeting_uuid::text,'-',''),1,10));
  insert into public.meetings(id,code,customer_account_id,contact_id,consultant_employee_id,inquiry_id,
    title,requested_start_at,duration_minutes,timezone,status,provider,provider_event_id,confirmation_expires_at)
    values(meeting_uuid,reference,i.customer_account_id,i.contact_id,consultant,i.id,
      'Consultation · ' || left(i.title,180),start_at,30,'Asia/Kolkata','pending_confirmation',null,null,
      now() + interval '7 days');
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
