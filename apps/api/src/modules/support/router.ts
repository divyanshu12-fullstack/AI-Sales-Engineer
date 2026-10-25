import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Logger } from 'pino';
import type { Env } from '../../config/env.js';
import { requireAdmin, requireProviderToken } from '../../http/auth.js';
import { Support } from './service.js';
export const supportRouter = (config: Env, logger: Logger) => {
  const router = express.Router();
  const support = new Support(config, logger);
  const token = requireProviderToken(config.BOLNA_TOOL_AUTH_TOKEN);
  const limit = rateLimit({
    windowMs: 10 * 60_000,
    limit: 40,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  router.post('/bolna/tools/lookup-support-project', token, limit, async (req, res) => {
    res.json({ data: await support.lookup(req.body as unknown) });
  });
  router.post('/bolna/tools/create-support-ticket', token, limit, async (req, res) => {
    res.json({ data: await support.create(req.body as unknown) });
  });
  router.patch(
    '/admin/support/tickets/:id',
    requireAdmin(config, support.database),
    async (req, res) => {
      res.json({
        data: await support.update(
          z.uuid().parse(req.params.id),
          z.uuid().parse(res.locals.adminId),
          req.body as unknown,
        ),
      });
    },
  );
  router.post(
    '/admin/support/emails/:id/retry',
    requireAdmin(config, support.database),
    async (req, res) => {
      res.json({ data: await support.retryEmail(z.uuid().parse(req.params.id)) });
    },
  );
  return router;
};
