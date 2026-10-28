import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Logger } from 'pino';
import type { Env } from '../../config/env.js';
import { requireProviderToken } from '../../http/auth.js';
import { consultationDisplay } from './availability.js';
import { meetingConfirmationPage } from './email-template.js';
import { Consultations } from './service.js';

const tokenParam = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
};

export const consultationsRouter = (config: Env, logger: Logger) => {
  const router = express.Router();
  const service = new Consultations(config, logger);
  const toolAuth = requireProviderToken(config.BOLNA_TOOL_AUTH_TOKEN);
  const toolLimit = rateLimit({
    windowMs: 10 * 60_000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  const pageLimit = rateLimit({
    windowMs: 10 * 60_000,
    limit: 40,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });

  router.post(
    '/bolna/tools/check-consultation-availability',
    toolAuth,
    toolLimit,
    async (req, res) => {
      res.json({ data: await service.availability(req.body as unknown) });
    },
  );
  router.post('/bolna/tools/schedule-consultation', toolAuth, toolLimit, async (req, res) => {
    res.json({ data: await service.schedule(req.body as unknown) });
  });

  router.get('/meetings/confirmation', pageLimit, async (req, res) => {
    const token = tokenParam(req.query.token);
    const result = await service.getConfirmation(token);
    res.type('html').send(
      meetingConfirmationPage({
        outcome: result.status,
        ...(result.status === 'pending' || result.status === 'confirmed'
          ? {
              details: {
                reference: result.reference,
                title: result.title,
                time: consultationDisplay(result.start_at),
                consultantName: result.consultant_name,
                durationMinutes: result.duration_minutes,
                timezone: result.timezone,
              },
            }
          : {}),
        ...(result.status === 'pending' ? { actionUrl: '/api/meetings/confirmation', token } : {}),
      }),
    );
  });

  router.post(
    '/meetings/confirmation',
    express.urlencoded({ extended: false, limit: '1kb' }),
    pageLimit,
    async (req, res) => {
      const form = z.object({ token: z.string().optional() }).safeParse(req.body as unknown);
      const token = form.success ? tokenParam(form.data.token) : '';
      const result = await service.confirm(token);
      res.type('html').send(
        meetingConfirmationPage({
          outcome: result.status,
          ...(result.status === 'confirmed'
            ? {
                details: {
                  reference: result.reference,
                  title: result.title,
                  time: consultationDisplay(result.start_at),
                  consultantName: result.consultant_name,
                  durationMinutes: result.duration_minutes,
                  timezone: result.timezone,
                },
              }
            : {}),
        }),
      );
    },
  );

  return router;
};
