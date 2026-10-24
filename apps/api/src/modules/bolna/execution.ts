import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { HttpError } from '../../http/errors.js';
import { fetchJson } from '../../lib/upstream.js';
import { contentHash } from '../knowledge/chunks.js';

const statuses = [
  'scheduled',
  'queued',
  'rescheduled',
  'initiated',
  'ringing',
  'in-progress',
  'call-disconnected',
  'completed',
  'no-answer',
  'busy',
  'failed',
  'canceled',
  'stopped',
  'error',
  'balance-low',
] as const;
const timestamp = z.iso.datetime({ offset: true });
const payloadSchema = z.object({
  id: z.uuid(),
  agent_id: z.uuid(),
  status: z.enum(statuses),
  created_at: timestamp,
  updated_at: timestamp,
  conversation_duration: z.number().nonnegative().nullish(),
  transcript: z.string().max(200_000).nullish(),
  summary: z.string().max(20_000).nullish(),
  extracted_data: z.record(z.string(), z.json()).nullish(),
  usage_breakdown: z.object({ transcriber_language: z.string().nullish() }).nullish(),
  telephony_data: z
    .object({
      provider: z.string().nullish(),
      call_type: z.enum(['inbound', 'outbound']).nullish(),
    })
    .nullish(),
});
const ranks: Record<(typeof statuses)[number], number> = {
  scheduled: 0,
  rescheduled: 0,
  queued: 1,
  initiated: 2,
  ringing: 3,
  'in-progress': 4,
  'call-disconnected': 5,
  'no-answer': 6,
  busy: 6,
  failed: 6,
  canceled: 6,
  stopped: 6,
  error: 6,
  'balance-low': 6,
  completed: 7,
};

// Keep structured observations, not verified identities. Only the configured, exact extraction labels are read.
export const contactObservations = (
  extractions: Record<string, unknown>,
): Record<string, string> => {
  const category = z.record(z.string(), z.unknown()).safeParse(extractions['All Industries']);
  if (!category.success) return {};
  const output: Record<string, string> = {};
  for (const [label, key] of Object.entries({
    'Customer Name': 'name',
    'Customer Email': 'email',
    'Customer Phone Number': 'phone',
  })) {
    const value = z
      .object({ subjective: z.string().max(500).nullish() })
      .safeParse(category.data[label]);
    if (value.success && value.data.subjective?.trim()) output[key] = value.data.subjective.trim();
  }
  return output;
};

export const normalizeExecution = (input: unknown, config: Env) => {
  const result = payloadSchema.safeParse(input);
  if (!result.success)
    throw new HttpError(502, 'UPSTREAM_ERROR', 'Invalid Bolna execution payload.');
  const p = result.data;
  if (!config.BOLNA_AGENT_ID || p.agent_id !== config.BOLNA_AGENT_ID)
    throw new HttpError(403, 'FORBIDDEN', 'Execution does not belong to the configured agent.');
  if (Date.parse(p.updated_at) < Date.parse(p.created_at))
    throw new HttpError(502, 'UPSTREAM_ERROR', 'Invalid execution timestamps.');
  const rank = ranks[p.status];
  const terminal = rank >= 6;
  const extractions = terminal ? (p.extracted_data ?? {}) : {};
  const summaryResult = z
    .object({
      General: z
        .object({
          'Call Summary': z.object({ subjective: z.string().max(20_000).nullish() }).optional(),
        })
        .optional(),
    })
    .safeParse(extractions);
  const summary = terminal
    ? (p.summary ??
      (summaryResult.success ? summaryResult.data.General?.['Call Summary']?.subjective : null) ??
      null)
    : null;
  // A disconnected line is not finalized processing. Completed with no dialogue isn't a completed conversation.
  const duration = terminal ? (p.conversation_duration ?? 0) : 0;
  const transcript = terminal ? (p.transcript ?? null) : null;
  const hasConversation =
    p.status === 'completed' && duration > 0 && /^user:\s*\S/m.test(transcript ?? '');
  const callStatus = !terminal
    ? 'started'
    : hasConversation
      ? 'completed'
      : p.status === 'canceled'
        ? 'cancelled'
        : 'failed';
  const channel =
    p.telephony_data?.provider === 'freeswitch'
      ? 'browser'
      : p.telephony_data?.provider
        ? 'phone'
        : config.BOLNA_CALL_CHANNEL;
  if (!channel)
    throw new HttpError(
      503,
      'INTEGRATION_UNAVAILABLE',
      'Set BOLNA_CALL_CHANNEL for executions without telephony metadata.',
    );
  return {
    execution_id: p.id,
    agent_id: p.agent_id,
    provider_status: p.status,
    status_rank: rank,
    provider_updated_at: p.updated_at,
    payload_sha256: contentHash(JSON.stringify(p)),
    conversation_duration: duration,
    transcript,
    summary,
    extracted_data: extractions,
    contact_observations: terminal ? contactObservations(extractions) : {},
    channel,
    direction: p.telephony_data?.call_type ?? null,
    language: ['en', 'hi'].includes(p.usage_breakdown?.transcriber_language ?? '')
      ? (p.usage_breakdown?.transcriber_language ?? null)
      : null,
    call_status: callStatus,
    started_at: p.created_at,
    ended_at: terminal ? p.updated_at : null,
  };
};

export const getExecution = async (id: string, config: Env): Promise<unknown> => {
  if (!config.BOLNA_API_KEY)
    throw new HttpError(503, 'INTEGRATION_UNAVAILABLE', 'Bolna API configuration is missing.');
  const result = await fetchJson(`https://api.bolna.ai/executions/${id}`, {
    headers: { Authorization: `Bearer ${config.BOLNA_API_KEY}` },
  });
  if (!z.object({ id: z.literal(id) }).safeParse(result).success)
    throw new HttpError(502, 'UPSTREAM_ERROR', 'Execution ID mismatch.');
  return result;
};
