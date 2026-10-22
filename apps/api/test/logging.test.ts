import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';

describe('structured logging privacy', () => {
  it('logs correlation and outcome without request headers, query strings or bodies', async () => {
    const lines: string[] = [];
    const logger = createLogger('info', { write: (line) => lines.push(line) });
    const app = createApp(parseEnv({}), logger);
    await request(app)
      .post('/api/missing?email=private-query-marker')
      .set('Authorization', 'Bearer private-header-marker')
      .set('Cookie', 'session=private-cookie-marker')
      .send({ note: 'private-body-marker' })
      .expect(404);

    const output = lines.join('');
    expect(output).toContain('http_request');
    expect(output).toContain('requestId');
    expect(output).toContain('statusCode');
    expect(output).not.toContain('private-query-marker');
    expect(output).not.toContain('private-header-marker');
    expect(output).not.toContain('private-cookie-marker');
    expect(output).not.toContain('private-body-marker');
  });

  it('redacts common secret fields as an additional safeguard', () => {
    const lines: string[] = [];
    const logger = createLogger('info', { write: (line) => lines.push(line) });
    logger.info(
      { token: 'secret-marker', config: { RESEND_API_KEY: 'secret-marker' } },
      'Test event.',
    );
    expect(lines.join('')).not.toContain('secret-marker');
    expect(lines.join('')).toContain('[REDACTED]');
  });
});
