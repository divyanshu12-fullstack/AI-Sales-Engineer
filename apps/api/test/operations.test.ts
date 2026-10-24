import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';
import { contactObservations, normalizeExecution } from '../src/modules/bolna/execution.js';
import { chunkMarkdown } from '../src/modules/knowledge/chunks.js';
import { embed } from '../src/modules/knowledge/embeddings.js';

const agent = '00000000-0000-4000-8000-000000000001';
const execution = '00000000-0000-4000-8000-000000000002';
const config = parseEnv({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SECRET_KEY: 'server-key',
  SUPABASE_PUBLISHABLE_KEY: 'public-key',
  BOLNA_AGENT_ID: agent,
  BOLNA_API_KEY: 'bolna-key',
  BOLNA_TOOL_AUTH_TOKEN: 't'.repeat(32),
  BOLNA_WEBHOOK_SECRET: 'w'.repeat(32),
  EMBEDDING_MODEL: 'qwen/qwen3-embedding-8b',
  EMBEDDING_API_KEY: 'embedding-key',
  BOLNA_CALL_CHANNEL: 'browser',
});
const app = () => createApp(config, createLogger('silent'));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const payload = {
  id: execution,
  agent_id: agent,
  status: 'completed',
  created_at: '2026-10-24T10:00:00Z',
  updated_at: '2026-10-24T10:01:00Z',
  conversation_duration: 60,
  summary: 'A discussion',
  transcript: 'user: Need software',
  extracted_data: {
    'All Industries': {
      'Customer Name': { subjective: 'Example Person' },
      'Customer Email': { subjective: 'person@example.invalid' },
    },
  },
};
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authenticated operational endpoints', () => {
  it('rejects absent and wrong tool credentials before provider access', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const token of ['', `Bearer ${'w'.repeat(32)}`, 'Bearer invalid']) {
      await request(app())
        .post('/api/bolna/tools/search-company-knowledge')
        .set('Authorization', token)
        .send({ question: 'What services?' })
        .expect(401);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('fails closed when authentication has not been configured', async () => {
    await request(createApp(parseEnv({}), createLogger('silent')))
      .post('/api/bolna/tools/create-project-inquiry')
      .send({})
      .expect(503);
  });
  it('validates caller intent/contact/confirmation before doing any writes', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await request(app())
      .post('/api/bolna/tools/create-project-inquiry')
      .set('Authorization', `Bearer ${'t'.repeat(32)}`)
      .send({ confirmed: 'no', customer_name: 'Test' })
      .expect(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not accept agent-supplied customer, project or execution identifiers', async () => {
    await request(app())
      .post('/api/bolna/tools/search-company-knowledge')
      .set('Authorization', `Bearer ${'t'.repeat(32)}`)
      .send({ question: 'Pricing?', customer_id: agent })
      .expect(400);
  });
  it('records a durable failure when the embedding provider fails; never returns fabricated passages', async () => {
    const fetch = vi.fn((url: URL | string) =>
      Promise.resolve(
        String(url).includes('openrouter.ai')
          ? json({ error: 'sensitive provider content' }, 500)
          : json([]),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await request(app())
      .post('/api/bolna/tools/search-company-knowledge')
      .set('Authorization', `Bearer ${'t'.repeat(32)}`)
      .send({ question: 'What services?' })
      .expect(502);
    expect(result.text).not.toContain('sensitive provider content');
    const calls = fetch.mock.calls;
    expect(calls).toHaveLength(3);
  });
  it('returns only validated database passages after a real-shaped 4096-dimensional embedding response', async () => {
    const fetch = vi.fn((url: URL | string) => {
      if (String(url).includes('openrouter.ai'))
        return Promise.resolve(
          json({
            model: 'Qwen/Qwen3-Embedding-8B',
            data: [{ index: 0, embedding: [1, ...Array<number>(4095).fill(0)] }],
          }),
        );
      return Promise.resolve(json([]));
    });
    vi.stubGlobal('fetch', fetch);
    const result = await request(app())
      .post('/api/bolna/tools/search-company-knowledge')
      .set('Authorization', `Bearer ${'t'.repeat(32)}`)
      .send({ question: 'What services?' })
      .expect(200);
    expect(result.body).toEqual({ data: { passages: [], evidence_only: true } });
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it('requires a separate webhook token and ignores supplied extraction data in favor of canonical API state', async () => {
    const fetch = vi.fn((url: URL | string) =>
      Promise.resolve(
        String(url).includes('api.bolna.ai')
          ? json(payload)
          : json({ accepted: true, changed: true }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    await request(app())
      .post('/api/bolna/webhooks/executions')
      .set('Authorization', `Bearer ${'t'.repeat(32)}`)
      .send({ id: execution, agent_id: agent })
      .expect(401);
    await request(app())
      .post('/api/bolna/webhooks/executions')
      .set('Authorization', `Bearer ${'w'.repeat(32)}`)
      .send({ id: execution, agent_id: agent, summary: 'Untrusted notification text' })
      .expect(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('rejects webhook events from another agent before fetching data', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await request(app())
      .post('/api/bolna/webhooks/executions')
      .set('Authorization', `Bearer ${'w'.repeat(32)}`)
      .send({ id: execution, agent_id: execution })
      .expect(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects nonexistent sample executions rather than showing a successful ingestion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(json({ error: 'not found' }, 404))),
    );
    await request(app())
      .post('/api/bolna/webhooks/executions')
      .set('Authorization', `Bearer ${'w'.repeat(32)}`)
      .send({ id: execution, agent_id: agent })
      .expect(502);
  });
  it('denies dashboard access without a verified user and active administrator mapping', async () => {
    await request(app()).get('/api/admin/activity').expect(401);
    vi.stubGlobal(
      'fetch',
      vi.fn((url: URL | string) =>
        Promise.resolve(String(url).includes('/auth/v1/user') ? json({ id: agent }) : json([])),
      ),
    );
    await request(app())
      .get('/api/admin/activity')
      .set('Authorization', 'Bearer valid-nonadmin')
      .expect(403);
  });
  it('exposes only the intentional public sign-in configuration', async () => {
    const response = await request(app()).get('/api/auth/config').expect(200);
    expect(response.body).toEqual({ url: config.SUPABASE_URL, publishableKey: 'public-key' });
    for (const secret of ['server-key', 'bolna-key', 'embedding-key'])
      expect(response.text).not.toContain(secret);
  });
  it('adds stored tool relationships and source metadata only after the active-admin gate', async () => {
    const passage = '00000000-0000-4000-8000-000000000003';
    const document = '00000000-0000-4000-8000-000000000004';
    const fetch = vi.fn((input: URL | string) => {
      const url = new URL(input);
      if (url.pathname === '/auth/v1/user') return Promise.resolve(json({ id: agent }));
      if (url.pathname.endsWith('/admin_profiles')) return Promise.resolve(json([{ id: agent }]));
      if (url.pathname.endsWith('/tool_executions'))
        return Promise.resolve(
          json([
            {
              id: execution,
              tool_name: 'search_company_knowledge',
              status: 'succeeded',
              error_code: null,
              created_at: '2026-10-24T10:00:00Z',
              source_ids: [passage, passage],
              inquiry_id: null,
            },
          ]),
        );
      if (url.pathname.endsWith('/knowledge_chunks'))
        return Promise.resolve(
          json([
            {
              id: passage,
              document_id: document,
              chunk_index: 0,
              knowledge_documents: {
                document_key: 'services-pricing',
                version: '1.1',
                title: 'Services and pricing',
              },
            },
          ]),
        );
      return Promise.resolve(json([]));
    });
    vi.stubGlobal('fetch', fetch);
    const result = await request(app())
      .get('/api/admin/activity')
      .set('Authorization', 'Bearer valid-admin')
      .expect(200);
    expect(result.body).toMatchObject({
      data: {
        tools: [{ id: execution, inquiry_id: null, source_ids: [passage, passage] }],
        sources: [
          {
            id: passage,
            document_id: document,
            chunk_index: 0,
            document_key: 'services-pricing',
            version: '1.1',
            title: 'Services and pricing',
          },
        ],
      },
    });
    const sources = fetch.mock.calls
      .map(([url]) => new URL(url))
      .filter((url) => url.pathname.endsWith('/knowledge_chunks'));
    expect(sources).toHaveLength(1);
    expect(sources[0]?.searchParams.get('id')).toBe(`in.(${passage})`);
    expect(sources[0]?.searchParams.get('limit')).toBe('160');
  });
});

describe('provider input and knowledge safety', () => {
  it('preserves known extraction labels as unverified observations', () => {
    expect(contactObservations(payload.extracted_data)).toEqual({
      name: 'Example Person',
      email: 'person@example.invalid',
    });
    expect(
      contactObservations({ 'All Industries': { 'Customer Name': { subjective: null } } }),
    ).toEqual({});
  });
  it('does not finalize data on disconnection', () => {
    expect(normalizeExecution({ ...payload, status: 'call-disconnected' }, config)).toMatchObject({
      call_status: 'started',
      transcript: null,
      summary: null,
      extracted_data: {},
    });
  });
  it('distinguishes an actual conversation from a completed but unanswered/agent-only call', () => {
    expect(normalizeExecution(payload, config).call_status).toBe('completed');
    expect(normalizeExecution({ ...payload, conversation_duration: 0 }, config).call_status).toBe(
      'failed',
    );
    expect(
      normalizeExecution({ ...payload, transcript: 'assistant: Hello?' }, config).call_status,
    ).toBe('failed');
  });
  it('rejects a canonical execution associated with another agent', () => {
    expect(() => normalizeExecution({ ...payload, agent_id: execution }, config)).toThrow(
      'does not belong',
    );
  });
  it('does not guess the calling channel when provider metadata is absent', () => {
    expect(() => normalizeExecution(payload, parseEnv({ BOLNA_AGENT_ID: agent }))).toThrow(
      'BOLNA_CALL_CHANNEL',
    );
  });
  it('rejects reduced dimensions, zero vectors, duplicate indexes and unknown embedding models', async () => {
    for (const response of [
      { model: 'Qwen/Qwen3-Embedding-8B', data: [{ index: 0, embedding: [1, 0] }] },
      {
        model: 'Qwen/Qwen3-Embedding-8B',
        data: [{ index: 0, embedding: Array<number>(4096).fill(0) }],
      },
      { model: 'other-model', data: [] },
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(json(response))),
      );
      await expect(embed(config, ['test'])).rejects.toThrow();
    }
  });
  it('removes draft metadata from retrieval passages but preserves headings, pricing and issue IDs', () => {
    const chunks = chunkMarkdown(
      '---\nstatus: draft\n---\n# Title\n\n## Pricing\nINR 100\n\n## Fix\nISSUE-001',
      'Source',
    );
    expect(chunks.join('\n')).not.toContain('status: draft');
    expect(chunks.join('\n')).toContain('INR 100');
    expect(chunks.join('\n')).toContain('ISSUE-001');
    expect(chunkMarkdown('a'.repeat(12_000), 'Source').every((s) => s.length < 6000)).toBe(true);
  });
});
