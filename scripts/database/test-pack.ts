import { createHash } from 'node:crypto';
import { importBatch, parseCompanyData } from './pack.js';

const createdAt = '2026-10-01T00:00:00.000Z';
const uuid = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
let nextId = 1;
const record = <T extends Record<string, unknown>>(fields: T) => ({
  id: uuid(nextId++),
  created_at: createdAt,
  updated_at: createdAt,
  import_batch: importBatch,
  ...fields,
});

const employeeRows = Array.from({ length: 7 }, (_, index) =>
  record({
    code: `test-employee-${index + 1}`,
    full_name: `Demo Employee ${index + 1}`,
    team: index % 2 === 0 ? 'Consulting' : 'Support',
    role_title: index % 2 === 0 ? 'Consultant' : 'Support engineer',
    skills: ['software'],
    consultation_topics: ['websites'],
    is_active: true,
  }),
);

const accountCodes = [
  'northstar',
  'spare-account',
  'clearcare',
  'brightpath',
  'swiftroute',
  'nextstep',
  'blueframe',
  'codebridge',
  'extra-account',
];
const accountRows = accountCodes.map((code, index) =>
  record({
    code,
    display_name: `Fictional Demo Account ${index + 1}`,
    industry: 'Demo',
    relationship_stage: 'prospect',
    timezone: 'Asia/Kolkata',
    notes: 'Synthetic test fixture; contains no customer information.',
  }),
);

const contactRows = Array.from({ length: 11 }, (_, index) =>
  record({
    code: index === 0 ? 'demo-unlinked-contact' : `demo-contact-${index + 1}`,
    full_name: `Fictional Demo Contact ${index + 1}`,
    email_normalized: null,
    phone_e164: null,
    preferred_language: 'en',
    contact_source: 'manual_entry',
  }),
);

const membershipPairs = [
  [0, 9],
  [2, 0],
  [2, 1],
  [3, 2],
  [3, 8],
  [4, 3],
  [5, 4],
  [6, 5],
  [7, 6],
  [1, 7],
  [3, 0],
] as const;
const accountContactRows = membershipPairs.map(([account, contact], index) =>
  record({
    customer_account_id: accountRows[account]?.id,
    contact_id: contactRows[contact]?.id,
    relationship_role: index === 0 ? 'owner' : 'requester',
    membership_status: 'active',
  }),
);

const projectSpecs = [
  ['clinicflow', 2, 'ClinicFlow'],
  ['leadbridge', 3, 'LeadBridge'],
  ['dispatchpro', 4, 'DispatchPro'],
  ['formpilot', 5, 'FormPilot'],
  ['draftly', 6, 'Draftly'],
  ['repolens', 7, 'RepoLens'],
] as const;
const projectRows = projectSpecs.map(([code, account, name], index) =>
  record({
    code,
    customer_account_id: accountRows[account]?.id,
    name,
    product_key: code,
    summary: `Fictional ${name} product used only by automated tests.`,
    status: 'active',
    contract_status: 'draft',
    contracted_on: null,
    lead_employee_id: employeeRows[index]?.id,
    agreed_budget_inr: null,
    started_on: null,
    delivered_on: null,
    support_status: 'active',
  }),
);

const projectContactRows = projectRows.map((project, index) =>
  record({
    project_id: project.id,
    customer_account_id: project.customer_account_id,
    contact_id: contactRows[index + 1]?.id,
    access_role: 'project_owner',
    access_status: 'active',
  }),
);
const secondaryProject = projectRows[1];
const secondaryContact = contactRows[8];
if (!secondaryProject || !secondaryContact) throw new Error('Synthetic fixture is incomplete.');
projectContactRows.push(
  record({
    project_id: secondaryProject.id,
    customer_account_id: secondaryProject.customer_account_id,
    contact_id: secondaryContact.id,
    access_role: 'viewer',
    access_status: 'active',
  }),
);

const serviceRows = Array.from({ length: 10 }, (_, index) =>
  record({
    code: `test-service-${index + 1}`,
    name: `Synthetic Service ${index + 1}`,
    description: 'Fictional service used by automated database tests.',
    price_min_inr: 1000,
    price_max_inr: 2000,
    billing_unit: 'project',
    delivery_estimate: 'Test estimate',
    is_active: true,
    pricing_status: 'indicative',
  }),
);

const projectServiceRows = Array.from({ length: 10 }, (_, index) =>
  record({
    project_id: projectRows[index % projectRows.length]?.id,
    service_id: serviceRows[(index % 9) + 1]?.id,
  }),
);

const callSpecs = [
  [0, 9, null],
  [2, 1, 0],
  [3, 2, 1],
  [4, 3, 2],
  [5, 4, 3],
  [6, 5, 4],
  [7, 6, 5],
  [2, 0, null],
  [3, 8, null],
  [1, 7, null],
] as const;
const callRows = callSpecs.map(([account, contact, project], index) =>
  record({
    code: `TEST-CALL-${String(index + 1).padStart(2, '0')}`,
    customer_account_id: accountRows[account]?.id,
    contact_id: contactRows[contact]?.id,
    project_id: project === null ? null : projectRows[project]?.id,
    channel: 'browser',
    direction: 'inbound',
    language: 'en',
    agent_display_name: 'AsterByte Assistant',
    intent: 'general_inquiry',
    status: 'completed',
    identity_status: 'unverified',
    provider: null,
    provider_execution_id: null,
    started_at: createdAt,
    ended_at: '2026-10-01T00:05:00.000Z',
    summary: 'Synthetic call summary for an isolated database test.',
    record_source: 'imported_history',
  }),
);

const inquirySpecs = [
  [2, 1],
  [3, 2],
  [4, 3],
  [5, 4],
] as const;
const inquiryRows = inquirySpecs.map(([account, contact], index) =>
  record({
    code: `TEST-INQUIRY-${index + 1}`,
    customer_account_id: accountRows[account]?.id,
    contact_id: contactRows[contact]?.id,
    primary_service_id: serviceRows[index + 1]?.id,
    owner_employee_id: employeeRows[index]?.id,
    source_call_id: null,
    title: `Synthetic project inquiry ${index + 1}`,
    requirements: 'Fictional requirements created only for automated tests.',
    budget_min_inr: null,
    budget_max_inr: null,
    requested_launch_on: null,
    stage: 'new',
    next_action: 'Review synthetic test inquiry.',
    next_follow_up_at: null,
    converted_project_id: null,
  }),
);

const ticketRows = Array.from({ length: 5 }, (_, index) => {
  const project = projectRows[index % projectRows.length];
  return record({
    code: `TEST-TICKET-${index + 1}`,
    project_id: project?.id,
    customer_account_id: project?.customer_account_id,
    reporter_contact_id: contactRows[index + 1]?.id,
    assigned_employee_id: employeeRows[index]?.id,
    source_call_id: null,
    title: `Synthetic support issue ${index + 1}`,
    description: 'Fictional support details for automated database tests.',
    priority: 'P3',
    status: 'open',
    issue_kind: 'question',
    coverage_assessment: 'pending',
    linked_guide_issue: null,
    reported_at: createdAt,
    resolution_summary: null,
    resolved_at: null,
  });
});

const meetingRows = Array.from({ length: 3 }, (_, index) => {
  const project = projectRows[index];
  const inquiry = inquiryRows[index];
  return record({
    code: `TEST-MEETING-${index + 1}`,
    customer_account_id: project?.customer_account_id,
    contact_id: contactRows[index + 1]?.id,
    consultant_employee_id: employeeRows[index]?.id,
    inquiry_id: inquiry?.id,
    project_id: project?.id,
    title: `Synthetic consultation ${index + 1}`,
    requested_start_at: '2026-10-02T09:00:00.000Z',
    duration_minutes: 30,
    timezone: 'Asia/Kolkata',
    status: 'requested',
    provider: null,
    provider_event_id: null,
  });
});

const noteRows = Array.from({ length: 6 }, (_, index) => {
  const call = callRows[index + 1];
  return record({
    customer_account_id: call?.customer_account_id,
    contact_id: call?.contact_id,
    project_id: call?.project_id,
    source_call_id: call?.id,
    note_kind: 'requirement',
    content: 'Synthetic note; no real customer information.',
    verification_status: 'unverified',
  });
});

const knowledgeRows = Array.from({ length: 7 }, (_, index) => {
  const documentKey = index === 0 ? 'company-overview' : `synthetic-guide-${index + 1}`;
  const markdown = [
    '---',
    `document_id: ${documentKey}`,
    'version: "1.0"',
    'language: en',
    'status: draft',
    '---',
    '',
    `Synthetic knowledge fixture ${index + 1}. No customer or private company information.`,
    '',
  ].join('\n');
  return record({
    document_key: documentKey,
    version: '1.0',
    language: 'en',
    title: `Synthetic knowledge document ${index + 1}`,
    source_path: `docs/knowledge-base/synthetic-guide-${index + 1}.md`,
    content_sha256: createHash('sha256').update(markdown, 'utf8').digest('hex'),
    approval_status: 'draft',
    visibility: 'public',
    content_markdown: markdown,
  });
});

const candidateRows = [0, 1].map((index) => {
  const call = callRows[index + 1];
  return record({
    source_call_id: call?.id,
    customer_account_id: call?.customer_account_id,
    contact_id: call?.contact_id,
    project_id: call?.project_id,
    suggested_document_key: `synthetic-guide-${index + 1}`,
    title: `Synthetic candidate ${index + 1}`,
    proposed_text: 'Fictional suggested knowledge text for tests.',
    review_status: 'pending',
    reviewed_by_admin_id: null,
    reviewed_at: null,
  });
});

const eventRows = Array.from({ length: 4 }, (_, index) =>
  record({
    customer_account_id: null,
    contact_id: null,
    call_id: null,
    actor_admin_id: null,
    event_type: 'history_imported',
    description: `Synthetic history event ${index + 1}.`,
    occurred_at: createdAt,
    event_payload: { synthetic: true },
  }),
);

const tables = {
  agency_profile: [
    record({
      singleton_key: 'asterbyte',
      name: 'AsterByte Solutions',
      founded_year: 2019,
      founder_display_name: 'Demo Founder',
      profile_summary: 'Fictional profile used only by automated tests.',
      timezone: 'Asia/Kolkata',
      default_language: 'en',
      agent_display_name: 'AsterByte Assistant',
    }),
  ],
  services: serviceRows,
  employees: employeeRows,
  customer_accounts: accountRows,
  contacts: contactRows,
  account_contacts: accountContactRows,
  projects: projectRows,
  project_services: projectServiceRows,
  project_contacts: projectContactRows,
  calls: callRows,
  inquiries: inquiryRows,
  support_tickets: ticketRows,
  meetings: meetingRows,
  customer_notes: noteRows,
  knowledge_documents: knowledgeRows,
  admin_profiles: [],
  knowledge_candidates: candidateRows,
  activity_events: eventRows,
  integration_jobs: [],
  knowledge_chunks: [],
};

export const readTestPack = () =>
  parseCompanyData({ format_version: '1.0', import_batch: importBatch, tables });
