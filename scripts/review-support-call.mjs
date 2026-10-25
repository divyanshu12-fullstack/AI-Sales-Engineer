// One bounded provider-backed browser call with synthetic speech. Uses the owner's ALREADY RUNNING servers.
// May create one explicitly described demo support ticket; never exports credentials or transcripts.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { loadEnvironment } from '../apps/api/src/config/env.ts';
import { Database } from '../apps/api/src/lib/database.ts';

if (!process.argv.includes('--live'))
  throw new Error('Pass --live to authorize one provider call and its demo ticket.');
const audio =
  process.env.SUPPORT_TEST_WAV ||
  'C:/Users/USER/AppData/Local/Temp/opencode/asterbyte-support-test.wav';
if (!existsSync(audio)) throw new Error('Generate the synthetic support-test WAV first.');
const config = loadEnvironment();
const db = new Database(config);
const output = new URL('../artifacts/frontend/', import.meta.url);
await mkdir(output, { recursive: true });
const report = {
  syntheticSpeech: true,
  connected: false,
  ticketCreatedFromVoice: false,
  issueDetailsCaptured: false,
  emailRecipientIsSeededAndDisabled: true,
};
const started = new Date().toISOString();
let browser;
try {
  const executablePath = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${audio}%noloop`,
    ],
  });
  const context = await browser.newContext({
    permissions: ['microphone'],
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('checkbox', { name: /I agree to microphone/ }).check();
  await expect(
    page.getByRole('button', { name: 'Start a conversation', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Start a conversation', exact: true }).click();
  await expect(page.locator('.voice-panel')).toHaveClass(/voice-panel--connected/, {
    timeout: 45000,
  });
  report.connected = true;
  const deadline = Date.now() + 85000;
  while (Date.now() < deadline) {
    const tickets = await db.request(
      `support_ticket_dashboard?select=id,code,title,description,contacts&reported_at=gte.${encodeURIComponent(started)}&projects->>support_code=eq.2001&order=reported_at.desc&limit=2`,
    );
    if (Array.isArray(tickets) && tickets.length) {
      report.ticketCreatedFromVoice = true;
      report.ticketReference = tickets[0].code;
      report.issueDetailsCaptured = /appointment/i.test(tickets[0].description);
      report.emailRecipientIsSeededAndDisabled = !tickets[0].contacts.support_email_enabled;
      await delay(8000);
      break;
    }
    await delay(2500);
  }
  await page
    .locator('.voice-panel')
    .screenshot({ path: fileURLToPath(new URL('support-voice-connected.png', output)) });
  const end = page.getByRole('button', { name: 'End call', exact: true });
  if (await end.count()) await end.click();
  assert(
    report.ticketCreatedFromVoice,
    'The bounded call connected but did not create a ticket. Inspect provider conversation separately; do not retry automatically.',
  );
  assert(
    report.issueDetailsCaptured,
    'Ticket exists but the spoken appointment issue was not captured.',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await writeFile(
    new URL('support-call-review.json', output),
    JSON.stringify(report, null, 2) + '\n',
  );
}
