import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../src/config/env.js';
import { GoogleCalendar } from '../src/modules/consultations/google-calendar.js';
import type { CalendarSyncError } from '../src/modules/consultations/google-calendar.js';

const config = parseEnv({
  CALENDAR_PROVIDER: 'google',
  GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  GOOGLE_REFRESH_TOKEN: 'test-refresh-token',
  GOOGLE_CALENDAR_ID: 'primary',
});
const meeting = {
  id: '00000000-0000-4000-8000-000000000123',
  title: 'Consultation · appointment portal',
  startAt: '2026-11-04T05:30:00.000Z',
  durationMinutes: 30,
  timezone: 'Asia/Kolkata',
  consultantName: 'Demo Consultant',
  reference: 'MTG-TEST123',
  attendeeEmail: 'customer@resend.dev',
};
const eventId = `a${createHash('sha256').update(`asterbyte-meeting:${meeting.id}`).digest('hex')}`;
const googleEvent = {
  id: eventId,
  htmlLink: 'https://www.google.com/calendar/event?eid=demo-event',
  conferenceData: {
    createRequest: { status: { statusCode: 'success' } },
    entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }],
  },
};
const mockFetch = (...responses: Response[]) => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = vi.fn((input: string | URL, init?: RequestInit) => {
    requests.push({ url: String(input), ...(init ? { init } : {}) });
    return Promise.resolve(responses.shift() ?? new Response());
  });
  return { fetch, requests };
};
const bodyText = (body: unknown): string => {
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  throw new Error('Expected a string request body.');
};

afterEach(() => vi.unstubAllGlobals());

describe('Google Calendar server integration', () => {
  it('exchanges a private refresh token and creates an event with a Meet request', async () => {
    const { fetch: fetchMock, requests } = mockFetch(
      new Response(JSON.stringify({ access_token: 'google-access-token', expires_in: 3600 })),
      new Response(JSON.stringify(googleEvent)),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new GoogleCalendar(config).createOrFindEvent(meeting);
    expect(result).toEqual({
      id: eventId,
      eventUrl: googleEvent.htmlLink,
      meetUrl: 'https://meet.google.com/abc-defg-hij',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const oauthRequest = requests[0];
    if (!oauthRequest) throw new Error('Expected an OAuth token request.');
    const form = new URLSearchParams(bodyText(oauthRequest.init?.body));
    expect(oauthRequest.url).toBe('https://oauth2.googleapis.com/token');
    expect(oauthRequest.init?.method).toBe('POST');
    expect(form).toEqual(
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'test-client-id.apps.googleusercontent.com',
        client_secret: 'test-client-secret',
        refresh_token: 'test-refresh-token',
      }),
    );
    expect(oauthRequest.url).not.toContain('test-refresh-token');

    const calendarRequest = requests[1];
    if (!calendarRequest) throw new Error('Expected a Calendar event request.');
    const url = new URL(calendarRequest.url);
    expect(url.searchParams.get('conferenceDataVersion')).toBe('1');
    expect(url.searchParams.get('sendUpdates')).toBe('all');
    expect(new Headers(calendarRequest.init?.headers).get('Authorization')).toBe(
      'Bearer google-access-token',
    );
    const body = JSON.parse(bodyText(calendarRequest.init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: eventId,
      summary: meeting.title,
      start: { dateTime: meeting.startAt, timeZone: 'Asia/Kolkata' },
      attendees: [{ email: meeting.attendeeEmail }],
      conferenceData: {
        createRequest: { conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
    });
  });

  it('reuses a valid access token for subsequent Calendar requests', async () => {
    const { fetch: fetchMock, requests } = mockFetch(
      new Response(JSON.stringify({ access_token: 'google-access-token', expires_in: 3600 })),
      new Response(JSON.stringify(googleEvent)),
      new Response('{}', { status: 409 }),
      new Response(JSON.stringify(googleEvent)),
    );
    vi.stubGlobal('fetch', fetchMock);
    const calendar = new GoogleCalendar(config);

    await calendar.createOrFindEvent(meeting);
    await calendar.createOrFindEvent(meeting);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      requests.filter(({ url }) => url === 'https://oauth2.googleapis.com/token'),
    ).toHaveLength(1);
  });

  it('does not retry a rejected OAuth refresh token', async () => {
    const { fetch: fetchMock } = mockFetch(new Response('{}', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new GoogleCalendar(config).createOrFindEvent(meeting)).rejects.toMatchObject({
      code: 'GOOGLE_AUTH_REJECTED',
      retryable: false,
    } satisfies Partial<CalendarSyncError>);
  });

  it('recovers idempotently by loading the deterministic event after an insert conflict', async () => {
    const { fetch: fetchMock, requests } = mockFetch(
      new Response(JSON.stringify({ access_token: 'google-access-token', expires_in: 3600 })),
      new Response('{}', { status: 409 }),
      new Response(JSON.stringify(googleEvent)),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(new GoogleCalendar(config).createOrFindEvent(meeting)).resolves.toMatchObject({
      id: eventId,
      meetUrl: 'https://meet.google.com/abc-defg-hij',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new URL(requests[2]?.url ?? 'https://example.test').pathname).toContain(
      `/events/${eventId}`,
    );
  });

  it('never reports a calendar success while Google is still generating a Meet link', async () => {
    const { fetch: fetchMock } = mockFetch(
      new Response(JSON.stringify({ access_token: 'google-access-token', expires_in: 3600 })),
      new Response(
        JSON.stringify({
          ...googleEvent,
          conferenceData: {
            createRequest: { status: { statusCode: 'pending' } },
            entryPoints: [],
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(new GoogleCalendar(config).createOrFindEvent(meeting)).rejects.toMatchObject({
      code: 'GOOGLE_MEET_NOT_READY',
      retryable: true,
    } satisfies Partial<CalendarSyncError>);
  });
});
