import { livenessResponseSchema, readinessResponseSchema } from '@asterbyte/contracts';
import type { LivenessResponse, ReadinessResponse } from '@asterbyte/contracts';

export interface FoundationStatus {
  liveness: LivenessResponse;
  readiness: ReadinessResponse;
}

const getJson = async <T>(
  path: string,
  schema: { parse: (value: unknown) => T },
  expectedStatus: number,
  signal: AbortSignal,
): Promise<T> => {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  if (response.status !== expectedStatus) throw new Error('Unexpected API status response.');
  const body: unknown = await response.json();
  return schema.parse(body);
};

export const fetchFoundationStatus = async (signal: AbortSignal): Promise<FoundationStatus> => {
  const [liveness, readiness] = await Promise.all([
    getJson('/api/health/live', livenessResponseSchema, 200, signal),
    // A reachable API is not the same as a business-ready application.
    getJson('/api/health/ready', readinessResponseSchema, 503, signal),
  ]);
  return { liveness, readiness };
};
