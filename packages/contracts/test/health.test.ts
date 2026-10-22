import { describe, expect, it } from 'vitest';
import {
  errorResponseSchema,
  integrationIds,
  integrationStatusSchema,
  livenessResponseSchema,
  readinessResponseSchema,
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
