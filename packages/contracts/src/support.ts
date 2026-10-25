import { z } from 'zod';
export const supportLookupSchema = z.strictObject({
  project_code: z
    .string()
    .trim()
    .regex(/^\d{4}$/),
  customer_code: z
    .union([
      z
        .string()
        .trim()
        .regex(/^\d{4}$/),
      z.literal(''),
    ])
    .default(''),
  execution_id: z.union([z.uuid(), z.literal('')]).default(''),
});
export const supportTicketInputSchema = z.strictObject({
  support_token: z.string().regex(/^[a-f0-9]{64}$/),
  submission_key: z
    .string()
    .min(8)
    .max(120)
    .regex(/^[a-zA-Z0-9_-]+$/),
  confirmed: z.literal('yes'),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(8000),
  priority: z.enum(['P1', 'P2', 'P3', 'P4']).default('P3'),
  issue_kind: z
    .enum(['suspected_bug', 'question', 'feature_request', 'security_incident'])
    .default('suspected_bug'),
});
export const ticketStatusSchema = z.enum([
  'open',
  'triaged',
  'in_progress',
  'waiting_customer',
  'waiting_provider',
  'resolved',
  'closed',
]);
export const supportUpdateSchema = z
  .strictObject({
    status: ticketStatusSchema,
    resolution: z.string().trim().max(8000).default(''),
  })
  .refine((v) => !['resolved', 'closed'].includes(v.status) || v.resolution.length >= 5, {
    message: 'Describe the resolution before resolving or closing.',
  });
export const supportDashboardSchema = z.strictObject({
  tickets: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      title: z.string(),
      description: z.string(),
      priority: z.string(),
      status: ticketStatusSchema,
      reported_at: z.string(),
      resolution_summary: z.string().nullable(),
      resolved_at: z.string().nullable(),
      intake_identity_status: z.string(),
      import_batch: z.string().nullable(),
      projects: z.object({ name: z.string(), support_code: z.string().nullable() }),
      customer_accounts: z.object({
        display_name: z.string(),
        support_code: z.string().nullable(),
      }),
      contacts: z.object({
        full_name: z.string(),
        email_normalized: z.string().nullable(),
        support_email_enabled: z.boolean(),
      }),
      employees: z.object({ full_name: z.string() }),
    }),
  ),
  emails: z.array(
    z.object({
      id: z.uuid(),
      status: z.string(),
      attempts: z.number().int(),
      last_error_code: z.string().nullable(),
      provider_message_id: z.string().nullable(),
      created_at: z.string(),
      payload: z.object({
        ticket_id: z.uuid(),
        template: z.enum(['support_acknowledgement', 'support_resolution']),
      }),
    }),
  ),
});
export type SupportDashboard = z.infer<typeof supportDashboardSchema>;
