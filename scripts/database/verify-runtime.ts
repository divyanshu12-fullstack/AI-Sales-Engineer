// Explicit real backend search verification. Does not place calls or create inquiries.
import { randomBytes } from 'node:crypto';
import { knowledgeResultSchema } from '@asterbyte/contracts';
import { z } from 'zod';
import { createApp } from '../../apps/api/src/app.js';
import { loadEnvironment } from '../../apps/api/src/config/env.js';
import { createLogger } from '../../apps/api/src/lib/logger.js';

const token = randomBytes(32).toString('hex');
const config = { ...loadEnvironment(), BOLNA_TOOL_AUTH_TOKEN: token };
const server = createApp(config, createLogger('silent')).listen(0, '127.0.0.1');
try {
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No loopback address.');
  const url = `http://127.0.0.1:${address.port}/api/bolna/tools/search-company-knowledge`;
  const rejected = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'Service pricing?' }),
  });
  if (rejected.status !== 401) throw new Error('Authentication denial not confirmed.');
  for (const question of [
    'What is the indicative budget for a custom CRM?',
    'आपकी कंपनी कौन सी सेवाएँ देती है?',
    'Support ke working hours kya hain?',
  ]) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ question }),
    });
    if (!response.ok) throw new Error('Search endpoint failed.');
    const body = z.object({ data: knowledgeResultSchema }).parse(await response.json());
    if (!body.data.passages.length) throw new Error('No retrieval evidence returned.');
    console.log(
      JSON.stringify({
        verified: 'authenticated backend → OpenRouter → Supabase search',
        sources: body.data.passages.map((p) => `${p.document_key}@${p.version}`),
        passages: body.data.passages.length,
      }),
    );
  }
} catch {
  console.error('Runtime knowledge verification failed; no secret or provider response logged.');
  process.exitCode = 1;
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
