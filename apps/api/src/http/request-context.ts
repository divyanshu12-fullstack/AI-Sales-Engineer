import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

export const createRequestContext = (logger: Logger): RequestHandler => {
  return (request, response, next) => {
    // Generate rather than trust caller-provided identifiers, which may contain PII.
    const requestId = randomUUID();
    const startedAt = performance.now();
    response.setHeader('X-Request-ID', requestId);
    response.setHeader('Cache-Control', 'no-store');

    response.on('finish', () => {
      logger.info(
        {
          event: 'http_request',
          requestId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        },
        'HTTP request completed.',
      );
    });

    next();
  };
};
