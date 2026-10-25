import request from 'supertest';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';
import { executionCaller } from '../src/modules/support/service.js';
import { SupportEmail } from '../src/modules/support/email.js';
import { supportEmailTemplate } from '../src/modules/support/email-template.js';
const agent = '00000000-0000-4000-8000-000000000001';
const ticket = '00000000-0000-4000-8000-000000000002';
const job = '00000000-0000-4000-8000-000000000003';
const config = parseEnv({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SECRET_KEY: 'server-key',
  SUPABASE_PUBLISHABLE_KEY: 'public-key',
  BOLNA_AGENT_ID: agent,
  BOLNA_TOOL_AUTH_TOKEN: 't'.repeat(32),
  RESEND_API_KEY: 'resend-test-key',
  RESEND_FROM_EMAIL: 'support@example.invalid',
});
const app = () => createApp(config, createLogger('silent'));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const containsText = (text: string): unknown => expect.stringContaining(text);
const matchingText = (pattern: RegExp): unknown => expect.stringMatching(pattern);
afterEach(() => vi.unstubAllGlobals());
describe('support tool and admin boundaries', () => {
  it('requires provider credentials before support lookup and denies unauthenticated ticket updates', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await request(app())
      .post('/api/bolna/tools/lookup-support-project')
      .send({ project_code: '2001' })
      .expect(401);
    await request(app())
      .patch(`/api/admin/support/tickets/${ticket}`)
      .send({ status: 'resolved', resolution: 'Fixed.' })
      .expect(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects supplied caller phones, arbitrary recipients and unconfirmed support actions', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await request(app())
      .post('/api/bolna/tools/lookup-support-project')
      .set('Authorization', `Bearer ${'t'.repeat(32)}`)
      .send({ project_code: '2001', caller_phone: '+919999999999' })
      .expect(400);
    await request(app())
      .post('/api/bolna/tools/create-support-ticket')
      .set('Authorization', `Bearer ${'t'.repeat(32)}`)
      .send({
        support_token: 'a'.repeat(64),
        submission_key: 'test-submit',
        confirmed: 'no',
        title: 'Issue',
        description: 'Something went wrong',
        email: 'recipient@example.com',
      })
      .expect(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns only the minimal demo context and an opaque token; defaults to code fallback without a call id', async () => {
    const fetch = vi.fn((url: URL | string) =>
      Promise.resolve(
        String(url).includes('lookup_demo_support')
          ? json({
              status: 'matched',
              project_name: 'Demo project',
              project_code: '2001',
              identity_status: 'demo_code_match',
              scope: 'demo_support_intake_only',
            })
          : json([]),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const response = await request(app())
      .post('/api/bolna/tools/lookup-support-project')
      .set('Authorization', `Bearer ${'t'.repeat(32)}`)
      .send({ project_code: '2001', customer_code: '1001' })
      .expect(200);
    expect(response.body).toMatchObject({
      data: {
        status: 'matched',
        identity_status: 'demo_code_match',
        support_token: matchingText(/^[a-f0-9]{64}$/),
      },
    });
    expect(response.text).not.toContain('server-key');
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('api.bolna.ai'),
      expect.anything(),
    );
  });
  it('takes caller number only from an active canonical telephony execution, never from browser or extracted data', () => {
    const execution = {
      agent_id: agent,
      created_at: new Date().toISOString(),
      status: 'in-progress',
      telephony_data: {
        provider: 'plivo',
        call_type: 'inbound',
        from_number: '+919999999999',
        to_number: '+918888888888',
      },
      extracted_data: { phone: '+917777777777' },
    };
    expect(executionCaller(execution, agent)).toBe('+919999999999');
    expect(
      executionCaller(
        { ...execution, telephony_data: { ...execution.telephony_data, provider: 'freeswitch' } },
        agent,
      ),
    ).toBeNull();
    expect(executionCaller({ ...execution, status: 'completed' }, agent)).toBeNull();
    expect(executionCaller({ ...execution, created_at: 'bad timestamp' }, agent)).toBeNull();
    expect(executionCaller({ ...execution, agent_id: ticket }, agent)).toBeNull();
  });
  it('does not grant mutation access to an authenticated non-admin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: URL | string) =>
        Promise.resolve(String(url).includes('/auth/v1/user') ? json({ id: agent }) : json([])),
      ),
    );
    await request(app())
      .patch(`/api/admin/support/tickets/${ticket}`)
      .set('Authorization', 'Bearer nonadmin')
      .send({ status: 'resolved', resolution: 'Verified fix applied.' })
      .expect(403);
  });
});
describe('persisted support notifications', () => {
  it('renders small self-contained HTML with escaped caller content and a matching text alternative', () => {
    const mail = supportEmailTemplate({
      reference: 'SUP-123',
      title: '<script>alert(1)</script>',
      description: 'A < B & C\nSecond line',
    });
    expect(mail.text).toContain('SUP-123');
    expect(mail.text).toContain('A < B & C');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toMatch(/<img|<script|https?:\/\/|@import/i);
    expect(mail.html.length).toBeLessThan(6000);
    expect(
      supportEmailTemplate({
        reference: 'SUP-123',
        title: 'Issue',
        description: 'Original problem',
        resolution: 'Fixed the filter.',
      }).html,
    ).toContain('Fixed the filter.');
  });
  const claimed = {
    id: job,
    dedupe_key: `support:ack:${ticket}`,
    created_at: new Date().toISOString(),
    attempts: 1,
    payload: { ticket_id: ticket, template: 'support_acknowledgement' },
  };
  it('sends only to the stored opted-in recipient and persists provider acceptance with a stable idempotency key', async () => {
    const fetch = vi.fn((url: URL | string, options?: RequestInit) => {
      if (String(url).endsWith('/rpc/claim_support_email')) return Promise.resolve(json([claimed]));
      if (String(url).includes('support_ticket_dashboard'))
        return Promise.resolve(
          json([
            {
              code: 'SUP-TEST',
              title: 'Appointment list',
              description: 'The list is empty.',
              contacts: { email_normalized: 'delivered@resend.dev', support_email_enabled: true },
            },
          ]),
        );
      if (String(url) === 'https://api.resend.com/emails') {
        expect(options?.headers).toMatchObject({ 'Idempotency-Key': claimed.dedupe_key });
        const body: unknown = JSON.parse(typeof options?.body === 'string' ? options.body : '{}');
        expect(body).toMatchObject({ to: ['delivered@resend.dev'] });
        return Promise.resolve(json({ id: 'provider-message-id' }));
      }
      return Promise.resolve(json([]));
    });
    vi.stubGlobal('fetch', fetch);
    await new SupportEmail(config, createLogger('silent')).dispatch();
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: 'PATCH',
        body: containsText('provider-message-id'),
      }),
    );
  });
  it('never sends mail to fictional seed contacts and records a useful failure', async () => {
    const fetch = vi.fn((url: URL | string) =>
      Promise.resolve(
        String(url).includes('claim_support_email')
          ? json([claimed])
          : String(url).includes('support_ticket_dashboard')
            ? json([
                {
                  code: 'SUP-TEST',
                  title: 'Issue',
                  description: 'Description',
                  contacts: {
                    email_normalized: 'fictional@could-be-real.com',
                    support_email_enabled: false,
                  },
                },
              ])
            : json([]),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    await new SupportEmail(config, createLogger('silent')).dispatch();
    expect(fetch.mock.calls.some(([url]) => String(url) === 'https://api.resend.com/emails')).toBe(
      false,
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ body: containsText('EMAIL_RECIPIENT_DISABLED') }),
    );
  });
  it('records a provider failure without marking a notification accepted', async () => {
    const fetch = vi.fn((url: URL | string) =>
      Promise.resolve(
        String(url).includes('claim_support_email')
          ? json([claimed])
          : String(url).includes('support_ticket_dashboard')
            ? json([
                {
                  code: 'SUP-TEST',
                  title: 'Issue',
                  description: 'Description',
                  contacts: {
                    email_normalized: 'delivered@resend.dev',
                    support_email_enabled: true,
                  },
                },
              ])
            : String(url) === 'https://api.resend.com/emails'
              ? json({ message: 'private provider error' }, 503)
              : json([]),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    await new SupportEmail(config, createLogger('silent')).dispatch();
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ body: containsText('EMAIL_PROVIDER_REJECTED') }),
    );
    expect(fetch).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: containsText('private provider error') }),
    );
  });
});
