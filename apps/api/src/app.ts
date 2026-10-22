import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { Env } from './config/env.js';
import { createErrorHandler, errorBody, HttpError } from './http/errors.js';
import { createRequestContext } from './http/request-context.js';
import { getLiveness, getReadiness } from './modules/health/service.js';

export const createApp = (config: Env, logger: Logger) => {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(createRequestContext(logger));
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (origin === undefined || origin === config.WEB_ORIGIN) {
          callback(null, true);
          return;
        }
        callback(new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed.'));
      },
      exposedHeaders: ['X-Request-ID'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: false,
    }),
  );

  // Process liveness stays independent of unavailable integrations and API traffic limits.
  app.get('/api/health/live', (_request, response) => {
    response.json(getLiveness());
  });

  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: config.RATE_LIMIT_MAX,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_request, response) => {
        response
          .status(429)
          .json(errorBody(response, 'RATE_LIMITED', 'Too many requests. Try again shortly.'));
      },
    }),
  );
  app.use(express.json({ limit: '16kb', strict: true }));

  app.get('/api/health/ready', (_request, response) => {
    response.status(503).json(getReadiness(config));
  });

  app.use((_request, response) => {
    response
      .status(404)
      .json(errorBody(response, 'NOT_FOUND', 'The requested endpoint was not found.'));
  });
  app.use(createErrorHandler(logger));

  return app;
};
