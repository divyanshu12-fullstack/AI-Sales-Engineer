import type { IntegrationId, LivenessResponse, ReadinessResponse } from '@asterbyte/contracts';
import type { Env } from '../../config/env.js';

const requirements: { id: IntegrationId; variables: (keyof Env)[] }[] = [
  {
    id: 'supabase',
    variables: ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY'],
  },
  {
    id: 'bolna',
    variables: ['BOLNA_API_KEY', 'BOLNA_AGENT_ID', 'BOLNA_TOOL_AUTH_TOKEN', 'BOLNA_WEBHOOK_SECRET'],
  },
  { id: 'llm', variables: ['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_MODEL'] },
  { id: 'embeddings', variables: ['EMBEDDING_PROVIDER', 'EMBEDDING_API_KEY', 'EMBEDDING_MODEL'] },
  {
    id: 'calendar',
    variables: [
      'CALENDAR_PROVIDER',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_REFRESH_TOKEN',
      'GOOGLE_CALENDAR_ID',
      'GOOGLE_CALENDAR_TIMEZONE',
    ],
  },
  { id: 'resend', variables: ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'] },
  { id: 'public_callbacks', variables: ['PUBLIC_API_BASE_URL'] },
];

export const getLiveness = (): LivenessResponse => ({
  data: { status: 'ok', service: 'asterbyte-api' },
});

export const getReadiness = (config: Env): ReadinessResponse => ({
  data: {
    status: 'not_ready',
    integrations: requirements.map(({ id, variables }) => {
      const missingVariables = variables.filter((name) => config[name] === undefined);
      return {
        id,
        status: 'unavailable',
        configuration: missingVariables.length === 0 ? 'present' : 'missing',
        verification: 'not_checked',
        missingVariables,
        reason:
          missingVariables.length > 0
            ? 'Required configuration is missing. End-to-end capability remains unavailable.'
            : 'Configuration is present. This inventory does not verify or enable end-to-end capability.',
      };
    }),
  },
});
