// Rotate callback origins only. Never replace live prompts, voices, models, schemas or credentials.
import { mkdir, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { loadEnvironment } from '../../apps/api/src/config/env.ts';

const config = loadEnvironment();
if (
  !config.PUBLIC_API_BASE_URL ||
  !config.BOLNA_AGENT_ID ||
  !config.BOLNA_API_KEY ||
  !config.BOLNA_TOOL_AUTH_TOKEN
)
  throw new Error('Existing agent and HTTPS callback configuration required. Values omitted.');
const endpoint = `https://api.bolna.ai/v2/agent/${config.BOLNA_AGENT_ID}`;
const headers = {
  Authorization: `Bearer ${config.BOLNA_API_KEY}`,
  'Content-Type': 'application/json',
};
const get = async () => {
  const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Agent read failed: HTTP ${response.status}`);
  return response.json();
};
const responseFields = [
  'id',
  'agent_status',
  'created_at',
  'updated_at',
  'agent_prompts',
  'composition_by_language',
  'created_by',
  'parent_agent_id',
  'source_agent_id',
  'creation_source',
  'restricted',
];
const agentConfig = (agent) =>
  Object.fromEntries(Object.entries(agent).filter(([key]) => !responseFields.includes(key)));
const before = await get();
const next = structuredClone(before);
const tools = next.tasks
  .flatMap((task) => Object.values(task.tools_config?.api_tools?.tools_params ?? {}))
  .filter((tool) => new URL(tool.url).pathname.startsWith('/api/bolna/tools/'));
if (tools.length !== 4)
  throw new Error('Expected four existing backend tools; inspect before updating.');
for (const tool of tools) {
  const url = new URL(tool.url);
  tool.url = new URL(url.pathname + url.search, config.PUBLIC_API_BASE_URL).href;
}
next.webhook_url = `${config.PUBLIC_API_BASE_URL}/api/bolna/webhooks/executions`;
console.log(
  JSON.stringify(
    {
      mode: process.argv.includes('--apply') ? 'apply' : 'read-only',
      origin: config.PUBLIC_API_BASE_URL,
      backendTools: tools.length,
    },
    null,
    2,
  ),
);
if (process.argv.includes('--apply')) {
  // Invalid inputs prove route/auth reachability without requesting a business action.
  for (const tool of tools) {
    const response = await fetch(tool.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.BOLNA_TOOL_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    });
    if (response.status !== 400)
      throw new Error(`Tool preflight failed: HTTP ${response.status}. Agent unchanged.`);
  }
  const directory = new URL('../../supabase/.temp/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  await writeFile(
    new URL(`bolna-callback-before-${stamp}.json`, directory),
    JSON.stringify(before, null, 2),
  );
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      agent_config: agentConfig(next),
      agent_prompts: next.agent_prompts,
      ...(next.composition_by_language
        ? { composition_by_language: next.composition_by_language }
        : {}),
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`Callback update rejected: HTTP ${response.status}. Private backup retained.`);
  const after = await get();
  await writeFile(
    new URL(`bolna-callback-after-${stamp}.json`, directory),
    JSON.stringify(after, null, 2),
  );
  const checks = {
    allConfigurationPreservedExceptCallbackOrigins: isDeepStrictEqual(
      agentConfig(next),
      agentConfig(after),
    ),
    promptsPreserved:
      isDeepStrictEqual(before.agent_prompts, after.agent_prompts) &&
      isDeepStrictEqual(before.composition_by_language, after.composition_by_language),
  };
  console.log(
    JSON.stringify(
      {
        updated: true,
        checks,
        privateBackups: 'supabase/.temp/bolna-callback-*.json (credential-bearing; never share)',
      },
      null,
      2,
    ),
  );
  if (Object.values(checks).some((value) => !value))
    throw new Error('Read-back differs; inspect private backups before any further update.');
}
