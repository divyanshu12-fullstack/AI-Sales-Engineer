// Read/diff by default. --apply updates the EXISTING agent, retaining a private ignored backup.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { loadEnvironment } from '../../apps/api/src/config/env.ts';
import { supportTools } from './support-tools.mjs';
import { consultationTools } from './consultation-tools.mjs';

const config = loadEnvironment();
if (!config.BOLNA_AGENT_ID || !config.BOLNA_API_KEY || !config.BOLNA_TOOL_AUTH_TOKEN)
  throw new Error('Existing Bolna and HTTPS tool configuration is required. Values omitted.');
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
const callbackOrigin = new URL(before.webhook_url).origin;
if (!callbackOrigin.startsWith('https://'))
  throw new Error('The existing Bolna webhook must use HTTPS. Agent unchanged.');
const tasks = structuredClone(before.tasks);
if (tasks.length !== 1 || tasks[0].task_type !== 'conversation')
  throw new Error('Unexpected task layout; manual review required.');
const api = tasks[0].tools_config.api_tools;
const desiredTools = [
  ...supportTools(callbackOrigin, config.BOLNA_TOOL_AUTH_TOKEN),
  ...consultationTools(callbackOrigin, config.BOLNA_TOOL_AUTH_TOKEN),
];
for (const t of desiredTools) {
  api.tools = api.tools.filter((t0) => t0.name !== t.definition.name);
  api.tools.push(t.definition);
  api.tools_params[t.definition.name] = t.configuration;
}
// Keep the existing public callback origin; a stale local .env must not rewrite live Bolna URLs.
for (const tool of Object.values(api.tools_params)) {
  const url = new URL(tool.url);
  if (url.pathname.startsWith('/api/bolna/tools/') && url.origin !== callbackOrigin)
    throw new Error('Existing Bolna tool and webhook origins differ. Agent unchanged.');
}
const prompt = await readFile(new URL('./support-prompt.md', import.meta.url), 'utf8');
const localizedPrompts = Object.fromEntries(
  await Promise.all(
    ['mr', 'bn', 'te', 'kn'].map(async (language) => [
      language,
      `${await readFile(new URL(`./language-prompts/${language}.md`, import.meta.url), 'utf8')}\n\n---\n\n${prompt}`,
    ]),
  ),
);
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
const task = tasks[0];
const toolsConfig = task.tools_config;
const sharedVoice = {
  provider: 'sarvam',
  provider_config: {
    voice: 'Shubh',
    voice_id: 'shubh',
    model: 'bulbul:v3',
    language: 'en',
  },
  stream: true,
  buffer_size: before.tasks[0].tools_config.synthesizer.buffer_size ?? 150,
};
const regionalLanguages = Object.fromEntries(
  Object.entries(localizedPrompts).map(([language, system_prompt]) => [
    language,
    {
      transcriber: { language },
      synthesizer: {
        ...sharedVoice,
        provider_config: { ...sharedVoice.provider_config, language },
      },
      system_prompt,
    },
  ]),
);
const multilingualConfig = {
  enabled: true,
  active_language: 'en',
  language_switch_trigger: 'caller_requested',
  languages: {
    en: {
      transcriber: { language: 'en' },
      synthesizer: sharedVoice,
      system_prompt: prompt,
    },
    ...regionalLanguages,
  },
};
toolsConfig.transcriber = {
  ...toolsConfig.transcriber,
  provider: 'sarvam',
  model: 'saaras:v4',
  language: 'en',
};
toolsConfig.synthesizer = sharedVoice;
toolsConfig.multilingual_config = multilingualConfig;
agentConfig.tasks = tasks;
agentConfig.webhook_url = before.webhook_url;
agentConfig.agent_welcome_message =
  "Hi, you've reached AsterByte Solutions. What can I help you with today?";
task.task_config.call_hangup_message = {
  en: 'Thanks for calling AsterByte Solutions. Have a good day!',
  mr: 'AsterByte Solutions ला फोन केल्याबद्दल धन्यवाद. तुमचा दिवस छान जावो!',
  bn: 'AsterByte Solutions-এ কল করার জন্য ধন্যবাদ। আপনার দিনটি ভালো কাটুক!',
  te: 'AsterByte Solutions‌కు కాల్ చేసినందుకు ధన్యవాదాలు. మీ రోజు శుభంగా గడవాలి!',
  kn: 'AsterByte Solutions‌ಗೆ ಕರೆ ಮಾಡಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ದಿನ ಶುಭವಾಗಿರಲಿ!',
};
task.task_config.incremental_delay = 400;
task.task_config.hangup_after_LLMCall = true;
task.task_config.call_cancellation_prompt = await readFile(
  new URL('./hangup-prompt.md', import.meta.url),
  'utf8',
);
task.tools_config.transcriber.endpointing = task.tools_config.transcriber.endpointing ?? 700;
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
        'English/Hinglish by default; Marathi, Bengali, Telugu and Kannada only after an explicit request',
        'Sarvam Saaras v4 transcription and one shared Sarvam Bulbul v3 Shubh voice across languages',
        'Native-script language guidance with existing tool and safety rules preserved',
        'Rich-text and fallback prompts kept in sync',
        'Offer further help once, then prompt-based hangup with a single engine-owned goodbye',
        'Existing HTTPS webhook and backend tool origins preserved; credentials preserved',
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
    const r = await fetch(`${callbackOrigin}/api/bolna/tools/${path}`, {
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
    preservedLlmWebhookAndTools: fingerprint(preserved(before)) === fingerprint(preserved(after)),
    richPromptUpdated: after.composition_by_language?.en?.[0]?.text === prompt,
    fallbackPromptUpdated: after.agent_prompts?.task_1?.system_prompt === prompt,
    toolsPresent: desiredTools.every((t) =>
      after.tasks[0].tools_config.api_tools.tools.some((t0) => t0.name === t.definition.name),
    ),
    callbackUrlsUpdated:
      after.webhook_url === before.webhook_url &&
      Object.values(after.tasks[0].tools_config.api_tools.tools_params).every(
        (t) =>
          !new URL(t.url).pathname.startsWith('/api/bolna/tools/') ||
          new URL(t.url).origin === callbackOrigin,
      ),
    hangupPromptUpdated:
      after.tasks[0].task_config.call_cancellation_prompt ===
      task.task_config.call_cancellation_prompt,
    hangupMessagesUpdated: isDeepStrictEqual(
      after.tasks[0].task_config.call_hangup_message,
      task.task_config.call_hangup_message,
    ),
    explicitLanguageSwitchOnly:
      after.tasks[0].tools_config.multilingual_config?.language_switch_trigger ===
      'caller_requested',
    configuredLanguages:
      JSON.stringify(
        Object.keys(after.tasks[0].tools_config.multilingual_config?.languages ?? {}).sort(),
      ) === JSON.stringify(['bn', 'en', 'kn', 'mr', 'te']),
    sameSarvamVoiceEverywhere: Object.values(
      after.tasks[0].tools_config.multilingual_config?.languages ?? {},
    ).every(
      (language) =>
        language.synthesizer?.provider === 'sarvam' &&
        language.synthesizer?.provider_config?.model === 'bulbul:v3' &&
        language.synthesizer?.provider_config?.voice_id === 'shubh',
    ),
    sarvamTranscriberEverywhere:
      after.tasks[0].tools_config.transcriber.provider === 'sarvam' &&
      after.tasks[0].tools_config.transcriber.model === 'saaras:v4',
    localizedPromptsUpdated: Object.entries(multilingualConfig.languages).every(
      ([language, value]) =>
        after.tasks[0].tools_config.multilingual_config?.languages?.[language]?.system_prompt ===
        value.system_prompt,
    ),
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
