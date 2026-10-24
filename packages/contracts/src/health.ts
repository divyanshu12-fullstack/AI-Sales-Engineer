import { z } from 'zod';

export const integrationIds = [
  'supabase',
  'bolna',
  'llm',
  'embeddings',
  'calendar',
  'resend',
  'public_callbacks',
] as const;

export type IntegrationId = (typeof integrationIds)[number];

export const integrationStatusSchema = z
  .strictObject({
    id: z.enum(integrationIds),
    status: z.literal('unavailable'),
    configuration: z.enum(['missing', 'present']),
    verification: z.literal('not_checked'),
    missingVariables: z.array(z.string().min(1)),
    reason: z.string().min(1).max(250),
  })
  .refine(
    ({ configuration, missingVariables }) =>
      (configuration === 'present') === (missingVariables.length === 0),
    { message: 'Configuration state must match the missing variable list.' },
  );

export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const livenessResponseSchema = z.strictObject({
  data: z.strictObject({
    status: z.literal('ok'),
    service: z.literal('asterbyte-api'),
  }),
});

export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

export const readinessResponseSchema = z.strictObject({
  data: z.strictObject({
    status: z.literal('not_ready'),
    integrations: z
      .array(integrationStatusSchema)
      .length(integrationIds.length)
      .refine((entries) => new Set(entries.map(({ id }) => id)).size === integrationIds.length, {
        message: 'Every integration must be reported exactly once.',
      }),
  }),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

export const apiErrorCodeSchema = z.enum([
  'NOT_FOUND',
  'INVALID_JSON',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'ORIGIN_NOT_ALLOWED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'INVALID_INPUT',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INTEGRATION_UNAVAILABLE',
  'UPSTREAM_ERROR',
  'CONFLICT',
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    requestId: z.uuid(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
