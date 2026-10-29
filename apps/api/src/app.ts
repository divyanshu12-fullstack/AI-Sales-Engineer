import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from 'pino';
import type { Env } from './config/env.js';
import { createErrorHandler, errorBody } from './http/errors.js';
import { createRequestContext } from './http/request-context.js';
import { getLiveness, getReadiness } from './modules/health/service.js';
import { operationsRouter } from './modules/operations/router.js';
import { voiceRouter } from './modules/voice/router.js';
import { supportRouter } from './modules/support/router.js';
import { consultationsRouter } from './modules/consultations/router.js';
import { privacyPage } from './modules/privacy/page.js';

export const createApp = (config: Env, logger: Logger) => {
  const app = express();
  app.disable('x-powered-by');
  // App Service terminates TLS at one trusted front-end proxy. Trust only that hop so
  // rate limiting uses the caller address without accepting arbitrary forwarded chains.
  app.set('trust proxy', config.NODE_ENV === 'production' ? 1 : false);
  app.use(createRequestContext(logger));
  const connectSources = ["'self'", 'https://api.bolna.ai', 'wss://webcall.bolna.ai'];
  if (config.SUPABASE_URL) {
    const supabaseOrigin = new URL(config.SUPABASE_URL);
    connectSources.push(supabaseOrigin.origin);
    supabaseOrigin.protocol = supabaseOrigin.protocol === 'https:' ? 'wss:' : 'ws:';
    connectSources.push(supabaseOrigin.origin);
  }
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'connect-src': connectSources,
        },
      },
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        // CORS controls whether browser JavaScript may read a response; it is not an
        // authorization check. In particular, email-link navigation and form POSTs
        // must reach the confirmation route even when their Origin is not the web UI.
        // Returning false omits Access-Control-Allow-Origin while preserving that boundary.
        callback(null, origin === undefined || origin === config.WEB_ORIGIN);
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
  // Larger provider transcripts have a separate, authenticated and bounded parser.
  const ordinaryJson = express.json({ limit: '16kb', strict: true });
  app.use((req, res, next) => {
    if (req.path === '/api/bolna/webhooks/executions') next();
    else ordinaryJson(req, res, next);
  });
  app.use('/api', operationsRouter(config, logger));
  app.use('/api/voice', voiceRouter(config));
  app.use('/api', supportRouter(config, logger));
  app.use('/api', consultationsRouter(config, logger));

  app.get('/api/health/ready', (_request, response) => {
    response.status(503).json(getReadiness(config));
  });

  app.get('/privacy', (_request, response) => {
    response
      .set('Cache-Control', 'no-cache')
      .type('html')
      .send(privacyPage(config.PRIVACY_CONTACT_EMAIL));
  });

  if (config.NODE_ENV === 'production') {
    const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
    const indexFile = resolve(frontendDirectory, 'index.html');
    if (existsSync(indexFile)) {
      app.use(express.static(frontendDirectory, { index: false, fallthrough: true }));
      app.use((request, response, next) => {
        if (
          (request.method !== 'GET' && request.method !== 'HEAD') ||
          request.path === '/api' ||
          request.path.startsWith('/api/') ||
          !request.accepts('html')
        ) {
          next();
          return;
        }
        response.sendFile(indexFile, (error) => {
          if (error) next(error);
        });
      });
    }
  }

  app.use((_request, response) => {
    response
      .status(404)
      .json(errorBody(response, 'NOT_FOUND', 'The requested endpoint was not found.'));
  });
  app.use(createErrorHandler(logger));

  return app;
};
