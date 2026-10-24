// Explicit, read-only check using existing server configuration. Never imported by the web app.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';
import { readPack, rows, text, workspaceRoot } from './pack.js';

const main = async (): Promise<void> => {
  const source = {
    ...parseEnv(await readFile(resolve(workspaceRoot, '.env'), 'utf8')),
    ...process.env,
  };
  const schema = z.object({
    SUPABASE_URL: z.url(),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SECRET_KEY: z.string().min(1),
  });
  const result = schema.safeParse(source);
  if (!result.success)
    throw new Error('Missing or invalid Supabase server configuration; values omitted.');
  const config = result.data;
  const url = new URL(config.SUPABASE_URL);
  const mcp = z
    .object({ mcp: z.object({ servers: z.object({ supabase: z.object({ url: z.url() }) }) }) })
    .parse(JSON.parse(await readFile(resolve(workspaceRoot, 'opencode.json'), 'utf8')));
  const project = new URL(mcp.mcp.servers.supabase.url).searchParams.get('project_ref');
  if (
    url.protocol !== 'https:' ||
    url.hostname !== `${project}.supabase.co` ||
    url.username ||
    url.password
  ) {
    throw new Error(
      'Supabase API URL and project-scoped MCP target do not match. No request sent.',
    );
  }
  const get = async (path: string, key: string): Promise<Response> =>
    fetch(new URL(path, url), {
      method: 'GET',
      headers: { apikey: key, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  const anonymous = await get(
    '/rest/v1/services?select=id&limit=1',
    config.SUPABASE_PUBLISHABLE_KEY,
  );
  // PostgREST maps 42501 to 401 for anonymous requests and 403 for authenticated requests.
  if (![401, 403].includes(anonymous.status))
    throw new Error('Anonymous database access did not return the expected denial.');
  const anonymousBody: unknown = await anonymous.json();
  if (z.object({ code: z.literal('42501') }).safeParse(anonymousBody).success !== true) {
    throw new Error('Anonymous denial was not the expected PostgreSQL access restriction.');
  }
  const agency = await get(
    '/rest/v1/agency_profile?select=id,name&singleton_key=eq.asterbyte',
    config.SUPABASE_SECRET_KEY,
  );
  if (!agency.ok)
    throw new Error('Privileged read verification failed; credentials and provider body omitted.');
  const agencyBody: unknown = await agency.json();
  const agencies = z
    .array(z.object({ id: z.uuid(), name: z.literal('AsterByte Solutions') }))
    .length(1)
    .parse(agencyBody);
  const pack = await readPack();
  if (agencies[0]?.id !== rows(pack.data, 'agency_profile')[0]?.id)
    throw new Error('Unexpected company record in configured development project.');
  const documents = await get(
    '/rest/v1/knowledge_documents?select=document_key,version,content_sha256,approval_status&import_batch=eq.asterbyte-initial-v1',
    config.SUPABASE_SECRET_KEY,
  );
  if (!documents.ok)
    throw new Error('Knowledge catalog verification failed; provider body omitted.');
  const documentsBody: unknown = await documents.json();
  const catalog = z
    .array(
      z.object({
        document_key: z.string(),
        version: z.string(),
        content_sha256: z.string(),
        approval_status: z.enum(['draft', 'approved', 'retired']),
      }),
    )
    .length(7)
    .parse(documentsBody);
  for (const document of rows(pack.data, 'knowledge_documents')) {
    if (
      !catalog.some(
        (row) =>
          row.document_key === document.document_key &&
          row.version === document.version &&
          row.content_sha256 === document.content_sha256,
      )
    ) {
      throw new Error(`Hosted document source/hash mismatch: ${text(document, 'document_key')}.`);
    }
  }
  console.log(
    `PASS: configured project matches MCP; anonymous REST read denied (${anonymous.status}/42501); server-key company read succeeded; seven hosted snapshot hashes match current Markdown. Only GET requests performed.`,
  );
};

try {
  await main();
} catch {
  // Zod/provider/network errors can include request information: do not dump them or their causes.
  console.error(
    'Supabase read-only REST verification failed. Check project scope, local configuration, applied schema and permissions. No credential values or response bodies were logged.',
  );
  process.exitCode = 1;
}
