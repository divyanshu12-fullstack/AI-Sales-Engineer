-- Customer confirmation atomically queues a server-side Calendar job. A Meet link is
-- persisted and emailed only after the Google Calendar API confirms both resources.
alter table public.meetings
  add column calendar_sync_status text not null default 'not_requested'
    check (calendar_sync_status in ('not_requested','pending','processing','succeeded','failed')),
  add column calendar_sync_attempts integer not null default 0 check (calendar_sync_attempts >= 0),
  add column calendar_sync_error_code text,
  add column calendar_event_url text,
  add column meet_url text,
  add column calendar_synced_at timestamptz,
  add column calendar_confirmation_sent_at timestamptz,
  add constraint meetings_calendar_event_url_check check (
    calendar_event_url is null or calendar_event_url ~ '^https://(www\.google\.com|calendar\.google\.com)/calendar/'
  ),
  add constraint meetings_meet_url_check check (
    meet_url is null or meet_url ~ '^https://meet\.google\.com/'
  ),
  add constraint meetings_calendar_sync_complete_check check (
    calendar_sync_status <> 'succeeded' or
    (provider = 'google_calendar' and provider_event_id is not null and
      calendar_event_url is not null and meet_url is not null and calendar_synced_at is not null)
  );

-- A customer-confirmed meeting has no provider event until Google returns one. Keep
-- the internal confirmation marker distinct from a real provider event identifier.
alter table public.meetings drop constraint meetings_check;
alter table public.meetings drop constraint meetings_check1;
alter table public.meetings add constraint meetings_provider_event_consistency_check check (
  (provider is null) = (provider_event_id is null) or
  (provider = 'customer_confirmation' and provider_event_id is null)
);
alter table public.meetings add constraint meetings_confirmed_provider_check check (
  status not in ('confirmed','completed') or
  (provider is not null and (provider_event_id is not null or provider = 'customer_confirmation'))
);

-- The previous provider_event_id was only an internal meeting UUID, not a Google event.
update public.meetings
set provider_event_id = null
where provider = 'customer_confirmation';

create index meeting_calendar_jobs_pending_idx
  on public.integration_jobs(available_at, id)
  where job_type = 'calendar_booking' and status in ('pending','failed','processing');

create or replace function public.confirm_meeting(token_hash text) returns jsonb
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
      provider_event_id = null, confirmed_at = now(), calendar_sync_status = 'pending',
      calendar_sync_error_code = null where id = m.id;
    insert into public.integration_jobs(job_type,dedupe_key,status,payload)
      values('calendar_booking','meeting:calendar:' || m.id,'pending',
        jsonb_build_object('meeting_id',m.id,'template','meeting_calendar_sync'))
      on conflict (dedupe_key) do nothing;
    insert into public.activity_events(customer_account_id,contact_id,event_type,description,occurred_at,event_payload)
      values(m.customer_account_id,m.contact_id,'meeting_confirmed',
        'Customer confirmed the consultation through the emailed link.',now(),
        jsonb_build_object('meeting_id',m.id,'reference',m.code));
  end if;
  return jsonb_build_object('status','confirmed','meeting_id',m.id,'reference',m.code,'title',m.title,
    'start_at',m.requested_start_at,'duration_minutes',m.duration_minutes,'timezone',m.timezone,
    'consultant_name',consultant_name,'already_confirmed',was_confirmed);
end $$;

create or replace function public.claim_meeting_email(job_id uuid default null)
returns setof public.integration_jobs language sql security invoker set search_path = '' as $$
  update public.integration_jobs j set status='processing',attempts=j.attempts+1,
    locked_until=now()+interval '60 seconds'
  where j.id=(select q.id from public.integration_jobs q where q.job_type='send_email'
    and q.payload->>'template' in ('meeting_confirmation','meeting_calendar_confirmation')
    and (job_id is null or q.id=job_id) and q.attempts<5 and q.available_at<=now()
    and (q.status in ('pending','failed') or (q.status='processing' and q.locked_until<now()))
    order by q.available_at,q.id for update skip locked limit 1)
  returning j.*;
$$;

create function public.claim_meeting_calendar(p_job_id uuid default null)
returns setof public.integration_jobs language plpgsql security invoker set search_path = '' as $$
declare claimed public.integration_jobs;
begin
  update public.integration_jobs j set status='processing', attempts=j.attempts+1,
    locked_until=now()+interval '90 seconds'
  where j.id=(select q.id from public.integration_jobs q where q.job_type='calendar_booking'
    and q.payload->>'template'='meeting_calendar_sync'
    and (p_job_id is null or q.id=p_job_id) and q.attempts<5 and q.available_at<=now()
    and (q.status in ('pending','failed') or (q.status='processing' and q.locked_until<now()))
    order by q.available_at,q.id for update skip locked limit 1)
  returning j.* into claimed;
  if not found then return; end if;
  update public.meetings set calendar_sync_status='processing',
    calendar_sync_attempts=claimed.attempts, calendar_sync_error_code=null
    where id=(claimed.payload->>'meeting_id')::uuid and status='confirmed';
  return next claimed;
end $$;

create function public.complete_meeting_calendar(
  p_job_id uuid, p_meeting_id uuid, p_event_id text, p_calendar_url text, p_meet_url text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.integration_jobs; m public.meetings;
begin
  if p_event_id is null or p_event_id !~ '^[a-v0-9]{5,255}$'
    or p_calendar_url is null
    or p_calendar_url !~ '^https://(www\.google\.com|calendar\.google\.com)/calendar/'
    or p_meet_url is null or p_meet_url !~ '^https://meet\.google\.com/' then
    raise exception using errcode='22023', message='Invalid Calendar event details.';
  end if;
  select * into j from public.integration_jobs where id=p_job_id and job_type='calendar_booking'
    and payload->>'meeting_id'=p_meeting_id::text for update;
  if not found or j.status not in ('processing','succeeded') then
    raise exception using errcode='22023', message='Calendar job is not claimable.';
  end if;
  select * into m from public.meetings where id=p_meeting_id for update;
  if not found or m.status <> 'confirmed' then
    raise exception using errcode='22023', message='Meeting is not confirmed.';
  end if;
  if m.calendar_sync_status='succeeded' and
    (m.provider_event_id <> p_event_id or m.meet_url <> p_meet_url or m.calendar_event_url <> p_calendar_url) then
    raise exception using errcode='23505', message='Calendar event conflicts with the stored meeting.';
  end if;
  update public.meetings set provider='google_calendar', provider_event_id=p_event_id,
    calendar_event_url=p_calendar_url, meet_url=p_meet_url, calendar_synced_at=coalesce(calendar_synced_at,now()),
    calendar_sync_status='succeeded', calendar_sync_error_code=null where id=p_meeting_id;
  update public.integration_jobs set status='succeeded',last_error_code=null,locked_until=null
    where id=p_job_id;
  insert into public.integration_jobs(job_type,dedupe_key,status,payload)
    values('send_email','meeting:calendar-confirmed:' || p_meeting_id,'pending',
      jsonb_build_object('meeting_id',p_meeting_id,'template','meeting_calendar_confirmation'))
    on conflict (dedupe_key) do nothing;
  return jsonb_build_object('status','succeeded','meeting_id',p_meeting_id);
end $$;

create function public.fail_meeting_calendar(
  p_job_id uuid, p_meeting_id uuid, p_error_code text, p_retryable boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.integration_jobs; retry boolean; delay_seconds integer;
begin
  if p_error_code !~ '^[A-Z0-9_]{1,80}$' then
    raise exception using errcode='22023', message='Invalid Calendar error code.';
  end if;
  select * into j from public.integration_jobs where id=p_job_id and job_type='calendar_booking'
    and payload->>'meeting_id'=p_meeting_id::text for update;
  if not found or j.status <> 'processing' then
    raise exception using errcode='22023', message='Calendar job is not processing.';
  end if;
  retry := p_retryable and j.attempts < 5;
  delay_seconds := least(900, (30 * power(2::numeric, greatest(j.attempts - 1, 0)))::integer);
  update public.integration_jobs set status='failed',last_error_code=p_error_code,
    attempts=case when retry then attempts else greatest(attempts,5) end,
    available_at=case when retry then now()+make_interval(secs=>delay_seconds) else available_at end,
    locked_until=null where id=p_job_id;
  update public.meetings set calendar_sync_status=case when retry then 'pending' else 'failed' end,
    calendar_sync_attempts=j.attempts, calendar_sync_error_code=p_error_code where id=p_meeting_id;
  return jsonb_build_object('status',case when retry then 'pending' else 'failed' end);
end $$;

revoke all on function public.confirm_meeting(text),public.claim_meeting_email(uuid),
  public.claim_meeting_calendar(uuid),public.complete_meeting_calendar(uuid,uuid,text,text,text),
  public.fail_meeting_calendar(uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.confirm_meeting(text),public.claim_meeting_email(uuid),
  public.claim_meeting_calendar(uuid),public.complete_meeting_calendar(uuid,uuid,text,text,text),
  public.fail_meeting_calendar(uuid,uuid,text,boolean) to service_role;

comment on column public.meetings.calendar_sync_status is
  'Calendar job state. Succeeded is set only after Google returns a Calendar event and Meet URL.';
comment on column public.meetings.meet_url is
  'Google Meet URL returned by Calendar API; null until conference creation is confirmed.';
