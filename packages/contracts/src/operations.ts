import { z } from 'zod';
import { supportDashboardSchema } from './support.js';

export const knowledgeQuestionSchema = z.strictObject({
  question: z.string().trim().min(3).max(1500),
});
export const passageSchema = z.strictObject({
  chunk_id: z.uuid(),
  document_id: z.uuid(),
  document_key: z.string(),
  version: z.string(),
  title: z.string(),
  source_path: z.string(),
  content: z.string(),
  similarity: z.number(),
});
export const knowledgeResultSchema = z.strictObject({
  passages: z.array(passageSchema),
  evidence_only: z.literal(true),
});
const optionalEntry = z.string().trim().max(500).default('');
export const inquiryInputSchema = z
  .strictObject({
    submission_key: z
      .string()
      .trim()
      .min(8)
      .max(120)
      .regex(/^[a-zA-Z0-9_-]+$/),
    confirmed: z.literal('yes'),
    customer_name: z.string().trim().min(2).max(160),
    email: z.union([z.email().max(254), z.literal('')]).default(''),
    phone: z.union([z.string().regex(/^\+[1-9][0-9]{7,14}$/), z.literal('')]).default(''),
    organization: optionalEntry,
    title: z.string().trim().min(5).max(200),
    requirements: z.string().trim().min(15).max(6000),
    budget: optionalEntry,
    timeline: optionalEntry,
  })
  .refine((value) => Boolean(value.email || value.phone), {
    message: 'A caller-provided contact method is required.',
  });
export type InquiryInput = z.infer<typeof inquiryInputSchema>;
export const inquiryResultSchema = z.strictObject({
  inquiry_id: z.uuid(),
  reference: z.string(),
  duplicate: z.boolean(),
  identity_status: z.literal('unverified'),
});
export const dashboardSchema = z.strictObject({
  meetings: z
    .array(
      z.object({
        id: z.uuid(),
        code: z.string(),
        title: z.string(),
        requested_start_at: z.string(),
        duration_minutes: z.number(),
        timezone: z.string(),
        status: z.string(),
        provider: z.string().nullable(),
        provider_event_id: z.string().nullable(),
        inquiry_id: z.uuid().nullable(),
        project_id: z.uuid().nullable(),
        employees: z.object({ full_name: z.string() }).nullable().default(null),
      }),
    )
    .default([]),
  support: supportDashboardSchema.default({ tickets: [], emails: [] }),
  calls: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      status: z.string(),
      record_source: z.string(),
      started_at: z.string(),
      summary: z.string(),
      provider_execution_id: z.string().nullable(),
      channel: z.string().nullable().default(null),
      direction: z.string().nullable().default(null),
      duration_seconds: z.number().nonnegative().nullable().default(null),
    }),
  ),
  inquiries: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      title: z.string(),
      requirements: z.string(),
      stage: z.string(),
      created_at: z.string(),
      import_batch: z.string().nullable(),
      intake_details: z.record(z.string(), z.json()),
      source_call_id: z.uuid().nullable().default(null),
    }),
  ),
  events: z.array(
    z.object({
      id: z.uuid(),
      event_type: z.string(),
      description: z.string(),
      occurred_at: z.string(),
      call_id: z.uuid().nullable().default(null),
    }),
  ),
  tools: z.array(
    z.object({
      id: z.uuid(),
      tool_name: z.string(),
      status: z.string(),
      error_code: z.string().nullable(),
      created_at: z.string(),
      source_ids: z.array(z.uuid()),
      inquiry_id: z.uuid().nullable().default(null),
      ticket_id: z.uuid().nullable().default(null),
    }),
  ),
  evidence: z.array(
    z.object({
      execution_id: z.uuid(),
      provider_status: z.string(),
      summary: z.string().nullable(),
      contact_observations: z.record(z.string(), z.json()),
      conversation_duration: z.number(),
      updated_at: z.string(),
    }),
  ),
  knowledge: z.array(
    z.object({
      document_key: z.string(),
      id: z.uuid().optional(),
      version: z.string(),
      approval_status: z.string(),
      title: z.string().default(''),
      source_path: z.string().default(''),
      visibility: z.string().default(''),
      approved_at: z.string().nullable().default(null),
      indexed_passages: z.number().int().nonnegative().default(0),
    }),
  ),
  sources: z
    .array(
      z.object({
        id: z.uuid(),
        document_id: z.uuid(),
        chunk_index: z.number().int(),
        document_key: z.string(),
        version: z.string(),
        title: z.string(),
      }),
    )
    .default([]),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
export const knowledgeDocumentSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  version: z.string(),
  document_key: z.string(),
  content_markdown: z.string(),
  content_sha256: z.string(),
});
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;
