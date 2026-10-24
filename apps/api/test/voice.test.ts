import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';
const agent = '00000000-0000-4000-8000-000000000001';
const origin = 'http://127.0.0.1:5173';
const session = {
  run_id: '00000000-0000-4000-8000-000000000002',
  agent_id: agent,
  sip_username: 'short-lived-user',
  sip_password: 'short-lived-password',
  sip_domain: 'voice.example.invalid',
  wss_url: 'wss://voice.example.invalid',
  sip_register: false,
  expires_in: 120,
  ice_servers: [{ urls: 'stun:example.invalid' }],
};
const app = (extra: Record<string, string> = {}) =>
  createApp(
    parseEnv({ BOLNA_API_KEY: 'never-expose-account-key', BOLNA_AGENT_ID: agent, ...extra }),
    createLogger('silent'),
  );
const post = (application = app()) =>
  request(application).post('/api/voice/session').set('Origin', origin);
afterEach(() => vi.unstubAllGlobals());
describe('ephemeral browser voice sessions', () => {
  it('mints only for the configured agent and returns validated short-lived credentials, not provider secrets', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ...session, api_key: 'unexpected-private-field' })),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await post().send({ consent: true }).expect(200);
    expect(result.body).toEqual(session);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.text).not.toContain('never-expose-account-key');
    expect(result.text).not.toContain('unexpected-private-field');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.bolna.ai/web-call/session',
      expect.objectContaining({ body: JSON.stringify({ agent_id: agent }) }),
    );
  });
  it('requires consent and refuses caller-controlled agent IDs, prompt variables or context', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const body of [
      {},
      { consent: false },
      { consent: true, agent_id: agent },
      { consent: true, user_data: { role: 'admin' } },
    ])
      await post().send(body).expect(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects missing and cross-site origins before spending provider capacity', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await request(app()).post('/api/voice/session').send({ consent: true }).expect(403);
    await request(app())
      .post('/api/voice/session')
      .set('Origin', 'https://evil.example')
      .send({ consent: true })
      .expect(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('applies a dedicated small per-IP session budget', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(session)))),
    );
    const application = app();
    for (let i = 0; i < 3; i++) await post(application).send({ consent: true }).expect(200);
    await post(application).send({ consent: true }).expect(429);
    await request(application).get('/api/health/live').expect(200);
  });
  it('is explicitly disableable without changing the existing agent', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await post(app({ BOLNA_WEB_CALL_ENABLED: 'false' }))
      .send({ consent: true })
      .expect(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not pass raw provider failures, capacity responses or network errors to the browser', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('secret raw provider data', { status: 429 }))),
    );
    const busy = await post().send({ consent: true }).expect(429);
    expect(busy.body).toMatchObject({ error: { code: 'CALL_CAPACITY' } });
    expect(busy.text).not.toContain('secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('private connection data'))),
    );
    const failure = await post().send({ consent: true }).expect(502);
    expect(failure.text).not.toContain('private connection data');
  });
  it('rejects malformed, long-lived, wrong-agent or insecure session payloads', async () => {
    for (const result of [
      { ...session, expires_in: 3600 },
      { ...session, agent_id: session.run_id },
      { ...session, wss_url: 'ws://voice.example.invalid' },
      { run_id: session.run_id },
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(new Response(JSON.stringify(result)))),
      );
      await post().send({ consent: true }).expect(502);
    }
  });
});
