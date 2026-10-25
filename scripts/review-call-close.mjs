// Explicitly authorized, bounded live test of remote hangup; no ticket or email is requested.
import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { loadEnvironment } from '../apps/api/src/config/env.ts';
if (!process.argv.includes('--live'))
  throw new Error('Pass --live to authorize one provider call.');
const audio =
  process.env.CLOSING_TEST_WAV ||
  'C:/Users/USER/AppData/Local/Temp/opencode/asterbyte-close-test.wav';
if (!existsSync(audio)) throw new Error('Prepare the synthetic closing WAV first.');
const config = loadEnvironment();
const report = {
  syntheticSpeech: true,
  connected: false,
  remoteHangup: false,
  goodbyeStatementsInTranscript: null,
};
let browser;
let executionId;
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
  const context = await browser.newContext({ permissions: ['microphone'] });
  const page = await context.newPage();
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/api/voice/session' && response.ok())
      void response
        .json()
        .then((body) => {
          executionId = body.run_id;
        })
        .catch(() => {});
  });
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
  await expect(page.locator('.voice-panel')).toHaveClass(/voice-panel--ended/, { timeout: 65000 });
  report.remoteHangup = true;
  if (executionId) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const response = await fetch(`https://api.bolna.ai/executions/${executionId}`, {
        headers: { Authorization: `Bearer ${config.BOLNA_API_KEY}` },
        signal: AbortSignal.timeout(12000),
      });
      if (response.ok) {
        const execution = await response.json();
        if (execution.transcript) {
          report.goodbyeStatementsInTranscript = (
            execution.transcript.match(/assistant:[^\n]*thanks for calling/gi) ?? []
          ).length;
          report.executionId = executionId;
          if (execution.status === 'completed') break;
        }
      }
      await delay(2000);
    }
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  const output = new URL('../artifacts/frontend/', import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(
    new URL('closing-call-review.json', output),
    JSON.stringify(report, null, 2) + '\n',
  );
}
