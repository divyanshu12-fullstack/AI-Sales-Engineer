-- AsterByte Solutions: reviewed relational foundation. No provider actions or seed data.
-- Filename version matches the applied Supabase migration ledger.
-- Run as a versioned migration in one transaction. Existing names deliberately cause a failure.
-- knowledge_chunks is deferred until an embedding model and its real dimension are selected.

create schema asterbyte_private;
revoke all on schema asterbyte_private from public, anon, authenticated, service_role;

create table public.agency_profile (
  id uuid primary key default gen_random_uuid(),
  singleton_key text not null unique check (singleton_key = 'asterbyte'),
  name text not null check (name = 'AsterByte Solutions'),
  founded_year integer not null check (founded_year between 1900 and 2100),
  founder_display_name text not null,
  profile_summary text not null,
  timezone text not null,
  default_language text not null check (default_language in ('en', 'hi')),
  agent_display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (btrim(code) <> ''),
  name text not null,
  description text not null,
  price_min_inr numeric(12,2) not null check (price_min_inr >= 0),
  price_max_inr numeric(12,2) not null check (price_max_inr >= price_min_inr),
  billing_unit text not null check (billing_unit in ('project', 'month', 'hour')),
  delivery_estimate text not null,
  is_active boolean not null default true,
  pricing_status text not null check (pricing_status in ('indicative', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (btrim(code) <> ''),
  full_name text not null,
  team text not null,
  role_title text not null,
  skills text[] not null,
  consultation_topics text[] not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text
);

create table public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (btrim(code) <> ''),
  display_name text not null,
  industry text not null,
  relationship_stage text not null check (relationship_stage in ('prospect', 'customer', 'former_customer')),
  timezone text not null,
  notes text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (btrim(code) <> ''),
  full_name text not null,
  email_normalized text check (email_normalized is null or (email_normalized = lower(btrim(email_normalized)) and email_normalized <> '')),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  preferred_language text not null check (preferred_language in ('en', 'hi')),
  contact_source text not null check (contact_source in ('web_inquiry', 'referral', 'existing_project', 'manual_entry')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text
);

create table public.account_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  relationship_role text not null check (relationship_role in ('owner', 'manager', 'staff', 'requester')),
  membership_status text not null check (membership_status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text,
  unique (customer_account_id, contact_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (btrim(code) <> ''),
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  name text not null,
  product_key text,
  summary text not null,
  status text not null check (status in ('active', 'delivered', 'on_hold', 'archived')),
  contract_status text not null check (contract_status in ('draft', 'signed')),
  contracted_on date,
  lead_employee_id uuid not null references public.employees(id) on delete restrict,
  agreed_budget_inr numeric(12,2) check (agreed_budget_inr is null or agreed_budget_inr >= 0),
  started_on date,
  delivered_on date,
  support_status text not null check (support_status in ('active', 'none')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text,
  unique (id, customer_account_id),
  check (contract_status <> 'signed' or contracted_on is not null),
  check (status <> 'delivered' or delivered_on is not null),
  check (contracted_on <= started_on),
  check (started_on <= delivered_on),
  check (contracted_on <= delivered_on)
);

create table public.project_services (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text,
  unique (project_id, service_id)
);

create table public.project_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  customer_account_id uuid not null,
  contact_id uuid not null,
  access_role text not null check (access_role in ('project_owner', 'support_contact', 'viewer')),
  access_status text not null check (access_status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text,
  unique (project_id, contact_id),
  foreign key (project_id, customer_account_id) references public.projects(id, customer_account_id) on delete restrict,
  foreign key (customer_account_id, contact_id) references public.account_contacts(customer_account_id, contact_id) on delete restrict
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (btrim(code) <> ''),
  customer_account_id uuid references public.customer_accounts(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete restrict,
  project_id uuid,
  channel text not null check (channel in ('browser', 'phone')),
  direction text not null check (direction in ('inbound', 'outbound')),
  language text not null check (language in ('en', 'hi')),
  agent_display_name text not null,
  intent text not null check (intent in ('new_project', 'product_support', 'general_inquiry')),
  status text not null check (status in ('started', 'completed', 'failed', 'cancelled')),
  identity_status text not null check (identity_status in ('unverified', 'verified')),
  provider text,
  provider_execution_id text,
  started_at timestamptz not null,
  ended_at timestamptz,
  summary text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text,
  record_source text not null check (record_source in ('imported_history', 'provider')),
  unique (id, customer_account_id, contact_id),
  unique (id, customer_account_id, contact_id, project_id),
  foreign key (customer_account_id, contact_id) references public.account_contacts(customer_account_id, contact_id) on delete restrict,
  foreign key (project_id, customer_account_id) references public.projects(id, customer_account_id) on delete restrict,
  check (customer_account_id is null or contact_id is not null),
  check (project_id is null or (customer_account_id is not null and contact_id is not null)),
  check (ended_at is null or ended_at >= started_at),
  check (status <> 'completed' or ended_at is not null),
  check ((provider is null) = (provider_execution_id is null)),
  check (record_source <> 'provider' or status <> 'completed' or (provider is not null and provider_execution_id is not null)),
  check (record_source <> 'imported_history' or (identity_status = 'unverified' and provider is null and provider_execution_id is null))
);

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (btrim(code) <> ''),
  customer_account_id uuid not null,
  contact_id uuid not null,
  primary_service_id uuid not null references public.services(id) on delete restrict,
  owner_employee_id uuid not null references public.employees(id) on delete restrict,
  source_call_id uuid,
  title text not null,
  requirements text not null,
  budget_min_inr numeric(12,2),
  budget_max_inr numeric(12,2),
  requested_launch_on date,
  stage text not null check (stage in ('new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost')),
  next_action text not null,
  next_follow_up_at timestamptz,
  converted_project_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text,
  unique (id, customer_account_id),
  foreign key (customer_account_id, contact_id) references public.account_contacts(customer_account_id, contact_id) on delete restrict,
  foreign key (source_call_id, customer_account_id, contact_id) references public.calls(id, customer_account_id, contact_id) on delete restrict,
  foreign key (converted_project_id, customer_account_id) references public.projects(id, customer_account_id) on delete restrict,
  check ((budget_min_inr is null and budget_max_inr is null) or (budget_min_inr is not null and budget_max_inr is not null and budget_min_inr >= 0 and budget_max_inr >= budget_min_inr)),
  check ((stage = 'won') = (converted_project_id is not null))
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (btrim(code) <> ''),
  project_id uuid not null,
  customer_account_id uuid not null,
  reporter_contact_id uuid not null,
  assigned_employee_id uuid not null references public.employees(id) on delete restrict,
  source_call_id uuid,
  title text not null,
  description text not null,
  priority text not null check (priority in ('P1', 'P2', 'P3', 'P4')),
  status text not null check (status in ('open', 'triaged', 'in_progress', 'waiting_customer', 'waiting_provider', 'resolved', 'closed')),
  issue_kind text not null check (issue_kind in ('suspected_bug', 'question', 'feature_request', 'security_incident')),
  coverage_assessment text not null check (coverage_assessment in ('pending', 'covered_bug', 'paid_change', 'not_applicable')),
  linked_guide_issue text,
  reported_at timestamptz not null,
  resolution_summary text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text,
  foreign key (project_id, customer_account_id) references public.projects(id, customer_account_id) on delete restrict,
  foreign key (customer_account_id, reporter_contact_id) references public.account_contacts(customer_account_id, contact_id) on delete restrict,
  foreign key (source_call_id, customer_account_id, reporter_contact_id) references public.calls(id, customer_account_id, contact_id) on delete restrict,
  check ((status in ('resolved', 'closed') and resolved_at is not null and nullif(btrim(resolution_summary), '') is not null) or (status not in ('resolved', 'closed') and resolved_at is null and resolution_summary is null)),
  check (resolved_at is null or resolved_at >= reported_at)
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (btrim(code) <> ''),
  customer_account_id uuid not null,
  contact_id uuid not null,
  consultant_employee_id uuid not null references public.employees(id) on delete restrict,
  inquiry_id uuid,
  project_id uuid,
  title text not null,
  requested_start_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  timezone text not null,
  status text not null check (status in ('requested', 'confirmed', 'cancelled', 'completed')),
  provider text,
  provider_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text,
  foreign key (customer_account_id, contact_id) references public.account_contacts(customer_account_id, contact_id) on delete restrict,
  foreign key (inquiry_id, customer_account_id) references public.inquiries(id, customer_account_id) on delete restrict,
  foreign key (project_id, customer_account_id) references public.projects(id, customer_account_id) on delete restrict,
  check ((provider is null) = (provider_event_id is null)),
  check (status not in ('confirmed', 'completed') or (provider is not null and provider_event_id is not null)),
  check (status <> 'requested' or (provider is null and provider_event_id is null))
);

create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null,
  contact_id uuid not null,
  project_id uuid,
  source_call_id uuid not null,
  note_kind text not null check (note_kind in ('requirement', 'preference', 'reported_issue', 'follow_up')),
  content text not null,
  verification_status text not null check (verification_status in ('unverified', 'human_reviewed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text,
  foreign key (customer_account_id, contact_id) references public.account_contacts(customer_account_id, contact_id) on delete restrict,
  foreign key (project_id, customer_account_id) references public.projects(id, customer_account_id) on delete restrict,
  foreign key (source_call_id, customer_account_id, contact_id) references public.calls(id, customer_account_id, contact_id) on delete restrict
);

create table public.admin_profiles (
  -- No generated default: this must be an already-existing Supabase Auth identity.
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null,
  role text not null check (role = 'admin'),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text
);

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  document_key text not null,
  version text not null,
  language text not null check (language in ('en', 'hi')),
  title text not null,
  source_path text not null,
  content_sha256 text not null,
  approval_status text not null check (approval_status in ('draft', 'approved', 'retired')),
  visibility text not null check (visibility in ('public', 'internal')),
  content_markdown text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text,
  approved_by_admin_id uuid references public.admin_profiles(id) on delete restrict,
  approved_at timestamptz,
  unique (document_key, version, language),
  check (content_sha256 = encode(sha256(convert_to(content_markdown, 'UTF8')), 'hex')),
  check ((approved_by_admin_id is null) = (approved_at is null)),
  check (approval_status <> 'approved' or (approved_by_admin_id is not null and approved_at is not null))
);

create table public.knowledge_candidates (
  id uuid primary key default gen_random_uuid(),
  source_call_id uuid not null,
  customer_account_id uuid not null,
  contact_id uuid not null,
  project_id uuid not null,
  suggested_document_key text not null,
  title text not null,
  proposed_text text not null,
  review_status text not null check (review_status in ('pending', 'approved', 'rejected')),
  reviewed_by_admin_id uuid references public.admin_profiles(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text,
  foreign key (source_call_id, customer_account_id, contact_id, project_id) references public.calls(id, customer_account_id, contact_id, project_id) on delete restrict,
  foreign key (customer_account_id, contact_id) references public.account_contacts(customer_account_id, contact_id) on delete restrict,
  foreign key (project_id, customer_account_id) references public.projects(id, customer_account_id) on delete restrict,
  check ((review_status = 'pending' and reviewed_by_admin_id is null and reviewed_at is null) or (review_status <> 'pending' and reviewed_by_admin_id is not null and reviewed_at is not null))
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid references public.customer_accounts(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete restrict,
  call_id uuid references public.calls(id) on delete restrict,
  actor_admin_id uuid references public.admin_profiles(id) on delete restrict,
  event_type text not null check (event_type in ('history_imported', 'inquiry_created', 'project_converted', 'ticket_created', 'ticket_updated', 'meeting_requested', 'meeting_confirmed', 'note_recorded', 'knowledge_reviewed')),
  description text not null,
  occurred_at timestamptz not null,
  event_payload jsonb not null check (jsonb_typeof(event_payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text,
  foreign key (customer_account_id, contact_id) references public.account_contacts(customer_account_id, contact_id) on delete restrict
);

create table public.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('post_call', 'send_email', 'calendar_booking')),
  dedupe_key text not null unique check (btrim(dedupe_key) <> ''),
  call_id uuid references public.calls(id) on delete restrict,
  status text not null check (status in ('pending', 'processing', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  last_error_code text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch text
);

-- Foreign-key leading columns and actual lookup paths; unique constraints already cover join pairs.
create index contacts_email_idx on public.contacts(email_normalized) where email_normalized is not null;
create index contacts_phone_idx on public.contacts(phone_e164) where phone_e164 is not null;
create index account_contacts_contact_idx on public.account_contacts(contact_id);
create index projects_account_idx on public.projects(customer_account_id);
create index projects_lead_idx on public.projects(lead_employee_id);
create index project_services_service_idx on public.project_services(service_id);
create index project_contacts_membership_idx on public.project_contacts(customer_account_id, contact_id);
create index project_contacts_project_scope_idx on public.project_contacts(project_id, customer_account_id);
create index project_contacts_contact_idx on public.project_contacts(contact_id);
create index calls_contact_history_idx on public.calls(contact_id, started_at desc);
create index calls_account_history_idx on public.calls(customer_account_id, started_at desc);
create index calls_membership_idx on public.calls(customer_account_id, contact_id);
create index calls_project_scope_idx on public.calls(project_id, customer_account_id);
create unique index calls_provider_execution_idx on public.calls(provider, provider_execution_id) where provider_execution_id is not null;
create index inquiries_membership_idx on public.inquiries(customer_account_id, contact_id);
create index inquiries_service_idx on public.inquiries(primary_service_id);
create index inquiries_owner_idx on public.inquiries(owner_employee_id);
create index inquiries_call_scope_idx on public.inquiries(source_call_id, customer_account_id, contact_id);
create index inquiries_conversion_idx on public.inquiries(converted_project_id, customer_account_id);
create index inquiries_follow_up_idx on public.inquiries(stage, next_follow_up_at);
create index tickets_project_scope_idx on public.support_tickets(project_id, customer_account_id);
create index tickets_reporter_idx on public.support_tickets(customer_account_id, reporter_contact_id);
create index tickets_assignee_idx on public.support_tickets(assigned_employee_id);
create index tickets_call_scope_idx on public.support_tickets(source_call_id, customer_account_id, reporter_contact_id);
create index tickets_project_status_idx on public.support_tickets(project_id, status);
create index tickets_priority_status_idx on public.support_tickets(priority, status);
create index meetings_membership_idx on public.meetings(customer_account_id, contact_id);
create index meetings_inquiry_scope_idx on public.meetings(inquiry_id, customer_account_id);
create index meetings_project_scope_idx on public.meetings(project_id, customer_account_id);
create index meetings_consultant_time_idx on public.meetings(consultant_employee_id, requested_start_at);
create unique index meetings_provider_event_idx on public.meetings(provider, provider_event_id) where provider_event_id is not null;
create index notes_account_history_idx on public.customer_notes(customer_account_id, created_at desc);
create index notes_membership_idx on public.customer_notes(customer_account_id, contact_id);
create index notes_project_scope_idx on public.customer_notes(project_id, customer_account_id);
create index notes_call_scope_idx on public.customer_notes(source_call_id, customer_account_id, contact_id);
create index documents_retrieval_catalog_idx on public.knowledge_documents(approval_status, visibility, language, document_key);
create index documents_approver_idx on public.knowledge_documents(approved_by_admin_id);
create index candidates_call_scope_idx on public.knowledge_candidates(source_call_id, customer_account_id, contact_id, project_id);
create index candidates_membership_idx on public.knowledge_candidates(customer_account_id, contact_id);
create index candidates_project_scope_idx on public.knowledge_candidates(project_id, customer_account_id);
create index candidates_reviewer_idx on public.knowledge_candidates(reviewed_by_admin_id);
create index candidates_review_idx on public.knowledge_candidates(review_status, created_at);
create index activity_membership_idx on public.activity_events(customer_account_id, contact_id);
create index activity_contact_idx on public.activity_events(contact_id);
create index activity_call_idx on public.activity_events(call_id);
create index activity_admin_idx on public.activity_events(actor_admin_id);
create index activity_time_idx on public.activity_events(occurred_at desc);
create index jobs_call_idx on public.integration_jobs(call_id);
create index jobs_pending_idx on public.integration_jobs(available_at) where status in ('pending', 'failed');

-- All helpers are non-exposed and schema-qualified. Only the admin predicate is SECURITY DEFINER.
create function asterbyte_private.is_active_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_profiles
    where id = (select auth.uid()) and role = 'admin' and is_active
  );
$$;
revoke all on function asterbyte_private.is_active_admin() from public, anon, authenticated, service_role;
grant usage on schema asterbyte_private to authenticated;
grant execute on function asterbyte_private.is_active_admin() to authenticated;

create function asterbyte_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function asterbyte_private.touch_updated_at() from public, anon, authenticated, service_role;

create function asterbyte_private.validate_source_project() returns trigger
language plpgsql set search_path = '' as $$
declare source_project uuid;
begin
  if new.source_call_id is not null then
    select c.project_id into source_project from public.calls c where c.id = new.source_call_id;
    if source_project is not null and source_project is distinct from new.project_id then
      raise exception using errcode = '23514', message = 'Source call project does not match record project.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function asterbyte_private.validate_source_project() from public, anon, authenticated, service_role;
create trigger asterbyte_source_project before insert or update of source_call_id, project_id on public.customer_notes
for each row execute function asterbyte_private.validate_source_project();
create trigger asterbyte_source_project before insert or update of source_call_id, project_id on public.support_tickets
for each row execute function asterbyte_private.validate_source_project();

create function asterbyte_private.validate_ticket_permission() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Lock current grants while accepting the report; historical tickets survive later revocation.
  perform 1 from public.account_contacts m
  where m.customer_account_id = new.customer_account_id and m.contact_id = new.reporter_contact_id
    and m.membership_status = 'active' for share;
  if not found then
    raise exception using errcode = '23514', message = 'Ticket reporter requires active account membership.';
  end if;
  perform 1 from public.project_contacts p
  where p.project_id = new.project_id and p.customer_account_id = new.customer_account_id
    and p.contact_id = new.reporter_contact_id and p.access_status = 'active'
    and p.access_role in ('project_owner', 'support_contact') for share;
  if not found then
    raise exception using errcode = '23514', message = 'Ticket reporter requires active project support permission.';
  end if;
  return new;
end;
$$;
revoke all on function asterbyte_private.validate_ticket_permission() from public, anon, authenticated, service_role;
create trigger asterbyte_ticket_permission before insert or update of project_id, customer_account_id, reporter_contact_id on public.support_tickets
for each row execute function asterbyte_private.validate_ticket_permission();

create function asterbyte_private.validate_activity_scope() returns trigger
language plpgsql set search_path = '' as $$
declare source_call public.calls;
begin
  if new.call_id is not null then
    select * into source_call from public.calls where id = new.call_id;
    if (new.customer_account_id is not null and new.customer_account_id is distinct from source_call.customer_account_id)
      or (new.contact_id is not null and new.contact_id is distinct from source_call.contact_id) then
      raise exception using errcode = '23514', message = 'Activity scope does not match its source call.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function asterbyte_private.validate_activity_scope() from public, anon, authenticated, service_role;
create trigger asterbyte_activity_scope before insert or update of call_id, customer_account_id, contact_id on public.activity_events
for each row execute function asterbyte_private.validate_activity_scope();

create function asterbyte_private.validate_knowledge_review() returns trigger
language plpgsql set search_path = '' as $$
declare reviewer uuid;
begin
  if tg_table_name = 'knowledge_documents' then
    if new.approval_status <> 'approved' then return new; end if;
    reviewer := new.approved_by_admin_id;
  else
    if new.review_status = 'pending' then return new; end if;
    reviewer := new.reviewed_by_admin_id;
  end if;
  if not exists (select 1 from public.admin_profiles where id = reviewer and is_active and role = 'admin') then
    raise exception using errcode = '23514', message = 'Knowledge review requires an explicitly active administrator.';
  end if;
  return new;
end;
$$;
revoke all on function asterbyte_private.validate_knowledge_review() from public, anon, authenticated, service_role;
create trigger asterbyte_knowledge_review before insert or update of approval_status, approved_by_admin_id, approved_at, content_markdown, content_sha256 on public.knowledge_documents
for each row execute function asterbyte_private.validate_knowledge_review();
create trigger asterbyte_knowledge_review before insert or update of review_status, reviewed_by_admin_id, reviewed_at on public.knowledge_candidates
for each row execute function asterbyte_private.validate_knowledge_review();

create function asterbyte_private.validate_commercial_relationship() returns trigger
language plpgsql set search_path = '' as $$
declare account_id uuid; stage text; has_contract boolean;
begin
  if tg_table_name = 'customer_accounts' then
    account_id := new.id;
  elsif tg_op = 'DELETE' then
    account_id := old.customer_account_id;
  else
    account_id := new.customer_account_id;
  end if;
  select relationship_stage into stage from public.customer_accounts where id = account_id for update;
  if stage is null then return null; end if;
  select exists(select 1 from public.projects where customer_account_id = account_id and contract_status = 'signed') into has_contract;
  if (stage in ('customer', 'former_customer') and not has_contract) or (stage = 'prospect' and has_contract) then
    raise exception using errcode = '23514', message = 'Commercial relationship stage must agree with signed project history.';
  end if;
  if tg_table_name = 'projects' and tg_op = 'UPDATE' then
    if old.customer_account_id is distinct from new.customer_account_id then
      select relationship_stage into stage from public.customer_accounts where id = old.customer_account_id for update;
      if stage in ('customer', 'former_customer') and not exists (
        select 1 from public.projects where customer_account_id = old.customer_account_id and contract_status = 'signed'
      ) then
        raise exception using errcode = '23514', message = 'Previous customer account must retain signed project history.';
      end if;
    end if;
  end if;
  return null;
end;
$$;
revoke all on function asterbyte_private.validate_commercial_relationship() from public, anon, authenticated, service_role;
create constraint trigger asterbyte_commercial_relationship after insert or update on public.customer_accounts
deferrable initially deferred for each row execute function asterbyte_private.validate_commercial_relationship();
create constraint trigger asterbyte_commercial_relationship after insert or update or delete on public.projects
deferrable initially deferred for each row execute function asterbyte_private.validate_commercial_relationship();

-- Per-table grants and RLS are applied in the SAME migration/transaction as table creation.
-- No anonymous reads yet: public catalog routes and human approvals are later milestones.
-- Authenticated users can read only after an explicit active admin mapping; no browser writes.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'agency_profile','services','employees','customer_accounts','contacts','account_contacts',
    'projects','project_services','project_contacts','calls','inquiries','support_tickets',
    'meetings','customer_notes','knowledge_documents','admin_profiles','knowledge_candidates',
    'activity_events','integration_jobs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant select, insert, update on table public.%I to service_role', table_name);
    execute format('create policy active_admin_read on public.%I for select to authenticated using ((select asterbyte_private.is_active_admin()))', table_name);
    execute format('create trigger asterbyte_touch_updated_at before update on public.%I for each row execute function asterbyte_private.touch_updated_at()', table_name);
  end loop;
end;
$$;
revoke update on public.activity_events from service_role;

comment on schema asterbyte_private is 'Non-exposed helpers and developer import tooling; never add to PostgREST exposed schemas.';
comment on table public.admin_profiles is 'Explicit administrator mapping; no seed identities and no self-enrollment.';
comment on table public.calls is 'Recognized contact/history is not current caller verification or authorization.';
comment on table public.knowledge_documents is 'Versioned Markdown snapshots; draft versions must not enter customer retrieval.';
comment on table public.integration_jobs is 'Empty runtime foundation. Imports never enqueue provider work.';
