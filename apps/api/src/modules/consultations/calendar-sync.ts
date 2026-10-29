import { z } from 'zod';
import type { Logger } from 'pino';
import type { Env } from '../../config/env.js';
import { Database } from '../../lib/database.js';
import { isDemoAddress } from './email.js';
import {
  CalendarSyncError,
  GoogleCalendar,
  isGoogleCalendarConfigured,
} from './google-calendar.js';

const jobSchema = z.object({
  id: z.uuid(),
  payload: z.object({ meeting_id: z.uuid(), template: z.literal('meeting_calendar_sync') }),
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
  employees: z.object({ full_name: z.string() }).nullable(),
});
const contactSchema = z.object({ email_normalized: z.string().nullable() });
const jobIdSchema = z.array(z.object({ id: z.uuid() }));

export class MeetingCalendarSync {
  private busy = false;
  readonly database: Database;
  private readonly calendar: GoogleCalendar;

  constructor(
    private readonly config: Env,
    private readonly logger: Logger,
  ) {
    this.database = new Database(config);
    this.calendar = new GoogleCalendar(config);
  }

  async dispatch(jobId?: string): Promise<void> {
    if (!isGoogleCalendarConfigured(this.config)) return;
    const jobs = z
      .array(jobSchema)
      .parse(await this.database.rpc('claim_meeting_calendar', { p_job_id: jobId ?? null }));
    const job = jobs[0];
    if (!job) return;

    let code: string;
    let retryable: boolean;
    try {
      const meetings = z
        .array(meetingSchema)
        .parse(
          await this.database.request(
            `meetings?select=id,code,title,requested_start_at,duration_minutes,timezone,status,contact_id,employees(full_name)&id=eq.${job.payload.meeting_id}&limit=1`,
          ),
        );
      const meeting = meetings[0];
      if (!meeting || meeting.status !== 'confirmed') {
        throw new CalendarSyncError('MEETING_NOT_CONFIRMED', false);
      }
      const contacts = z
        .array(contactSchema)
        .parse(
          await this.database.request(
            `contacts?select=email_normalized&id=eq.${meeting.contact_id}&limit=1`,
          ),
        );
      const attendeeEmail = contacts[0]?.email_normalized;
      if (
        !attendeeEmail ||
        !z.email().safeParse(attendeeEmail).success ||
        isDemoAddress(attendeeEmail)
      )
        throw new CalendarSyncError('CALENDAR_ATTENDEE_INVALID', false);

      const event = await this.calendar.createOrFindEvent({
        id: meeting.id,
        title: meeting.title,
        startAt: meeting.requested_start_at,
        durationMinutes: meeting.duration_minutes,
        timezone: meeting.timezone || this.config.GOOGLE_CALENDAR_TIMEZONE,
        consultantName: meeting.employees?.full_name ?? 'the AsterByte team',
        reference: meeting.code,
        attendeeEmail,
      });
      await this.database.rpc('complete_meeting_calendar', {
        p_job_id: job.id,
        p_meeting_id: meeting.id,
        p_event_id: event.id,
        p_calendar_url: event.eventUrl,
        p_meet_url: event.meetUrl,
      });
      return;
    } catch (error) {
      const failure =
        error instanceof CalendarSyncError
          ? error
          : new CalendarSyncError('CALENDAR_SYNC_FAILED', true);
      code = failure.code;
      retryable = failure.retryable;
    }

    await this.database.rpc('fail_meeting_calendar', {
      p_job_id: job.id,
      p_meeting_id: job.payload.meeting_id,
      p_error_code: code,
      p_retryable: retryable,
    });
    this.logger.warn(
      { event: 'meeting_calendar_sync_failed', jobId: job.id, code, retryable },
      'Confirmed consultation is saved; Calendar sync will be retried or needs setup.',
    );
  }

  async dispatchForMeeting(meetingId: string): Promise<void> {
    if (!isGoogleCalendarConfigured(this.config)) return;
    const jobs = jobIdSchema.parse(
      await this.database.request(
        `integration_jobs?select=id&dedupe_key=eq.meeting:calendar:${meetingId}&status=in.(pending,failed)&limit=1`,
      ),
    );
    if (jobs[0]) await this.dispatch(jobs[0].id);
  }

  async runBatch(): Promise<void> {
    if (this.busy || !isGoogleCalendarConfigured(this.config)) return;
    this.busy = true;
    try {
      for (let index = 0; index < 3; index++) await this.dispatch();
    } catch {
      this.logger.warn(
        { event: 'meeting_calendar_worker_unavailable' },
        'Calendar jobs remain queued and will be retried.',
      );
    } finally {
      this.busy = false;
    }
  }
}

export const startMeetingCalendarWorker = (config: Env, logger: Logger) => {
  if (!config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY || !isGoogleCalendarConfigured(config))
    return () => {};
  const sync = new MeetingCalendarSync(config, logger);
  const timer = setInterval(() => {
    void sync.runBatch();
  }, 15_000);
  timer.unref();
  return () => clearInterval(timer);
};
