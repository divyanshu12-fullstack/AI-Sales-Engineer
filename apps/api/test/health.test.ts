import {
  errorResponseSchema,
  livenessResponseSchema,
  readinessResponseSchema,
} from '@asterbyte/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';

const makeApp = (env: Record<string, string> = {}) =>
  createApp(parseEnv(env), createLogger('silent'));

describe('foundation HTTP API', () => {
  it('reports real process liveness with security headers and a new request ID', async () => {
    const response = await request(makeApp())
      .get('/api/health/live')
      .set('X-Request-ID', 'do-not-trust-the-caller')
      .expect(200);
    expect(livenessResponseSchema.parse(response.body).data.status).toBe('ok');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('reports unavailable integrations rather than fake success', async () => {
    const response = await request(makeApp()).get('/api/health/ready').expect(503);
    const { data } = readinessResponseSchema.parse(response.body);
    expect(data.integrations).toHaveLength(7);
    expect(data.integrations.every(({ status }) => status === 'unavailable')).toBe(true);
    expect(data.integrations.every(({ configuration }) => configuration === 'missing')).toBe(true);
  });

  it('does not expose credentials or mistake configuration for verified connectivity', async () => {
    const key = 'private-provider-key-must-not-be-returned';
    const app = makeApp({ RESEND_API_KEY: key, RESEND_FROM_EMAIL: 'demo@example.com' });
    const response = await request(app).get('/api/health/ready').expect(503);
    const { data } = readinessResponseSchema.parse(response.body);
    expect(data.integrations.find(({ id }) => id === 'resend')).toMatchObject({
      configuration: 'present',
      status: 'unavailable',
      verification: 'not_checked',
      missingVariables: [],
    });
    expect(response.text).not.toContain(key);
    expect(response.text).not.toContain('demo@example.com');
  });

  it('allows the configured web origin and rejects another origin', async () => {
    const app = makeApp();
    const allowed = await request(app)
      .get('/api/health/live')
      .set('Origin', 'http://127.0.0.1:5173')
      .expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
    const denied = await request(app)
      .get('/api/health/live')
      .set('Origin', 'https://untrusted.example')
      .expect(403);
    expect(errorResponseSchema.parse(denied.body).error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('responds to CORS preflight without requiring an application route', async () => {
    await request(makeApp())
      .options('/api/health/ready')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);
  });

  it('returns predictable not-found errors without echoing the requested path', async () => {
    const response = await request(makeApp()).get('/api/not-built-yet').expect(404);
    const failure = errorResponseSchema.parse(response.body);
    expect(failure.error.code).toBe('NOT_FOUND');
    expect(failure.error.requestId).toBe(response.headers['x-request-id']);
    expect(response.text).not.toContain('not-built-yet');
  });

  it('handles invalid JSON without leaking its contents or a stack trace', async () => {
    const response = await request(makeApp())
      .post('/api/not-built-yet')
      .set('Content-Type', 'application/json')
      .send('{"private":"sensitive-marker"')
      .expect(400);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('INVALID_JSON');
    expect(response.text).not.toContain('sensitive-marker');
    expect(response.text).not.toContain('stack');
  });

  it('rejects oversized request bodies', async () => {
    const response = await request(makeApp())
      .post('/api/not-built-yet')
      .send({ content: 'x'.repeat(17_000) })
      .expect(413);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rate-limits public API requests without disabling process liveness', async () => {
    const app = makeApp({ RATE_LIMIT_MAX: '2' });
    await request(app).get('/api/health/ready').expect(503);
    await request(app).get('/api/health/ready').expect(503);
    const response = await request(app).get('/api/health/ready').expect(429);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('RATE_LIMITED');
    expect(response.headers['retry-after']).toBeDefined();
    await request(app).get('/api/health/live').expect(200);
  });
});
