import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Env } from '../../config/env.js';

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});
const eventSchema = z.object({
  id: z.string().min(1),
  htmlLink: z.string().url(),
  conferenceData: z
    .object({
      createRequest: z
        .object({ status: z.object({ statusCode: z.string() }).optional() })
        .optional(),
      entryPoints: z
        .array(z.object({ entryPointType: z.string().optional(), uri: z.string().url() }))
        .optional(),
    })
    .optional(),
});

export type CalendarEventInput = {
  id: string;
  title: string;
  startAt: string;
  durationMinutes: number;
  timezone: string;
  consultantName: string;
  reference: string;
  attendeeEmail: string;
};

export type CalendarEventResult = {
  id: string;
  eventUrl: string;
  meetUrl: string;
};

export class CalendarSyncError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'CalendarSyncError';
  }
}

export const isGoogleCalendarConfigured = (config: Env): boolean =>
  config.CALENDAR_PROVIDER === 'google' &&
  Boolean(
    config.GOOGLE_CLIENT_ID &&
    config.GOOGLE_CLIENT_SECRET &&
    config.GOOGLE_REFRESH_TOKEN &&
    config.GOOGLE_CALENDAR_ID,
  );

const isGoogleEventUrl = (value: string): boolean => {
  const url = new URL(value);
  return (
    url.protocol === 'https:' &&
    ['www.google.com', 'calendar.google.com'].includes(url.hostname) &&
    url.pathname.startsWith('/calendar/')
  );
};

const isGoogleMeetUrl = (value: string): boolean => {
  const url = new URL(value);
  return url.protocol === 'https:' && url.hostname === 'meet.google.com' && url.pathname.length > 1;
};

const jsonOrThrow = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    throw new CalendarSyncError('GOOGLE_RESPONSE_INVALID', true);
  }
};

const providerError = (status: number, auth = false): CalendarSyncError => {
  if (status === 429) return new CalendarSyncError('GOOGLE_RATE_LIMITED', true);
  if (status >= 500) return new CalendarSyncError('GOOGLE_UNAVAILABLE', true);
  return new CalendarSyncError(auth ? 'GOOGLE_AUTH_REJECTED' : 'GOOGLE_CALENDAR_REJECTED', false);
};

const eventIdFor = (meetingId: string): string =>
  `a${createHash('sha256').update(`asterbyte-meeting:${meetingId}`).digest('hex')}`;

export class GoogleCalendar {
  private accessToken: string | undefined;
  private accessTokenExpiresAt = 0;

  constructor(private readonly config: Env) {}

  private async token(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 60_000)
      return this.accessToken;

    const clientId = this.config.GOOGLE_CLIENT_ID;
    const clientSecret = this.config.GOOGLE_CLIENT_SECRET;
    const refreshToken = this.config.GOOGLE_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken)
      throw new CalendarSyncError('CALENDAR_NOT_CONFIGURED', false);

    let response: Response;
    try {
      response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
      });
    } catch {
      throw new CalendarSyncError('GOOGLE_AUTH_UNAVAILABLE', true);
    }
    if (!response.ok) throw providerError(response.status, true);
    const token = tokenSchema.safeParse(await jsonOrThrow(response));
    if (!token.success) throw new CalendarSyncError('GOOGLE_TOKEN_INVALID', true);
    this.accessToken = token.data.access_token;
    this.accessTokenExpiresAt = Date.now() + token.data.expires_in * 1000;
    return this.accessToken;
  }

  private async request(url: URL, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
        headers: { ...init.headers, Authorization: `Bearer ${await this.token()}` },
      });
    } catch (error) {
      if (error instanceof CalendarSyncError) throw error;
      throw new CalendarSyncError('GOOGLE_UNAVAILABLE', true);
    }
    return response;
  }

  async createOrFindEvent(meeting: CalendarEventInput): Promise<CalendarEventResult> {
    if (!isGoogleCalendarConfigured(this.config))
      throw new CalendarSyncError('CALENDAR_NOT_CONFIGURED', false);
    const calendarId = this.config.GOOGLE_CALENDAR_ID;
    if (!calendarId) throw new CalendarSyncError('CALENDAR_NOT_CONFIGURED', false);
    const start = Date.parse(meeting.startAt);
    if (!Number.isFinite(start)) throw new CalendarSyncError('MEETING_TIME_INVALID', false);
    const eventId = eventIdFor(meeting.id);
    const baseUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    const insertUrl = new URL(baseUrl);
    insertUrl.searchParams.set('conferenceDataVersion', '1');
    insertUrl.searchParams.set('sendUpdates', 'all');
    const payload = {
      id: eventId,
      summary: meeting.title,
      description: `Consultation with ${meeting.consultantName}\nReference: ${meeting.reference}`,
      start: { dateTime: new Date(start).toISOString(), timeZone: meeting.timezone },
      end: {
        dateTime: new Date(start + meeting.durationMinutes * 60_000).toISOString(),
        timeZone: meeting.timezone,
      },
      attendees: [{ email: meeting.attendeeEmail }],
      conferenceData: {
        createRequest: {
          requestId: `meeting-${createHash('sha256').update(meeting.id).digest('hex').slice(0, 32)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    };
    let response = await this.request(insertUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.status === 409) {
      const getUrl = new URL(`${baseUrl.toString().replace(/\/$/, '')}/${eventId}`);
      response = await this.request(getUrl, { method: 'GET' });
      if (response.status === 404) throw new CalendarSyncError('GOOGLE_EVENT_NOT_FOUND', true);
    } else if (!response.ok) {
      throw providerError(response.status);
    }
    if (!response.ok) throw providerError(response.status);

    const parsed = eventSchema.safeParse(await jsonOrThrow(response));
    if (!parsed.success || parsed.data.id !== eventId || !isGoogleEventUrl(parsed.data.htmlLink))
      throw new CalendarSyncError('GOOGLE_EVENT_RESPONSE_INVALID', true);
    const conference = parsed.data.conferenceData;
    const conferenceStatus = conference?.createRequest?.status?.statusCode;
    if (conferenceStatus === 'failure')
      throw new CalendarSyncError('GOOGLE_MEET_CREATION_FAILED', false);
    const meetUrl = conference?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri;
    if (conferenceStatus === 'pending' || !meetUrl)
      throw new CalendarSyncError('GOOGLE_MEET_NOT_READY', true);
    if (!isGoogleMeetUrl(meetUrl)) throw new CalendarSyncError('GOOGLE_MEET_URL_INVALID', false);
    return { id: parsed.data.id, eventUrl: parsed.data.htmlLink, meetUrl };
  }
}
