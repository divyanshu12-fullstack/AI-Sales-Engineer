import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { browserSessionRequestSchema, browserSessionSchema } from '@asterbyte/contracts';
import type { Env } from '../../config/env.js';
import { errorBody, HttpError } from '../../http/errors.js';

export const voiceRouter = (config: Env) => {
  const router = express.Router();
  const limiter = (limit: number, global = false) =>
    rateLimit({
      windowMs: 10 * 60_000,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      ...(global ? { keyGenerator: () => 'browser-session-budget' } : {}),
      handler: (_req, res) =>
        res
          .status(429)
          .json(
            errorBody(
              res,
              'RATE_LIMITED',
              'Too many call attempts. Please try again in a few minutes.',
            ),
          ),
    });
  router.post(
    '/session',
    (req, _res, next) => {
      // Public, paid session minting: exact browser origin, explicit consent, no arbitrary prompt variables.
      if (req.get('Origin') !== config.WEB_ORIGIN)
        throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'Start the call from our website.');
      if (!browserSessionRequestSchema.safeParse(req.body as unknown).success)
        throw new HttpError(
          400,
          'INVALID_INPUT',
          'Please agree to voice processing before starting.',
        );
      next();
    },
    limiter(config.BOLNA_SESSION_RATE_LIMIT),
    limiter(20, true),
    async (_req, res) => {
      if (
        config.BOLNA_WEB_CALL_ENABLED !== 'true' ||
        !config.BOLNA_API_KEY ||
        !config.BOLNA_AGENT_ID
      ) {
        throw new HttpError(
          503,
          'INTEGRATION_UNAVAILABLE',
          'Browser calling is temporarily unavailable. Please try again later.',
        );
      }
      let body: unknown;
      try {
        const response = await fetch('https://api.bolna.ai/web-call/session', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(12_000),
          headers: {
            Authorization: `Bearer ${config.BOLNA_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ agent_id: config.BOLNA_AGENT_ID }),
        });
        if (response.status === 429)
          throw new HttpError(
            429,
            'CALL_CAPACITY',
            'All voice lines are busy. Please try again shortly.',
          );
        if (!response.ok)
          throw new HttpError(
            503,
            'INTEGRATION_UNAVAILABLE',
            'The voice service could not start a call. Please try again later.',
          );
        body = await response.json();
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(
          502,
          'UPSTREAM_ERROR',
          'The voice service could not be reached. Please try again.',
        );
      }
      const session = browserSessionSchema.safeParse(body);
      if (!session.success || session.data.agent_id !== config.BOLNA_AGENT_ID)
        throw new HttpError(
          502,
          'UPSTREAM_ERROR',
          'The voice service returned an unusable session. Please retry.',
        );
      res.json(session.data);
    },
  );
  return router;
};
