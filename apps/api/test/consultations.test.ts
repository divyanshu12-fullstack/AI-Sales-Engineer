import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';
import {
  availableSlots,
  consultationDisplay,
  consultantScore,
} from '../src/modules/consultations/availability.js';
import type { Consultant } from '../src/modules/consultations/availability.js';
import {
  meetingCalendarEmailTemplate,
  meetingEmailTemplate,
} from '../src/modules/consultations/email-template.js';
import { isDemoAddress } from '../src/modules/consultations/email.js';

const config = parseEnv({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SECRET_KEY: 'server-key',
  SUPABASE_PUBLISHABLE_KEY: 'public-key',
  BOLNA_AGENT_ID: '00000000-0000-4000-8000-000000000001',
  BOLNA_TOOL_AUTH_TOKEN: 't'.repeat(32),
  PUBLIC_API_BASE_URL: 'https://api.example.test',
  RESEND_API_KEY: 'resend-test-key',
  RESEND_FROM_EMAIL: 'support@example.invalid',
});
const app = () => createApp(config, createLogger('silent'));
const token = 'a'.repeat(64);
const consultants: Consultant[] = [
  {
    id: '00000000-0000-4000-8000-000000000010',
    full_name: 'Arjun Verma',
    team: 'Full-stack development and UI/UX',
    role_title: 'Backend lead',
    skills: ['Node.js', 'PostgreSQL', 'APIs'],
    consultation_topics: ['APIs', 'Data modeling'],
  },
  {
    id: '00000000-0000-4000-8000-000000000011',
    full_name: 'Meera Kapoor',
    team: 'Full-stack development and UI/UX',
    role_title: 'Lead consultant',
    skills: ['React', 'Websites', 'CRM workflows'],
    consultation_topics: ['Web applications', 'Discovery'],
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('consultation availability', () => {
  it('offers only Mon–Sat 11:00–17:30 IST slots at least 24 hours ahead', () => {
    const slots = availableSlots({
      now: new Date('2026-10-27T04:00:00Z'), // Tuesday 09:30 IST
      topic: 'customer appointment booking portal',
      preferredDate: '',
      preferredPeriod: 'any',
      consultants,
      meetings: [],
    });
    expect(slots).toHaveLength(3);
    expect(slots[0]?.start_at).toBe('2026-10-28T05:30:00.000Z');
    expect(slots[0]?.display).toContain('IST');
    expect(slots[0]?.consultant_name).toBe('Arjun Verma');
  });

  it('includes Saturday but never offers a Sunday slot', () => {
    const saturday = availableSlots({
      now: new Date('2026-10-29T04:00:00Z'), // Thursday 09:30 IST
      topic: 'CRM workflow',
      preferredDate: '2026-10-31',
      preferredPeriod: 'morning',
      consultants,
      meetings: [],
    });
    expect(saturday[0]).toMatchObject({ start_at: '2026-10-31T05:30:00.000Z' });
    const sunday = availableSlots({
      now: new Date('2026-10-29T04:00:00Z'),
      topic: 'CRM workflow',
      preferredDate: '2026-11-01',
      preferredPeriod: 'any',
      consultants,
      meetings: [],
    });
    expect(sunday).toEqual([]);
  });

  it('offers a matched consultant later when their first slot is busy', () => {
    const slots = availableSlots({
      now: new Date('2026-10-27T04:00:00Z'),
      topic: 'React customer portal',
      preferredDate: '2026-10-28',
      preferredPeriod: 'morning',
      consultants,
      meetings: [
        {
          consultant_employee_id: consultants[1]?.id ?? '',
          requested_start_at: '2026-10-28T05:30:00.000Z',
          duration_minutes: 30,
        },
      ],
    });
    expect(slots[0]).toMatchObject({
      start_at: '2026-10-28T06:00:00.000Z',
      consultant_name: 'Meera Kapoor',
    });
  });

  it('respects afternoon periods and ranks relevant consultants', () => {
    expect(
      consultantScore('CRM workflows and website', consultants[1] as Consultant),
    ).toBeGreaterThan(0);
    const slots = availableSlots({
      now: new Date('2026-10-27T04:00:00Z'),
      topic: 'appointment booking portal',
      preferredDate: '2026-10-28',
      preferredPeriod: 'afternoon',
      consultants,
      meetings: [],
    });
    expect(slots[0]?.start_at).toBe('2026-10-28T07:30:00.000Z'); // 13:00 IST
    expect(consultationDisplay(slots[0]?.start_at ?? '')).toContain('1:00 pm');
  });

  it('releases an expired pending reservation while keeping confirmed meetings busy', () => {
    const now = new Date('2026-10-27T04:00:00Z');
    const slots = availableSlots({
      now,
      topic: 'CRM workflow',
      preferredDate: '2026-10-28',
      preferredPeriod: 'morning',
      consultants,
      meetings: [
        {
          consultant_employee_id: consultants[1]?.id ?? '',
          requested_start_at: '2026-10-28T05:30:00.000Z',
          duration_minutes: 30,
          status: 'pending_confirmation',
          confirmation_expires_at: '2026-10-27T03:59:00.000Z',
        },
        {
          consultant_employee_id: consultants[1]?.id ?? '',
          requested_start_at: '2026-10-28T06:00:00.000Z',
          duration_minutes: 30,
          status: 'confirmed',
          confirmation_expires_at: null,
        },
      ],
    });
    expect(slots[0]?.start_at).toBe('2026-10-28T05:30:00.000Z');
    expect(slots.map((slot) => slot.start_at)).not.toContain('2026-10-28T06:00:00.000Z');
  });
});

describe('consultation email and confirmation page', () => {
  it('includes a real confirmation capability and escapes customer-visible fields', () => {
    const template = meetingEmailTemplate({
      reference: 'MTG-TEST',
      title: 'Portal <script>alert(1)</script>',
      consultantName: 'Meera Kapoor',
      displayTime: 'Wed, 28 Oct, 11:00 am IST',
      durationMinutes: 30,
      timezone: 'Asia/Kolkata',
      confirmUrl: 'https://api.example.test/api/meetings/confirmation?token=abc',
      expiresOn: '4 Nov 2026',
    });
    expect(template.subject).toContain('Confirm your consultation');
    expect(template.text).toContain('https://api.example.test/api/meetings/confirmation?token=abc');
    expect(template.html).toContain('Confirm this consultation');
    expect(template.html).toContain('&lt;script&gt;');
    expect(template.html).not.toContain('<script>alert(1)</script>');
  });

  it('identifies demo-only recipients without blocking real inboxes', () => {
    expect(isDemoAddress('caller@example.com')).toBe(true);
    expect(isDemoAddress('caller@example.invalid')).toBe(true);
    expect(isDemoAddress('reviewer@resend.dev')).toBe(false);
  });

  it('includes Meet and Calendar links only in the post-confirmation email', () => {
    const template = meetingCalendarEmailTemplate({
      reference: 'MTG-LINKS',
      title: 'Portal <review>',
      consultantName: 'Meera Kapoor',
      displayTime: 'Wed, 4 Nov, 11:00 am IST',
      durationMinutes: 30,
      timezone: 'Asia/Kolkata',
      calendarUrl: 'https://www.google.com/calendar/event?eid=demo',
      meetUrl: 'https://meet.google.com/abc-defg-hij',
    });
    expect(template.subject).toContain('Your consultation is confirmed');
    expect(template.text).toContain('https://meet.google.com/abc-defg-hij');
    expect(template.text).toContain('https://www.google.com/calendar/event?eid=demo');
    expect(template.html).toContain('Join Google Meet');
    expect(template.html).toContain('&lt;review&gt;');
    expect(template.html).not.toContain('Portal <review>');
  });

  it('serves a safe GET page that does not confirm by itself, then confirms on POST', async () => {
    const pending = {
      status: 'pending',
      reference: 'MTG-PAGE',
      title: 'Consultation · Portal <b>review</b>',
      start_at: '2026-10-28T05:30:00.000Z',
      duration_minutes: 30,
      timezone: 'Asia/Kolkata',
      consultant_name: 'Meera Kapoor',
      expires_at: '2026-11-04T05:30:00.000Z',
    };
    const fetch = vi.fn((_url: string | URL, init?: RequestInit) => {
      const bodyText = typeof init?.body === 'string' ? init.body : '{}';
      const body = JSON.parse(bodyText) as { token_hash?: string };
      expect(body.token_hash).toBe(
        'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
      );
      return Promise.resolve(
        new Response(JSON.stringify(pending), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    vi.stubGlobal('fetch', fetch);
    const page = await request(app()).get('/api/meetings/confirmation').query({ token });
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.text).toContain('Confirm this consultation');
    expect(page.text).toContain('action="/api/meetings/confirmation"');
    expect(page.text).toContain(`value="${token}"`);
    expect(page.text).toContain('&lt;b&gt;review&lt;/b&gt;');
    expect(fetch).toHaveBeenCalledTimes(1);

    fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'confirmed',
          reference: 'MTG-PAGE',
          title: 'Consultation · Portal review',
          start_at: '2026-10-28T05:30:00.000Z',
          duration_minutes: 30,
          timezone: 'Asia/Kolkata',
          consultant_name: 'Meera Kapoor',
          already_confirmed: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const confirmed = await request(app())
      .post('/api/meetings/confirmation')
      .set('Origin', 'https://mail.example.test')
      .type('form')
      .send({ token });
    expect(confirmed.status).toBe(200);
    expect(confirmed.headers['access-control-allow-origin']).toBeUndefined();
    expect(confirmed.text).toContain('Your consultation is confirmed');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('renders invalid links without querying the database', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const page = await request(app())
      .get('/api/meetings/confirmation')
      .query({ token: 'not-a-token' });
    expect(page.status).toBe(200);
    expect(page.text).toContain('not valid');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('consultation tool authentication and validation', () => {
  it('rejects missing provider credentials before any database call', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await request(app()).post('/api/bolna/tools/schedule-consultation').send({});
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects unconfirmed or incomplete scheduling inputs', async () => {
    const response = await request(app())
      .post('/api/bolna/tools/schedule-consultation')
      .set('Authorization', `Bearer ${'t'.repeat(32)}`)
      .send({
        submission_key: 'agent:meeting',
        inquiry_reference: 'INQ-00000000-0000-4000-8000-000000000001',
        consultant_id: '00000000-0000-4000-8000-000000000010',
        start_at: '2026-10-28T05:30:00.000Z',
        topic: 'appointment portal',
        confirmed: 'no',
      });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'INVALID_INPUT' } });
  });
});
