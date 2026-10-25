import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  supportLookupSchema,
  supportTicketInputSchema,
  supportUpdateSchema,
} from '@asterbyte/contracts';
import type { Env } from '../../config/env.js';
import type { Logger } from 'pino';
import { Database } from '../../lib/database.js';
import { HttpError } from '../../http/errors.js';
import { getExecution } from '../bolna/execution.js';
import { contentHash } from '../knowledge/chunks.js';
import { SupportEmail } from './email.js';

const validate = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new HttpError(400, 'INVALID_INPUT', 'Please check the support request details.');
  return r.data;
};
// A phone supplied as an LLM argument is never used. Re-fetch metadata from Bolna instead.
export const executionCaller = (input: unknown, agentId: string): string | null => {
  const r = z
    .object({
      agent_id: z.literal(agentId),
      created_at: z.iso.datetime({ offset: true }),
      status: z.string(),
      telephony_data: z
        .object({
          provider: z.string(),
          call_type: z.enum(['inbound', 'outbound']),
          from_number: z.string().nullish(),
          to_number: z.string().nullish(),
        })
        .nullish(),
    })
    .safeParse(input);
  if (
    !r.success ||
    !['in-progress', 'initiated', 'ringing'].includes(r.data.status) ||
    Date.now() - Date.parse(r.data.created_at) > 25 * 60_000 ||
    Date.parse(r.data.created_at) > Date.now() + 60_000
  )
    return null;
  const t = r.data.telephony_data;
  if (!t || t.provider === 'freeswitch') return null;
  const number = t.call_type === 'inbound' ? t.from_number : t.to_number;
  return number && /^\+[1-9][0-9]{7,14}$/.test(number) ? number : null;
};
export class Support {
  readonly database: Database;
  readonly mail: SupportEmail;
  constructor(
    private readonly config: Env,
    private readonly logger: Logger,
  ) {
    this.database = new Database(config);
    this.mail = new SupportEmail(config, logger);
  }
  private async audit<T>(
    name: string,
    action: () => Promise<T>,
    ticketId: (r: T) => string | null = () => null,
  ): Promise<T> {
    const id = randomUUID();
    await this.database.request('tool_executions', { id, tool_name: name, status: 'started' });
    try {
      const result = await action();
      await this.database.request(
        `tool_executions?id=eq.${id}`,
        { status: 'succeeded', finished_at: new Date().toISOString(), ticket_id: ticketId(result) },
        'PATCH',
      );
      return result;
    } catch (error) {
      await this.database
        .request(
          `tool_executions?id=eq.${id}`,
          {
            status: 'failed',
            finished_at: new Date().toISOString(),
            error_code: error instanceof HttpError ? error.code : 'INTERNAL_ERROR',
          },
          'PATCH',
        )
        .catch(() => {
          this.logger.error(
            { event: 'support_audit_failed', toolInvocationId: id },
            'Support tool audit unavailable.',
          );
        });
      throw error;
    }
  }
  async lookup(input: unknown) {
    const details = validate(supportLookupSchema, input);
    return this.audit('lookup_support_project', async () => {
      let phone: string | null = null;
      if (details.execution_id && this.config.BOLNA_AGENT_ID) {
        try {
          phone = executionCaller(
            await getExecution(details.execution_id, this.config),
            this.config.BOLNA_AGENT_ID,
          );
        } catch {
          /* Fall back to demo codes, not a claimed phone. */
        }
      }
      const token = randomBytes(32).toString('hex');
      const result = z
        .discriminatedUnion('status', [
          z.object({ status: z.literal('customer_code_required') }),
          z.object({
            status: z.literal('matched'),
            project_name: z.string(),
            project_code: z.string(),
            identity_status: z.enum(['demo_code_match', 'caller_number_match']),
            scope: z.literal('demo_support_intake_only'),
          }),
        ])
        .parse(
          await this.database.rpc('lookup_demo_support', {
            project_code: details.project_code,
            customer_code: details.customer_code,
            caller_phone: phone ?? '',
            token_hash: contentHash(token),
          }),
        );
      return result.status === 'matched' ? { ...result, support_token: token } : result;
    });
  }
  async create(input: unknown) {
    const { support_token, submission_key, ...details } = validate(supportTicketInputSchema, input);
    if (!this.config.BOLNA_AGENT_ID)
      throw new HttpError(503, 'INTEGRATION_UNAVAILABLE', 'Support intake is unavailable.');
    return this.audit(
      'create_support_ticket',
      async () => {
        const result = z
          .object({ ticket_id: z.uuid(), reference: z.string(), duplicate: z.boolean() })
          .parse(
            await this.database.rpc('record_support_ticket', {
              submission: `${this.config.BOLNA_AGENT_ID}:${submission_key}`,
              payload_hash: contentHash(JSON.stringify(details)),
              grant_hash: contentHash(support_token),
              details,
            }),
          );
        await this.dispatchTicket(result.ticket_id);
        return { ...result, email_status: await this.emailStatus(result.ticket_id) };
      },
      (r) => r.ticket_id,
    );
  }
  async dispatchTicket(id: string) {
    try {
      const jobs = z
        .array(z.object({ id: z.uuid() }))
        .parse(
          await this.database.request(
            `integration_jobs?select=id&payload->>ticket_id=eq.${id}&job_type=eq.send_email&status=in.(pending,failed)&order=created_at.desc&limit=2`,
          ),
        );
      for (const job of jobs) await this.mail.dispatch(job.id);
    } catch {
      this.logger.warn(
        { event: 'support_email_pending', ticketId: id },
        'Ticket saved; its email remains queued or unconfirmed.',
      );
    }
  }
  private async emailStatus(id: string) {
    try {
      const jobs = z
        .array(z.object({ status: z.string(), last_error_code: z.string().nullable() }))
        .parse(
          await this.database.request(
            `integration_jobs?select=status,last_error_code&dedupe_key=eq.support:ack:${id}&limit=1`,
          ),
        );
      const job = jobs[0];
      return job?.status === 'succeeded'
        ? 'accepted'
        : job?.status === 'failed'
          ? 'failed'
          : 'queued';
    } catch {
      return 'queued';
    }
  }
  async update(id: string, adminId: string, input: unknown) {
    validate(z.uuid(), id);
    const body = validate(supportUpdateSchema, input);
    const result = z.object({ ticket_id: z.uuid(), changed: z.boolean() }).parse(
      await this.database.rpc('update_support_ticket', {
        ticket: id,
        actor: adminId,
        new_status: body.status,
        resolution: body.resolution,
      }),
    );
    await this.dispatchTicket(id);
    return result;
  }
  async retryEmail(id: string) {
    validate(z.uuid(), id);
    const jobs = z
      .array(z.object({ id: z.uuid(), created_at: z.string() }))
      .parse(
        await this.database.request(
          `integration_jobs?select=id,created_at&id=eq.${id}&job_type=eq.send_email&status=eq.failed&payload->>template=in.(support_acknowledgement,support_resolution)`,
        ),
      );
    const job = jobs[0];
    if (!job) throw new HttpError(409, 'CONFLICT', 'This delivery is not available for retry.');
    if (Date.now() - Date.parse(job.created_at) > 23 * 60 * 60_000)
      throw new HttpError(
        409,
        'CONFLICT',
        'This old delivery needs manual reconciliation before another send.',
      );
    await this.database.request(
      `integration_jobs?id=eq.${id}&status=eq.failed`,
      {
        status: 'pending',
        attempts: 0,
        available_at: new Date().toISOString(),
        last_error_code: null,
      },
      'PATCH',
    );
    await this.mail.dispatch(id);
    return { accepted: true };
  }
}
