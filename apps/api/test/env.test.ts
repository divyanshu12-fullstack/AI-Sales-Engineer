import { describe, expect, it } from 'vitest';
import { ConfigurationError, parseEnv } from '../src/config/env.js';

describe('environment validation', () => {
  it('boots without credentials and normalizes blank template entries', () => {
    const config = parseEnv({ PORT: '', BOLNA_API_KEY: ' ', LOG_LEVEL: '' });
    expect(config.PORT).toBe(3001);
    expect(config.HOST).toBe('127.0.0.1');
    expect(config.BOLNA_API_KEY).toBeUndefined();
    expect(config.LOG_LEVEL).toBe('info');
  });

  it.each(['zero', '0', '65536', '1.5'])('rejects an invalid port: %s', (PORT) => {
    expect(() => parseEnv({ PORT })).toThrow(ConfigurationError);
  });

  it.each(['https://example.com/path', 'https://user:password@example.com', 'ftp://example.com'])(
    'rejects an unsafe web origin: %s',
    (WEB_ORIGIN) => {
      expect(() => parseEnv({ WEB_ORIGIN })).toThrow('WEB_ORIGIN');
    },
  );

  it('requires HTTPS for future public callbacks', () => {
    expect(() => parseEnv({ PUBLIC_API_BASE_URL: 'http://localhost:3001' })).toThrow(
      'PUBLIC_API_BASE_URL',
    );
  });

  it('normalizes an origin trailing slash', () => {
    expect(parseEnv({ WEB_ORIGIN: 'https://example.com/' }).WEB_ORIGIN).toBe('https://example.com');
  });

  it('rejects weak or reused Bolna callback credentials', () => {
    expect(() => parseEnv({ BOLNA_TOOL_AUTH_TOKEN: 'short' })).toThrow('BOLNA_TOOL_AUTH_TOKEN');
    expect(() =>
      parseEnv({
        BOLNA_TOOL_AUTH_TOKEN: 'a'.repeat(32),
        BOLNA_WEBHOOK_SECRET: 'a'.repeat(32),
      }),
    ).toThrow('BOLNA_WEBHOOK_SECRET');
  });

  it('never includes an invalid secret value in validation errors', () => {
    const invalidSecret = 'do-not-print-me';
    try {
      parseEnv({ BOLNA_WEBHOOK_SECRET: invalidSecret });
      expect.fail('Invalid environment should have failed.');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ConfigurationError);
      if (error instanceof Error) {
        expect(error.message).toContain('BOLNA_WEBHOOK_SECRET');
        expect(error.message).not.toContain(invalidSecret);
      }
    }
  });
});
