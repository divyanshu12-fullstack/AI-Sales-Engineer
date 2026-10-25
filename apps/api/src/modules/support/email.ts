import { z } from 'zod';
import type { Logger } from 'pino';
import type { Env } from '../../config/env.js';
import { Database } from '../../lib/database.js';
import { supportEmailTemplate } from './email-template.js';

const jobSchema = z.object({
  id: z.uuid(),
  dedupe_key: z.string(),
  attempts: z.number().int(),
  created_at: z.string(),
  payload: z.object({
    ticket_id: z.uuid(),
    template: z.enum(['support_acknowledgement', 'support_resolution']),
    resolution: z.string().optional(),
  }),
});
const recipientSchema = z.object({
  code: z.string(),
  title: z.string(),
  description: z.string(),
  contacts: z.object({
    email_normalized: z.string().nullable(),
    support_email_enabled: z.boolean(),
  }),
});

export class SupportEmail {
  private busy = false;
  readonly database: Database;
  constructor(
    private readonly config: Env,
    private readonly logger: Logger,
  ) {
    this.database = new Database(config);
  }
  async dispatch(jobId?: string): Promise<void> {
    const jobs = z
      .array(jobSchema)
      .parse(await this.database.rpc('claim_support_email', { job_id: jobId ?? null }));
    const job = jobs[0];
    if (!job) return;
    let code = 'EMAIL_PROVIDER_UNAVAILABLE';
    let terminal = false;
    try {
      const records = z
        .array(recipientSchema)
        .parse(
          await this.database.request(
            `support_ticket_dashboard?select=code,title,description,contacts&id=eq.${job.payload.ticket_id}&limit=1`,
          ),
        );
      const ticket = records[0];
      if (!ticket || !ticket.contacts.support_email_enabled) {
        code = 'EMAIL_RECIPIENT_DISABLED';
        terminal = true;
        throw new Error('Recipient not opted in');
      }
      const email = ticket.contacts.email_normalized;
      if (
        !email ||
        !z.email().safeParse(email).success ||
        /\.(invalid|example|test|localhost)$/i.test(email)
      ) {
        code = 'EMAIL_RECIPIENT_INVALID';
        terminal = true;
        throw new Error('Invalid recipient');
      }
      if (!this.config.RESEND_API_KEY || !this.config.RESEND_FROM_EMAIL) {
        code = 'EMAIL_NOT_CONFIGURED';
        throw new Error('Mail unavailable');
      }
      // Resend retains idempotency keys for 24h. Never automatically resend an ambiguous older job.
      if (Date.now() - Date.parse(job.created_at) > 23 * 60 * 60_000) {
        code = 'EMAIL_REVIEW_REQUIRED';
        terminal = true;
        throw new Error('Manual reconciliation required');
      }
      const resolved = job.payload.template === 'support_resolution';
      const template = supportEmailTemplate({
        reference: ticket.code,
        title: ticket.title,
        description: ticket.description,
        ...(resolved ? { resolution: job.payload.resolution ?? '' } : {}),
      });
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
        headers: {
          Authorization: `Bearer ${this.config.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': job.dedupe_key,
        },
        body: JSON.stringify({
          from: `AsterByte Solutions <${this.config.RESEND_FROM_EMAIL}>`,
          to: [email],
          ...template,
        }),
      });
      if (!response.ok) {
        code = response.status === 429 ? 'EMAIL_RATE_LIMITED' : 'EMAIL_PROVIDER_REJECTED';
        terminal = response.status >= 400 && response.status < 500 && response.status !== 429;
        throw new Error('Provider rejected email');
      }
      const result = z.object({ id: z.string().min(1) }).parse(await response.json());
      await this.database.request(
        `integration_jobs?id=eq.${job.id}`,
        {
          status: 'succeeded',
          provider_message_id: result.id,
          last_error_code: null,
          locked_until: null,
        },
        'PATCH',
      );
      return;
    } catch {
      // The ticket stays successful even if its independently persisted email delivery fails.
      await this.database.request(
        `integration_jobs?id=eq.${job.id}`,
        {
          status: 'failed',
          last_error_code: code,
          locked_until: null,
          ...(terminal ? { attempts: 5 } : {}),
          available_at: new Date(
            Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** job.attempts),
          ).toISOString(),
        },
        'PATCH',
      );
      this.logger.warn(
        { event: 'support_email_failed', jobId: job.id, code },
        'Support email was not confirmed accepted.',
      );
    }
  }
  async runBatch(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let i = 0; i < 3; i++) await this.dispatch();
    } catch {
      this.logger.warn(
        { event: 'support_email_worker_unavailable' },
        'Support email jobs will be retried.',
      );
    } finally {
      this.busy = false;
    }
  }
}
export const startSupportEmailWorker = (config: Env, logger: Logger) => {
  if (
    config.SUPPORT_EMAIL_WORKER_ENABLED !== 'true' ||
    !config.SUPABASE_URL ||
    !config.SUPABASE_SECRET_KEY
  )
    return () => {};
  const mail = new SupportEmail(config, logger);
  const timer = setInterval(() => {
    void mail.runBatch();
  }, 15_000);
  timer.unref();
  return () => clearInterval(timer);
};
