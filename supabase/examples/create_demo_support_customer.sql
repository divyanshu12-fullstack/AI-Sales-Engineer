-- Run in the Supabase SQL editor AFTER replacing the email below with an inbox YOU control.
-- Creates a demo CUSTOMER and project, not a Supabase Auth/admin login. No seed reset or fake ticket.
begin;
do $$
declare
  demo_email text := 'REPLACE_WITH_YOUR_REAL_EMAIL';
  demo_phone text := null; -- Optional actual E.164 caller number, e.g. +91...; never a password.
  customer_code text := '9001';
  project_code text := '9002';
  account_id uuid := gen_random_uuid();
  contact_id uuid := gen_random_uuid();
  project_id uuid := gen_random_uuid();
  employee_id uuid;
begin
  if demo_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or lower(demo_email) ~ '(@example\.(com|org|net)$|\.(invalid|example|test)$)' then
    raise exception 'Replace demo_email with a real inbox you control before running this script.';
  end if;
  select id into strict employee_id from public.employees where is_active order by (team ilike '%support%') desc,code limit 1;
  insert into public.customer_accounts(id,code,support_code,display_name,industry,relationship_stage,timezone,notes)
    values(account_id,'demo-'||account_id,customer_code,'Hackathon demo customer','Demo','customer','Asia/Kolkata',
      'Owner-controlled fictional demo. Code fallback is not production identity verification.');
  insert into public.contacts(id,code,full_name,email_normalized,phone_e164,preferred_language,contact_source,support_email_enabled)
    values(contact_id,'demo-'||contact_id,'Demo customer',lower(btrim(demo_email)),demo_phone,'en','manual_entry',true);
  insert into public.account_contacts(customer_account_id,contact_id,relationship_role,membership_status)
    values(account_id,contact_id,'owner','active');
  insert into public.projects(id,code,support_code,support_demo_enabled,customer_account_id,name,product_key,summary,status,
    contract_status,contracted_on,lead_employee_id,started_on,delivered_on,support_status)
    values(project_id,'demo-'||project_id,project_code,true,account_id,'Demo appointment system','clinicflow',
      'Fictional appointment system for a controlled support demonstration.','delivered','signed',current_date,
      employee_id,current_date,current_date,'active');
  insert into public.project_contacts(project_id,customer_account_id,contact_id,access_role,access_status)
    values(project_id,account_id,contact_id,'project_owner','active');
end $$;
commit;
-- Codes to speak during the browser call: project 9002, then customer 9001 if asked.
select p.support_code as project_code,a.support_code as customer_code,p.name
from public.projects p join public.customer_accounts a on a.id=p.customer_account_id
where p.support_code='9002';
