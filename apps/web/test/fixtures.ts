import { integrationIds } from '@asterbyte/contracts';
import type { LivenessResponse, ReadinessResponse } from '@asterbyte/contracts';

export const liveness: LivenessResponse = {
  data: { status: 'ok', service: 'asterbyte-api' },
};

export const readiness: ReadinessResponse = {
  data: {
    status: 'not_ready',
    integrations: integrationIds.map((id) => ({
      id,
      status: 'unavailable',
      configuration: 'missing',
      verification: 'not_checked',
      missingVariables: ['TEST_CONFIGURATION'],
      reason: 'Required configuration is missing.',
    })),
  },
};

export const statusResponse = (path: string): Response =>
  new Response(JSON.stringify(path.endsWith('/live') ? liveness : readiness), {
    status: path.endsWith('/live') ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  });
