import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { supportEmailTemplate } from '../apps/api/src/modules/support/email-template.ts';
const output = new URL('../artifacts/frontend/', import.meta.url);
await mkdir(output, { recursive: true });
const template = supportEmailTemplate({
  reference: 'SUP-EXAMPLE',
  title: 'Appointment list is empty',
  description:
    'The appointment list is not showing any bookings. The issue was first noticed this morning.',
});
await writeFile(new URL('support-email-preview.html', output), template.html);
const executablePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
try {
  const page = await browser.newPage();
  await page.setContent(template.html);
  for (const width of [390, 680]) {
    await page.setViewportSize({ width, height: 850 });
    if (
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth,
      )
    )
      throw new Error('Email preview overflows');
    await page.screenshot({
      path: fileURLToPath(new URL(`support-email-${width}.png`, output)),
      fullPage: true,
    });
  }
  console.log('PASS: lightweight email preview at 390/680px; no email sent.');
} finally {
  await browser.close();
}
