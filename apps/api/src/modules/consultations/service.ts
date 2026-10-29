import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Logger } from 'pino';
import {
  consultationAvailabilityInputSchema,
  consultationAvailabilityResultSchema,
  consultationInputSchema,
  consultationResultSchema,
  meetingConfirmationResultSchema,
} from '@asterbyte/contracts';
import type { Env } from '../../config/env.js';
import { HttpError } from '../../http/errors.js';
import { Database } from '../../lib/database.js';
import { contentHash } from '../knowledge/chunks.js';
import {
  availableSlots,
  consultationDateKey,
  consultationDisplay,
  consultationRules,
} from './availability.js';
import type { BusyMeeting, Consultant } from './availability.js';
import { MeetingEmail } from './email.js';
import { MeetingCalendarSync } from './calendar-sync.js';
import { isGoogleCalendarConfigured } from './google-calendar.js';

const validate = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new HttpError(400, 'INVALID_INPUT', 'Request fields are missing or invalid.');
  return result.data;
};
const consultantSchema = z.object({
  id: z.uuid(),
  full_name: z.string(),
  team: z.string(),
  role_title: z.string(),
  skills: z.array(z.string()),
  consultation_topics: z.array(z.string()),
});
const meetingSchema = z.object({
  consultant_employee_id: z.uuid(),
  requested_start_at: z.string(),
  duration_minutes: z.number(),
  status: z.string(),
  confirmation_expires_at: z.string().nullable(),
});
const storedMeetingSchema = z.object({
  status: z.literal('scheduled'),
  meeting_id: z.uuid(),
  reference: z.string(),
  start_at: z.string(),
  consultant_name: z.string(),
  duplicate: z.boolean(),
});
const emailRequiredSchema = z.object({
  status: z.literal('email_required'),
  inquiry_reference: z.string(),
});
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
const DAY_MS = 86_400_000;

export class Consultations {
  readonly database: Database;
  readonly mail: MeetingEmail;
  readonly calendar: MeetingCalendarSync;
  constructor(
    private readonly config: Env,
    private readonly logger: Logger,
  ) {
    this.database = new Database(config);
    this.mail = new MeetingEmail(config, logger);
    this.calendar = new MeetingCalendarSync(config, logger);
  }

  private async audit<T>(
    name: string,
    action: () => Promise<T>,
    meetingId: (result: T) => string | null = () => null,
  ): Promise<T> {
    const id = randomUUID();
    await this.database.request('tool_executions', { id, tool_name: name, status: 'started' });
    try {
      const result = await action();
      await this.database.request(
        `tool_executions?id=eq.${id}`,
        {
          status: 'succeeded',
          finished_at: new Date().toISOString(),
          meeting_id: meetingId(result),
        },
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
            { event: 'consultation_audit_failed', toolInvocationId: id },
            'Consultation tool audit unavailable.',
          );
        });
      throw error;
    }
  }

  private async loadAvailability(now: Date) {
    const from = now.toISOString();
    const to = new Date(
      now.getTime() + (consultationRules.lookaheadDays + 1) * DAY_MS,
    ).toISOString();
    const [people, meetings] = await Promise.all([
      this.database.request(
        'employees?select=id,full_name,team,role_title,skills,consultation_topics&is_active=eq.true&order=full_name',
      ),
      this.database.request(
        `meetings?select=consultant_employee_id,requested_start_at,duration_minutes,status,confirmation_expires_at&status=in.(pending_confirmation,confirmed)&requested_start_at=gte.${encodeURIComponent(from)}&requested_start_at=lte.${encodeURIComponent(to)}&limit=500`,
      ),
    ]);
    return {
      consultants: z.array(consultantSchema).parse(people) satisfies Consultant[],
      meetings: z.array(meetingSchema).parse(meetings) satisfies BusyMeeting[],
    };
  }

  private async slots(input: z.infer<typeof consultationAvailabilityInputSchema>, maxSlots = 3) {
    const { consultants, meetings } = await this.loadAvailability(new Date());
    return availableSlots({
      now: new Date(),
      topic: input.topic,
      preferredDate: input.preferred_date,
      preferredPeriod: input.preferred_period,
      consultants,
      meetings,
      maxSlots,
    });
  }

  async availability(input: unknown) {
    const details = validate(consultationAvailabilityInputSchema, input);
    return this.audit('check_consultation_availability', async () => {
      const slots = await this.slots(details);
      return consultationAvailabilityResultSchema.parse({
        status: slots.length ? 'available' : 'unavailable',
        timezone: consultationRules.timezone,
        duration_minutes: consultationRules.durationMinutes,
        slots,
      });
    });
  }

  async schedule(input: unknown) {
    const details = validate(consultationInputSchema, input);
    if (!this.config.BOLNA_AGENT_ID)
      throw new HttpError(
        503,
        'INTEGRATION_UNAVAILABLE',
        'Consultation scheduling is unavailable.',
      );
    return this.audit(
      'schedule_consultation',
      async () => {
        // Recompute the offered slots and require an exact match before the transactional insert.
        const offered = await this.slots(
          {
            topic: details.topic,
            preferred_date: consultationDateKey(details.start_at),
            preferred_period: 'any',
          },
          99,
        );
        const chosen = offered.find(
          (slot) =>
            slot.consultant_id === details.consultant_id &&
            Date.parse(slot.start_at) === Date.parse(details.start_at),
        );
        if (!chosen) {
          const alternatives = await this.slots(
            {
              topic: details.topic,
              preferred_date: '',
              preferred_period: 'any',
            },
            3,
          );
          return consultationResultSchema.parse({
            status: 'slot_unavailable',
            slots: alternatives,
          });
        }
        const raw = await this.database.rpc('record_consultation', {
          submission: `${this.config.BOLNA_AGENT_ID}:${details.submission_key}`,
          payload_hash: contentHash(JSON.stringify(details)),
          inquiry_reference: details.inquiry_reference,
          consultant: details.consultant_id,
          start_at: details.start_at,
          email: details.email,
          details: { confirmed: details.confirmed, notes: details.notes },
        });
        const result = z.union([storedMeetingSchema, emailRequiredSchema]).parse(raw);
        if (result.status === 'email_required')
          return consultationResultSchema.parse({
            status: 'email_required',
            inquiry_reference: result.inquiry_reference,
          });
        await this.dispatchMeeting(result.meeting_id);
        return consultationResultSchema.parse({
          status: 'scheduled',
          meeting_id: result.meeting_id,
          reference: result.reference,
          inquiry_reference: details.inquiry_reference,
          start_at: result.start_at,
          display: consultationDisplay(result.start_at),
          duration_minutes: consultationRules.durationMinutes,
          timezone: consultationRules.timezone,
          consultant_name: result.consultant_name,
          duplicate: result.duplicate,
          confirmation: 'pending',
          email_status: await this.emailStatus(result.meeting_id),
        });
      },
      (result) => (result.status === 'scheduled' ? result.meeting_id : null),
    );
  }

  private async dispatchMeeting(id: string) {
    try {
      const jobs = z
        .array(z.object({ id: z.uuid() }))
        .parse(
          await this.database.request(
            `integration_jobs?select=id&dedupe_key=eq.meeting:confirmation:${id}&job_type=eq.send_email&status=in.(pending,failed)&limit=1`,
          ),
        );
      if (jobs[0]) await this.mail.dispatch(jobs[0].id);
    } catch {
      this.logger.warn(
        { event: 'meeting_email_pending', meetingId: id },
        'Consultation saved; its confirmation email remains queued or unconfirmed.',
      );
    }
  }

  private async emailStatus(id: string) {
    try {
      const jobs = z
        .array(z.object({ status: z.string(), last_error_code: z.string().nullable() }))
        .parse(
          await this.database.request(
            `integration_jobs?select=status,last_error_code&dedupe_key=eq.meeting:confirmation:${id}&limit=1`,
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

  async getConfirmation(token: string) {
    if (!/^[0-9a-f]{64}$/.test(token))
      return meetingConfirmationResultSchema.parse({ status: 'invalid' });
    return meetingConfirmationResultSchema.parse(
      await this.database.rpc('get_meeting_confirmation', { token_hash: hashToken(token) }),
    );
  }

  async confirm(token: string) {
    if (!/^[0-9a-f]{64}$/.test(token))
      return meetingConfirmationResultSchema.parse({ status: 'invalid' });
    const result = meetingConfirmationResultSchema.parse(
      await this.database.rpc('confirm_meeting', { token_hash: hashToken(token) }),
    );
    if (result.status === 'confirmed' && result.meeting_id) {
      void this.dispatchCalendarAndEmail(result.meeting_id);
    }
    return result;
  }

  private async dispatchCalendarAndEmail(meetingId: string) {
    if (!isGoogleCalendarConfigured(this.config)) return;
    try {
      await this.calendar.dispatchForMeeting(meetingId);
      await this.mail.dispatchCalendarConfirmation(meetingId);
    } catch {
      this.logger.warn(
        { event: 'meeting_calendar_dispatch_deferred', meetingId },
        'Consultation is confirmed; Calendar and follow-up email remain queued.',
      );
    }
  }
}
