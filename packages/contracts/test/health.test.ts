import { describe, expect, it } from 'vitest';
import {
  errorResponseSchema,
  integrationIds,
  integrationStatusSchema,
  livenessResponseSchema,
  readinessResponseSchema,
  consultationAvailabilityInputSchema,
  consultationAvailabilityResultSchema,
  consultationInputSchema,
  consultationResultSchema,
} from '../src/index.js';

const integration = {
  id: 'bolna',
  status: 'unavailable',
  configuration: 'missing',
  verification: 'not_checked',
  missingVariables: ['BOLNA_API_KEY'],
  reason: 'Not configured or verified.',
};

describe('shared health contracts', () => {
  it('accepts process liveness without claiming business readiness', () => {
    expect(
      livenessResponseSchema.parse({ data: { status: 'ok', service: 'asterbyte-api' } }),
    ).toBeDefined();
  });

  it('rejects unknown fields and invented available integrations', () => {
    expect(integrationStatusSchema.safeParse({ ...integration, apiKey: 'secret' }).success).toBe(
      false,
    );
    expect(integrationStatusSchema.safeParse({ ...integration, status: 'available' }).success).toBe(
      false,
    );
  });

  it('does not allow contradictory configuration reporting', () => {
    expect(
      integrationStatusSchema.safeParse({ ...integration, configuration: 'present' }).success,
    ).toBe(false);
  });

  it('requires each integration exactly once', () => {
    const integrations = integrationIds.map((id) => ({ ...integration, id }));
    expect(
      readinessResponseSchema.safeParse({ data: { status: 'not_ready', integrations } }).success,
    ).toBe(true);
    expect(
      readinessResponseSchema.safeParse({
        data: { status: 'not_ready', integrations: integrations.map(() => integration) },
      }).success,
    ).toBe(false);
  });

  it('requires a stable error code and generated request identifier', () => {
    expect(
      errorResponseSchema.safeParse({
        error: { code: 'NOT_FOUND', message: 'Not found.', requestId: 'arbitrary-caller-value' },
      }).success,
    ).toBe(false);
  });
});

describe('consultation contracts', () => {
  it('accepts only bounded preferred dates and returned slot details', () => {
    expect(
      consultationAvailabilityInputSchema.parse({
        topic: 'CRM for a small sales team',
        preferred_date: '2026-10-31',
        preferred_period: 'afternoon',
      }).preferred_period,
    ).toBe('afternoon');
    expect(
      consultationAvailabilityResultSchema.safeParse({
        status: 'available',
        timezone: 'Asia/Kolkata',
        duration_minutes: 30,
        slots: [
          {
            start_at: '2026-10-31T05:30:00Z',
            display: 'Sat, 31 Oct, 11:00 am IST',
            consultant_id: '00000000-0000-4000-8000-000000000001',
            consultant_name: 'Meera Kapoor',
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      consultationAvailabilityInputSchema.safeParse({
        topic: 'CRM',
        preferred_date: '2026-11-01',
        preferred_period: 'night',
      }).success,
    ).toBe(false);
  });

  it('requires explicit consent and exact matching data for a reservation result', () => {
    const input = {
      submission_key: 'agent_meeting-test',
      inquiry_reference: 'INQ-00000000-0000-4000-8000-000000000001',
      consultant_id: '00000000-0000-4000-8000-000000000002',
      start_at: '2026-10-31T05:30:00Z',
      topic: 'CRM for a small sales team',
      confirmed: 'yes',
      email: '',
      notes: '',
    };
    expect(consultationInputSchema.safeParse(input).success).toBe(true);
    expect(consultationInputSchema.safeParse({ ...input, confirmed: 'no' }).success).toBe(false);
    expect(
      consultationResultSchema.safeParse({
        status: 'scheduled',
        meeting_id: '00000000-0000-4000-8000-000000000003',
        reference: 'MTG-EXAMPLE',
        inquiry_reference: input.inquiry_reference,
        start_at: input.start_at,
        display: 'Sat, 31 Oct, 11:00 am IST',
        duration_minutes: 30,
        timezone: 'Asia/Kolkata',
        consultant_name: 'Meera Kapoor',
        duplicate: false,
        confirmation: 'pending',
        email_status: 'accepted',
      }).success,
    ).toBe(true);
  });
});
