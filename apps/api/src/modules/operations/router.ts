import express from 'express';
import type { Logger } from 'pino';
import type { Env } from '../../config/env.js';
import { requireAdmin, requireProviderToken } from '../../http/auth.js';
import { HttpError } from '../../http/errors.js';
import { Operations } from './service.js';

export const operationsRouter = (config: Env, logger: Logger) => {
  const router = express.Router();
  const service = new Operations(config, logger);
  const toolAuth = requireProviderToken(config.BOLNA_TOOL_AUTH_TOKEN);
  router.post('/bolna/tools/search-company-knowledge', toolAuth, async (req, res) => {
    res.json({ data: await service.search(req.body as unknown) });
  });
  router.post('/bolna/tools/create-project-inquiry', toolAuth, async (req, res) => {
    res.json({ data: await service.createInquiry(req.body as unknown) });
  });
  router.post(
    '/bolna/webhooks/executions',
    requireProviderToken(config.BOLNA_WEBHOOK_SECRET),
    express.json({ limit: '512kb', strict: true }),
    async (req, res) => {
      res.json({ data: await service.webhook(req.body as unknown) });
    },
  );
  router.get('/admin/activity', requireAdmin(config, service.database), async (_req, res) => {
    res.json({ data: await service.dashboard() });
  });
  router.get('/auth/config', (_req, res) => {
    if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY)
      throw new HttpError(
        503,
        'INTEGRATION_UNAVAILABLE',
        'Administrator sign-in is not configured.',
      );
    // Deliberate public Auth configuration, NOT the privileged secret key.
    res.json({ url: config.SUPABASE_URL, publishableKey: config.SUPABASE_PUBLISHABLE_KEY });
  });
  return router;
};
