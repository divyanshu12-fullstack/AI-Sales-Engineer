import { createHash, createHmac } from 'node:crypto';
import { z } from 'zod';
import type { Logger } from 'pino';
import type { Env } from '../../config/env.js';
import { Database } from '../../lib/database.js';
import { consultationDisplay } from './availability.js';
import { meetingCalendarEmailTemplate, meetingEmailTemplate } from './email-template.js';

const jobSchema = z.object({
  id: z.uuid(),
  dedupe_key: z.string(),
  attempts: z.number().int(),
  created_at: z.string(),
  payload: z.discriminatedUnion('template', [
    z.object({ meeting_id: z.uuid(), template: z.literal('meeting_confirmation') }),
    z.object({ meeting_id: z.uuid(), template: z.literal('meeting_calendar_confirmation') }),
  ]),
});
const meetingSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
  requested_start_at: z.string(),
  duration_minutes: z.number().int().positive(),
  timezone: z.string(),
  status: z.string(),
  contact_id: z.uuid(),
  provider: z.string().nullable(),
  calendar_event_url: z.string().nullable(),
  meet_url: z.string().nullable(),
  employees: z.object({ full_name: z.string() }).nullable(),
});
const contactSchema = z.object({
  email_normalized: z.string().nullable(),
});

const confirmationSecret = (config: Env): string => {
  const secret =
    config.MEETING_CONFIRMATION_SECRET ??
    config.SUPABASE_SECRET_KEY ??
    config.BOLNA_TOOL_AUTH_TOKEN;
  if (!secret) throw new Error('Confirmation secret unavailable');
  return secret;
};

// Deterministic capability: retries keep the same link, while only its hash is stored.
export const meetingConfirmationToken = (config: Env, meetingId: string): string =>
  createHmac('sha256', confirmationSecret(config)).update(`meeting:${meetingId}`).digest('hex');

export const confirmationBaseUrl = (config: Env): string =>
  config.PUBLIC_API_BASE_URL ?? `http://${config.HOST}:${config.PORT}`;

export class MeetingEmail {
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
      .parse(await this.database.rpc('claim_meeting_email', { job_id: jobId ?? null }));
    const job = jobs[0];
    if (!job) return;
    let code = 'EMAIL_PROVIDER_UNAVAILABLE';
    let terminal = false;
    try {
      const meetings = z
        .array(meetingSchema)
        .parse(
          await this.database.request(
            `meetings?select=id,code,title,requested_start_at,duration_minutes,timezone,status,contact_id,provider,calendar_event_url,meet_url,employees(full_name)&id=eq.${job.payload.meeting_id}&limit=1`,
          ),
        );
      const meeting = meetings[0];
      const calendarFollowUp = job.payload.template === 'meeting_calendar_confirmation';
      if (
        !meeting ||
        (calendarFollowUp
          ? meeting.status !== 'confirmed' ||
            meeting.provider !== 'google_calendar' ||
            !meeting.calendar_event_url ||
            !meeting.meet_url
          : meeting.status !== 'pending_confirmation')
      ) {
        code = 'MEETING_NOT_PENDING';
        terminal = true;
        throw new Error('Meeting is not ready for this email.');
      }
      const contacts = z
        .array(contactSchema)
        .parse(
          await this.database.request(
            `contacts?select=email_normalized&id=eq.${meeting.contact_id}&limit=1`,
          ),
        );
      const email = contacts[0]?.email_normalized;
      if (!email || !z.email().safeParse(email).success || isDemoAddress(email)) {
        code = 'EMAIL_RECIPIENT_INVALID';
        terminal = true;
        throw new Error('Invalid recipient');
      }
      if (!this.config.RESEND_API_KEY || !this.config.RESEND_FROM_EMAIL) {
        code = 'EMAIL_NOT_CONFIGURED';
        throw new Error('Mail unavailable');
      }
      if (Date.now() - Date.parse(job.created_at) > 23 * 60 * 60_000) {
        code = 'EMAIL_REVIEW_REQUIRED';
        terminal = true;
        throw new Error('Manual reconciliation required');
      }
      const commonTemplate = {
        reference: meeting.code,
        title: meeting.title,
        consultantName: meeting.employees?.full_name ?? 'the AsterByte team',
        displayTime: consultationDisplay(meeting.requested_start_at),
        durationMinutes: meeting.duration_minutes,
        timezone: meeting.timezone,
      };
      let template: ReturnType<typeof meetingEmailTemplate>;
      if (calendarFollowUp) {
        template = meetingCalendarEmailTemplate({
          ...commonTemplate,
          calendarUrl: meeting.calendar_event_url as string,
          meetUrl: meeting.meet_url as string,
        });
      } else {
        const token = meetingConfirmationToken(this.config, meeting.id);
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const confirmUrl = `${confirmationBaseUrl(this.config)}/api/meetings/confirmation?token=${encodeURIComponent(token)}`;
        const expiresAt = new Date(Date.now() + 7 * 86_400_000);
        await this.database.request(
          `meetings?id=eq.${meeting.id}`,
          {
            confirmation_token_sha256: tokenHash,
            confirmation_expires_at: expiresAt.toISOString(),
          },
          'PATCH',
        );
        template = meetingEmailTemplate({
          ...commonTemplate,
          confirmUrl,
          expiresOn: new Intl.DateTimeFormat('en-IN', {
            dateStyle: 'medium',
            timeZone: 'Asia/Kolkata',
          }).format(expiresAt),
        });
      }
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
        `meetings?id=eq.${meeting.id}`,
        calendarFollowUp
          ? { calendar_confirmation_sent_at: new Date().toISOString() }
          : { confirmation_sent_at: new Date().toISOString() },
        'PATCH',
      );
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
        { event: 'meeting_email_failed', jobId: job.id, code },
        'Consultation confirmation email was not confirmed accepted.',
      );
    }
  }

  async dispatchCalendarConfirmation(meetingId: string): Promise<void> {
    const jobs = z
      .array(z.object({ id: z.uuid() }))
      .parse(
        await this.database.request(
          `integration_jobs?select=id&dedupe_key=eq.meeting:calendar-confirmed:${meetingId}&status=in.(pending,failed)&limit=1`,
        ),
      );
    if (jobs[0]) await this.dispatch(jobs[0].id);
  }

  async runBatch(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let i = 0; i < 3; i++) await this.dispatch();
    } catch {
      this.logger.warn(
        { event: 'meeting_email_worker_unavailable' },
        'Consultation email jobs will be retried.',
      );
    } finally {
      this.busy = false;
    }
  }
}

export const isDemoAddress = (email: string): boolean =>
  /(?:^|@)(?:example\.(?:com|org|net)|example|invalid|test|localhost)$|\.(?:invalid|example|test|localhost)$/i.test(
    email,
  );

export const startMeetingEmailWorker = (config: Env, logger: Logger) => {
  if (
    config.SUPPORT_EMAIL_WORKER_ENABLED !== 'true' ||
    !config.SUPABASE_URL ||
    !config.SUPABASE_SECRET_KEY
  )
    return () => {};
  const mail = new MeetingEmail(config, logger);
  const timer = setInterval(() => {
    void mail.runBatch();
  }, 15_000);
  timer.unref();
  return () => clearInterval(timer);
};
