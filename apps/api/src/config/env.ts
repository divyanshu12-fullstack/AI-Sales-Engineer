import { fileURLToPath } from 'node:url';
import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

const isHttpOrigin = (value: string): boolean => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    ['http:', 'https:'].includes(url.protocol) &&
    url.username === '' &&
    url.password === '' &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === ''
  );
};

const originSchema = z
  .string()
  .refine(isHttpOrigin, 'Expected an HTTP(S) origin without credentials, path, query or fragment.')
  .transform((value) => new URL(value).origin);

const optionalText = z.string().min(1).optional();
const optionalSecret = z.string().min(32).optional();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_ORIGIN: originSchema.default('http://127.0.0.1:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10000).default(120),
  SUPABASE_URL: originSchema.optional(),
  SUPABASE_PUBLISHABLE_KEY: optionalText,
  SUPABASE_SECRET_KEY: optionalText,
  BOLNA_API_KEY: optionalText,
  BOLNA_AGENT_ID: z.uuid().optional(),
  BOLNA_CALL_CHANNEL: z.enum(['browser', 'phone']).optional(),
  BOLNA_WEB_CALL_ENABLED: z.enum(['true', 'false']).default('true'),
  BOLNA_SESSION_RATE_LIMIT: z.coerce.number().int().min(1).max(10).default(3),
  BOLNA_TOOL_AUTH_TOKEN: optionalSecret,
  BOLNA_WEBHOOK_SECRET: optionalSecret,
  LLM_PROVIDER: optionalText,
  LLM_API_KEY: optionalText,
  LLM_MODEL: optionalText,
  EMBEDDING_PROVIDER: optionalText,
  EMBEDDING_API_KEY: optionalText,
  EMBEDDING_MODEL: optionalText,
  CALENDAR_PROVIDER: z.literal('calcom').optional(),
  CALCOM_API_KEY: optionalText,
  CALCOM_EVENT_TYPE_ID: z.coerce.number().int().positive().optional(),
  RESEND_API_KEY: optionalText,
  RESEND_FROM_EMAIL: z.email().optional(),
  PUBLIC_API_BASE_URL: originSchema
    .refine((value) => value.startsWith('https://'), 'Public callbacks require HTTPS.')
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

export class ConfigurationError extends Error {
  constructor(fields: string[]) {
    // Deliberately exclude invalid values: an environment issue may contain a secret.
    super(`Invalid environment configuration: ${[...new Set(fields)].join(', ')}.`);
    this.name = 'ConfigurationError';
  }
}

export const parseEnv = (source: Record<string, string | undefined>): Env => {
  const normalized = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, value?.trim() || undefined]),
  );
  const result = envSchema.safeParse(normalized);

  if (!result.success) {
    throw new ConfigurationError(result.error.issues.map((issue) => issue.path.join('.')));
  }

  if (
    result.data.BOLNA_TOOL_AUTH_TOKEN &&
    result.data.BOLNA_TOOL_AUTH_TOKEN === result.data.BOLNA_WEBHOOK_SECRET
  ) {
    throw new ConfigurationError(['BOLNA_TOOL_AUTH_TOKEN', 'BOLNA_WEBHOOK_SECRET']);
  }

  return result.data;
};

export const loadEnvironment = (): Env => {
  const result = loadDotEnv({
    path: fileURLToPath(new URL('../../../../.env', import.meta.url)),
    quiet: true,
  });

  if (result.error && !('code' in result.error && result.error.code === 'ENOENT')) {
    throw new ConfigurationError(['.env']);
  }

  return parseEnv(process.env);
};
