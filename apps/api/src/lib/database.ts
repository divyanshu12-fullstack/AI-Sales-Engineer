import type { Env } from '../config/env.js';
import { HttpError } from '../http/errors.js';
import { fetchJson } from './upstream.js';

// Narrow PostgREST adapter, not a session-bearing SDK singleton. No incoming auth is forwarded here.
export class Database {
  constructor(private readonly config: Env) {}

  async request(path: string, body?: unknown, method?: 'POST' | 'PATCH'): Promise<unknown> {
    const { SUPABASE_URL: origin, SUPABASE_SECRET_KEY: key } = this.config;
    if (!origin || !key)
      throw new HttpError(503, 'INTEGRATION_UNAVAILABLE', 'Database configuration is missing.');
    return fetchJson(new URL(`/rest/v1/${path}`, origin), {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  rpc(name: string, args: unknown): Promise<unknown> {
    return this.request(`rpc/${name}`, args);
  }
}
