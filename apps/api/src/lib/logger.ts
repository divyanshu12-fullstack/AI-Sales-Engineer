import { pino } from 'pino';
import type { DestinationStream, Logger } from 'pino';
import type { Env } from '../config/env.js';

export const createLogger = (level: Env['LOG_LEVEL'], destination?: DestinationStream): Logger => {
  const options = {
    level,
    base: { service: 'asterbyte-api' },
    redact: {
      paths: [
        'authorization',
        'cookie',
        'password',
        'token',
        'apiKey',
        'secret',
        'config',
        'req.headers',
        'req.body',
        'res.headers',
        '*.password',
        '*.token',
        '*.apiKey',
        '*.secret',
      ],
      censor: '[REDACTED]',
    },
  };

  return destination ? pino(options, destination) : pino(options);
};
