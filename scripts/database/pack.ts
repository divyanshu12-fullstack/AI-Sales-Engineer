import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));
export const importBatch = 'asterbyte-initial-v1';
export const expectedCounts = {
  agency_profile: 1,
  services: 10,
  employees: 7,
  customer_accounts: 9,
  contacts: 11,
  account_contacts: 11,
  projects: 6,
  project_services: 10,
  project_contacts: 7,
  calls: 10,
  inquiries: 4,
  support_tickets: 5,
  meetings: 3,
  customer_notes: 6,
  knowledge_documents: 7,
  admin_profiles: 0,
  knowledge_candidates: 2,
  activity_events: 4,
  integration_jobs: 0,
  knowledge_chunks: 0,
} as const;
export const tableNames = Object.keys(expectedCounts);
export const implementedTables = tableNames.filter((name) => name !== 'knowledge_chunks');

const columnSchema = z.object({
  type: z.enum([
    'uuid',
    'text',
    'integer',
    'numeric(12,2)',
    'boolean',
    'text[]',
    'timestamptz',
    'date',
    'jsonb',
    'vector(D)',
  ]),
  nullable: z.boolean(),
  allowed_values: z.array(z.string()).optional(),
});
const tableSchema = z.object({
  phase: z.enum(['core', 'runtime-empty', 'deferred-empty']),
  columns: z.record(z.string(), columnSchema),
  primary_key: z.array(z.string()),
  unique_constraints: z.array(z.array(z.string())),
  foreign_keys: z.array(
    z.object({
      columns: z.array(z.string()),
      references_table: z.string(),
      references_columns: z.array(z.string()),
      external: z.boolean(),
      on_delete: z.literal('RESTRICT'),
    }),
  ),
});
const definitionSchema = z.object({
  format_version: z.literal('1.0'),
  tables: z.record(z.string(), tableSchema),
  insert_order: z.array(z.string()),
});
const rowSchema = z
  .object({
    id: z.uuid(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
    import_batch: z.literal(importBatch),
  })
  .passthrough();
const dataSchema = z
  .object({
    format_version: z.literal('1.0'),
    import_batch: z.literal(importBatch),
    tables: z.record(z.string(), z.array(rowSchema)),
  })
  .passthrough();

export type Definition = z.infer<typeof definitionSchema>;
export type CompanyData = z.infer<typeof dataSchema>;
export type Row = z.infer<typeof rowSchema>;
export interface Pack {
  definition: Definition;
  data: CompanyData;
}
export const parseCompanyData = (value: unknown): CompanyData => dataSchema.parse(value);

export const sha256 = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex');
const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};
export const rows = (data: CompanyData, table: string): Row[] => {
  const result = data.tables[table];
  if (!result) throw new Error(`Missing reviewed table array: ${table}.`);
  return result;
};
export const text = (row: Row, column: string): string => {
  const value = row[column];
  if (typeof value !== 'string') throw new Error(`Expected text field: ${column}.`);
  return value;
};

const fieldValidator = (column: z.infer<typeof columnSchema>): z.ZodType => {
  let validator: z.ZodType;
  switch (column.type) {
    case 'uuid':
      validator = z.uuid();
      break;
    case 'text':
      validator = z.string();
      break;
    case 'integer':
      validator = z.number().int();
      break;
    case 'numeric(12,2)':
      validator = z
        .number()
        .refine(
          (n) => Math.abs(n) < 10_000_000_000 && Math.abs(n * 100 - Math.round(n * 100)) < 0.0001,
        );
      break;
    case 'boolean':
      validator = z.boolean();
      break;
    case 'text[]':
      validator = z.array(z.string());
      break;
    case 'timestamptz':
      validator = z.iso.datetime();
      break;
    case 'date':
      validator = z.iso.date();
      break;
    case 'jsonb':
      validator = z.record(z.string(), z.json());
      break;
    case 'vector(D)':
      throw new Error('Unresolved vectors must never be loaded.');
  }
  if (column.allowed_values) {
    const allowed = column.allowed_values;
    validator = validator.refine((value) => typeof value === 'string' && allowed.includes(value));
  }
  return column.nullable ? validator.nullable() : validator;
};

export const validatePack = async (pack: Pack, root = workspaceRoot): Promise<void> => {
  const { definition, data } = pack;
  const expected = [...tableNames].sort().join(',');
  assert(
    Object.keys(definition.tables).sort().join(',') === expected,
    'Unexpected proposal table set.',
  );
  assert(Object.keys(data.tables).sort().join(',') === expected, 'Unexpected data table set.');
  assert(
    definition.insert_order.join(',') === tableNames.join(','),
    'Insertion dependency order changed.',
  );
  assert(
    rows(data, 'agency_profile')[0]?.name === 'AsterByte Solutions',
    'Canonical company name must be AsterByte Solutions.',
  );

  for (const [table, count] of Object.entries(expectedCounts)) {
    const records = rows(data, table);
    assert(records.length === count, `Unexpected row count: ${table}.`);
    const spec = definition.tables[table];
    if (!spec) throw new Error(`Missing table specification: ${table}.`);
    if (table === 'knowledge_chunks') {
      assert(spec.phase === 'deferred-empty', 'Knowledge chunks must remain deferred.');
      continue;
    }
    const fields = Object.fromEntries(
      Object.entries(spec.columns).map(([name, column]) => [name, fieldValidator(column)]),
    );
    const validator = z.strictObject(fields);
    for (const record of records) {
      if (!validator.safeParse(record).success)
        throw new Error(`Field contract violation: ${table}/${record.id}.`);
      assert(record.import_batch === importBatch, `Wrong import batch: ${table}/${record.id}.`);
      assert(
        Date.parse(record.updated_at) >= Date.parse(record.created_at),
        `Invalid record timestamps: ${table}/${record.id}.`,
      );
    }
    for (const columns of [spec.primary_key, ...spec.unique_constraints]) {
      const keys = records.map((row) => JSON.stringify(columns.map((column) => row[column])));
      assert(
        new Set(keys).size === keys.length,
        `Duplicate unique key: ${table}/${columns.join(',')}.`,
      );
    }
    for (const fk of spec.foreign_keys) {
      if (fk.external) {
        assert(records.length === 0, 'Import must not fabricate an Auth identity.');
        continue;
      }
      const parentKeys = new Set(
        rows(data, fk.references_table).map((row) =>
          JSON.stringify(fk.references_columns.map((column) => row[column])),
        ),
      );
      for (const record of records) {
        const key = fk.columns.map((column) => record[column]);
        if (key.some((value) => value === null)) continue;
        assert(
          parentKeys.has(JSON.stringify(key)),
          `Broken foreign key: ${table}/${record.id}/${fk.columns.join(',')}.`,
        );
      }
    }
  }

  for (const call of rows(data, 'calls')) {
    assert(
      call.record_source === 'imported_history' &&
        call.identity_status === 'unverified' &&
        call.provider === null &&
        call.provider_execution_id === null,
      `Unsafe imported call: ${call.id}.`,
    );
    assert(
      call.status === 'completed' &&
        typeof call.ended_at === 'string' &&
        Date.parse(call.ended_at) >= Date.parse(text(call, 'started_at')),
      `Invalid call history: ${call.id}.`,
    );
    assert(
      call.customer_account_id === null || call.contact_id !== null,
      `Call account requires contact: ${call.id}.`,
    );
    assert(
      call.project_id === null || (call.customer_account_id !== null && call.contact_id !== null),
      `Call project requires scope: ${call.id}.`,
    );
  }
  for (const table of ['inquiries', 'support_tickets', 'customer_notes', 'knowledge_candidates']) {
    for (const record of rows(data, table)) {
      if (record.source_call_id === null) continue;
      const call = rows(data, 'calls').find(({ id }) => id === record.source_call_id);
      const contact = table === 'support_tickets' ? record.reporter_contact_id : record.contact_id;
      assert(
        Boolean(
          call &&
          call.customer_account_id === record.customer_account_id &&
          call.contact_id === contact,
        ),
        `Source-call scope mismatch: ${table}/${record.id}.`,
      );
      if (table !== 'inquiries' && call?.project_id !== null) {
        assert(
          call?.project_id === record.project_id,
          `Source-call project mismatch: ${table}/${record.id}.`,
        );
      }
    }
  }
  for (const ticket of rows(data, 'support_tickets')) {
    const member = rows(data, 'account_contacts').find(
      (m) =>
        m.customer_account_id === ticket.customer_account_id &&
        m.contact_id === ticket.reporter_contact_id,
    );
    const grant = rows(data, 'project_contacts').find(
      (p) => p.project_id === ticket.project_id && p.contact_id === ticket.reporter_contact_id,
    );
    assert(
      member?.membership_status === 'active' &&
        grant?.access_status === 'active' &&
        ['project_owner', 'support_contact'].includes(text(grant, 'access_role')),
      `Ticket reporter lacks active permission: ${ticket.id}.`,
    );
  }
  for (const meeting of rows(data, 'meetings'))
    assert(
      meeting.status === 'requested' &&
        meeting.provider === null &&
        meeting.provider_event_id === null,
      `Unsafe meeting request: ${meeting.id}.`,
    );
  for (const candidate of rows(data, 'knowledge_candidates'))
    assert(
      candidate.review_status === 'pending' &&
        candidate.reviewed_at === null &&
        candidate.reviewed_by_admin_id === null,
      `Unsafe knowledge candidate: ${candidate.id}.`,
    );
  for (const event of rows(data, 'activity_events'))
    assert(event.event_type === 'history_imported', `Unsafe imported event: ${event.id}.`);
  for (const document of rows(data, 'knowledge_documents')) {
    const sourcePath = text(document, 'source_path');
    const source = resolve(root, sourcePath);
    const knowledgeRoot = resolve(root, 'docs/knowledge-base') + sep;
    assert(
      source.startsWith(knowledgeRoot) && source.endsWith('.md'),
      'Knowledge source path is outside the approved folder.',
    );
    const content = await readFile(source, 'utf8');
    assert(content === document.content_markdown, `Markdown snapshot mismatch: ${sourcePath}.`);
    assert(
      sha256(content) === document.content_sha256,
      `Markdown SHA-256 mismatch: ${sourcePath}.`,
    );
    assert(
      content.includes(`document_id: ${text(document, 'document_key')}\n`) &&
        content.includes(`version: "${text(document, 'version')}"\n`) &&
        content.includes(`language: ${text(document, 'language')}\n`),
      `Knowledge frontmatter mismatch: ${sourcePath}.`,
    );
    assert(
      document.approval_status === 'draft' && content.includes('status: draft\n'),
      `Knowledge must remain under review: ${sourcePath}.`,
    );
  }
};

export const readPack = async (validate = true): Promise<Pack> => {
  const [definitionText, dataText] = await Promise.all([
    readFile(resolve(workspaceRoot, 'docs/database-plan/schema-definition.json'), 'utf8'),
    readFile(resolve(workspaceRoot, 'docs/database-plan/company-data.json'), 'utf8'),
  ]);
  const pack = {
    definition: definitionSchema.parse(JSON.parse(definitionText)),
    data: parseCompanyData(JSON.parse(dataText)),
  };
  if (validate) await validatePack(pack);
  return pack;
};

export const buildImportSql = (data: CompanyData): string => {
  const json = JSON.stringify(data);
  const tag = `$asterbyte_${sha256(json).slice(0, 24)}$`;
  if (json.includes(tag)) throw new Error('Unexpected SQL payload delimiter collision.');
  return `-- Validated source data only; no credentials. One atomic statement.\nselect asterbyte_private.import_initial_records(${tag}${json}${tag}::jsonb) as import_report;\n`;
};
