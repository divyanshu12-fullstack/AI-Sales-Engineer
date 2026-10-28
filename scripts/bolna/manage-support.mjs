// Read/diff by default. --apply updates the EXISTING agent, retaining a private ignored backup.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadEnvironment } from '../../apps/api/src/config/env.ts';
import { supportTools } from './support-tools.mjs';
import { consultationTools } from './consultation-tools.mjs';

const config = loadEnvironment();
if (
  !config.BOLNA_AGENT_ID ||
  !config.BOLNA_API_KEY ||
  !config.BOLNA_TOOL_AUTH_TOKEN ||
  !config.PUBLIC_API_BASE_URL
)
  throw new Error('Existing Bolna/HTTPS tool configuration is required. Values omitted.');
const base = `https://api.bolna.ai/v2/agent/${config.BOLNA_AGENT_ID}`;
const headers = {
  Authorization: `Bearer ${config.BOLNA_API_KEY}`,
  'Content-Type': 'application/json',
};
const get = async () => {
  const r = await fetch(base, { headers, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Agent read failed: HTTP ${r.status}`);
  return await r.json();
};
const before = await get();
const tasks = structuredClone(before.tasks);
if (tasks.length !== 1 || tasks[0].task_type !== 'conversation')
  throw new Error('Unexpected task layout; manual review required.');
const api = tasks[0].tools_config.api_tools;
const desiredTools = [
  ...supportTools(config.PUBLIC_API_BASE_URL, config.BOLNA_TOOL_AUTH_TOKEN),
  ...consultationTools(config.PUBLIC_API_BASE_URL, config.BOLNA_TOOL_AUTH_TOKEN),
];
for (const t of desiredTools) {
  api.tools = api.tools.filter((t0) => t0.name !== t.definition.name);
  api.tools.push(t.definition);
  api.tools_params[t.definition.name] = t.configuration;
}
// Rebind all existing backend tools after a quick-tunnel rotation; never change their bearer secrets.
for (const tool of Object.values(api.tools_params)) {
  const url = new URL(tool.url);
  if (url.pathname.startsWith('/api/bolna/tools/'))
    tool.url = new URL(url.pathname + url.search, config.PUBLIC_API_BASE_URL).href;
}
const prompt = await readFile(new URL('./support-prompt.md', import.meta.url), 'utf8');
const composition = structuredClone(before.composition_by_language);
if (composition && Object.keys(composition).some((key) => key !== 'en'))
  throw new Error('Unexpected prompt language layout; manual review required.');
const agentConfig = Object.fromEntries(
  Object.entries(before).filter(
    ([key]) =>
      ![
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
      ].includes(key),
  ),
);
agentConfig.tasks = tasks;
agentConfig.webhook_url = `${config.PUBLIC_API_BASE_URL}/api/bolna/webhooks/executions`;
agentConfig.agent_welcome_message =
  "Hi, you've reached AsterByte Solutions. What can I help you with today?";
tasks[0].task_config.call_hangup_message = {
  ...tasks[0].task_config.call_hangup_message,
  en: 'Thanks for calling AsterByte Solutions. Have a good day!',
};
tasks[0].task_config.incremental_delay = 400;
tasks[0].task_config.hangup_after_LLMCall = true;
tasks[0].task_config.call_cancellation_prompt = await readFile(
  new URL('./hangup-prompt.md', import.meta.url),
  'utf8',
);
tasks[0].tools_config.transcriber.endpointing = 700;
// Deepgram supports multi, but this Bolna account rejects it for nova-3. Preserve the working recognizer.
const payload = {
  agent_config: agentConfig,
  agent_prompts: {
    ...before.agent_prompts,
    task_1: { ...before.agent_prompts.task_1, system_prompt: prompt },
  },
  ...(composition ? { composition_by_language: { en: [{ type: 'text', text: prompt }] } } : {}),
};
const fingerprint = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const preserved = (a) => ({
  voice: a.tasks[0].tools_config.synthesizer,
  llm: a.tasks[0].tools_config.llm_agent,
  webhook_headers: a.webhook_headers,
  webhook_config: a.webhook_config,
  call_summary_enabled: a.call_summary_enabled,
  dispositions: a.dispositions,
  oldTools: before.tasks[0].tools_config.api_tools.tools.map((t) => ({
    definition: a.tasks[0].tools_config.api_tools.tools.find((t0) => t0.name === t.name),
    configuration: {
      ...a.tasks[0].tools_config.api_tools.tools_params[t.name],
      url: new URL(a.tasks[0].tools_config.api_tools.tools_params[t.name].url).pathname,
    },
  })),
});
console.log(
  JSON.stringify(
    {
      mode: process.argv.includes('--apply') ? 'apply' : 'read-only proposed changes',
      agentId: before.id,
      existingTools: before.tasks[0].tools_config.api_tools.tools.map((t) => t.name),
      proposedTools: api.tools.map((t) => t.name),
      changes: [
        'Support-first intent routing without a forced initial classification',
        'Natural issue intake and real ticket/email tool outcomes',
        'Consented consultation availability and slot reservation tools',
        'Consultation confirmation email with a pending-until-confirmed meeting state',
        'Unnamed English/Hinglish representative',
        'Rich-text and fallback prompts kept in sync',
        'Working recognizer retained; Bolna does not accept nova-3 multi on this account',
        'Offer further help once, then prompt-based hangup with a single engine-owned goodbye',
        'Webhook and all backend tool URLs moved to the configured HTTPS origin; credentials preserved',
      ],
    },
    null,
    2,
  ),
);
if (process.argv.includes('--apply')) {
  for (const path of [
    'lookup-support-project',
    'create-support-ticket',
    'check-consultation-availability',
    'schedule-consultation',
  ]) {
    const r = await fetch(`${config.PUBLIC_API_BASE_URL}/api/bolna/tools/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.BOLNA_TOOL_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    });
    if (r.status !== 400)
      throw new Error(
        `New backend tool endpoint is not ready: ${path} HTTP ${r.status}. Agent unchanged.`,
      );
  }
  const directory = new URL('../../supabase/.temp/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  await writeFile(
    new URL(`bolna-support-before-${stamp}.json`, directory),
    JSON.stringify(before, null, 2),
  );
  const response = await fetch(base, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    console.error(
      JSON.stringify(
        {
          status: response.status,
          message:
            typeof body.message === 'string'
              ? body.message.replaceAll(config.BOLNA_TOOL_AUTH_TOKEN, '[redacted]')
              : 'Provider rejected agent update',
        },
        null,
        2,
      ),
    );
    throw new Error('Agent update failed. Private pre-change backup retained.');
  }
  const after = await get();
  await writeFile(
    new URL(`bolna-support-after-${stamp}.json`, directory),
    JSON.stringify(after, null, 2),
  );
  const checks = {
    preservedVoiceModelWebhookAndExtractions:
      fingerprint(preserved(before)) === fingerprint(preserved(after)),
    richPromptUpdated: after.composition_by_language?.en?.[0]?.text === prompt,
    fallbackPromptUpdated: after.agent_prompts?.task_1?.system_prompt === prompt,
    toolsPresent: desiredTools.every((t) =>
      after.tasks[0].tools_config.api_tools.tools.some((t0) => t0.name === t.definition.name),
    ),
    callbackUrlsUpdated:
      after.webhook_url === `${config.PUBLIC_API_BASE_URL}/api/bolna/webhooks/executions` &&
      Object.values(after.tasks[0].tools_config.api_tools.tools_params).every(
        (t) => new URL(t.url).origin === config.PUBLIC_API_BASE_URL,
      ),
    hangupPromptUpdated:
      after.tasks[0].task_config.call_cancellation_prompt ===
      tasks[0].task_config.call_cancellation_prompt,
    transcriberLanguage: after.tasks[0].tools_config.transcriber.language,
  };
  console.log(
    JSON.stringify(
      {
        updated: true,
        checks,
        privateBackup:
          'supabase/.temp/bolna-support-before-*.json (contains credentials; never share or commit)',
      },
      null,
      2,
    ),
  );
  if (Object.values(checks).some((v) => v === false))
    throw new Error(
      'Read-back differs from a preservation check. Inspect private backups before further changes.',
    );
}
