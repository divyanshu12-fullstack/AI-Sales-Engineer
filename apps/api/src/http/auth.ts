import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { HttpError } from './errors.js';
import type { Database } from '../lib/database.js';
import { fetchJson } from '../lib/upstream.js';

export const requireProviderToken =
  (secret?: string): RequestHandler =>
  (request, _response, next) => {
    if (!secret) {
      next(
        new HttpError(503, 'INTEGRATION_UNAVAILABLE', 'Endpoint authentication is not configured.'),
      );
      return;
    }
    const actual = createHash('sha256')
      .update(request.get('Authorization') ?? '')
      .digest();
    const expected = createHash('sha256').update(`Bearer ${secret}`).digest();
    if (!timingSafeEqual(actual, expected)) {
      next(new HttpError(401, 'UNAUTHORIZED', 'Invalid credentials.'));
      return;
    }
    next();
  };

export const requireAdmin =
  (config: Env, database: Database): RequestHandler =>
  async (request, _response, next) => {
    const authorization = request.get('Authorization');
    if (!authorization?.startsWith('Bearer ') || authorization.length > 8192)
      throw new HttpError(401, 'UNAUTHORIZED', 'Sign in to continue.');
    if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY)
      throw new HttpError(
        503,
        'INTEGRATION_UNAVAILABLE',
        'Administrator authentication is not configured.',
      );
    let identity: unknown;
    try {
      identity = await fetchJson(new URL('/auth/v1/user', config.SUPABASE_URL), {
        headers: { apikey: config.SUPABASE_PUBLISHABLE_KEY, Authorization: authorization },
      });
    } catch {
      throw new HttpError(401, 'UNAUTHORIZED', 'Your session is invalid or expired.');
    }
    const { id } = z.object({ id: z.uuid() }).parse(identity);
    const profiles = z
      .array(z.object({ id: z.uuid() }))
      .parse(
        await database.request(
          `admin_profiles?select=id&id=eq.${id}&is_active=eq.true&role=eq.admin&limit=1`,
        ),
      );
    if (!profiles.length)
      throw new HttpError(403, 'FORBIDDEN', 'An active administrator profile is required.');
    _response.locals.adminId = id;
    next();
  };
