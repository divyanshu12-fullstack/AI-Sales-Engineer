// Bounded real-browser UI review. No production auth bypass or SDK mock is shipped in the app.
// Dashboard screenshots use isolated intercepted TEST DATA, never private customer records.
// --live-call additionally authorizes ONE real provider browser-call attempt (synthetic microphone).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'artifacts', 'frontend');
const fixture = JSON.parse(
  await readFile(join(root, 'apps/web/test/fixtures/dashboard.json'), 'utf8'),
);
fixture.support = JSON.parse(
  await readFile(join(root, 'apps/web/test/fixtures/support.json'), 'utf8'),
);
const liveCall = process.argv.includes('--live-call');
const reportFile = liveCall ? 'live-call-review.json' : 'review.json';
const children = [];
let browser;
const report = {
  dataset:
    'Public copy is approved knowledge. Dashboard data is an isolated UI test fixture, NOT hosted customer data.',
  widths: [],
  screenshots: [],
  browserCall: {
    attempted: false,
    connected: false,
    remoteAudioReceived: false,
    humanAudioTested: false,
  },
  errors: [],
};
const port = () =>
  new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      if (!address || typeof address === 'string') {
        socket.close();
        reject(new Error('No port'));
        return;
      }
      socket.close(() => resolve(address.port));
    });
  });
const start = (args, env, cwd = root) => {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
  });
  children.push(child);
  return child;
};
const wait = async (url) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* bounded owned-server startup */
    }
    await delay(150);
  }
  throw new Error('Review servers did not start');
};
const screenshot = async (page, name, fullPage = true) => {
  await page.screenshot({ path: join(output, name), fullPage, animations: 'disabled' });
  report.screenshots.push(name);
};
const noOverflow = async (page, width, surface) => {
  const measured = await page.evaluate(() => ({
    viewport: globalThis.innerWidth,
    document: globalThis.document.documentElement.scrollWidth,
  }));
  assert(
    measured.document <= measured.viewport,
    `${surface} overflows at ${width}px (${measured.document})`,
  );
  report.widths.push({ surface, width, overflow: false });
};

try {
  await mkdir(output, { recursive: true });
  const apiPort = await port();
  const webPort = await port();
  const url = `http://127.0.0.1:${webPort}`;
  const webRoot = join(root, 'apps/web');
  const require = createRequire(join(webRoot, 'package.json'));
  const vite = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js');
  start(['--import', 'tsx', 'apps/api/src/server.ts'], {
    PORT: String(apiPort),
    WEB_ORIGIN: url,
    LOG_LEVEL: 'silent',
    SUPPORT_EMAIL_WORKER_ENABLED: 'false',
    NODE_ENV: 'development',
  });
  start(
    [vite, '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'],
    { PORT: String(apiPort), NODE_ENV: 'development' },
    webRoot,
  );
  await wait(`${url}/api/health/live`);
  const executablePath =
    process.env.CHROME_PATH ||
    [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ].find(existsSync);
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ['microphone'],
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.name));
  let sessions = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/voice/session') sessions++;
  });
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 600 ? 900 : 1000 });
    await page.goto(url);
    await expect(
      page.getByRole('heading', { name: /Software that helps your business grow/ }),
    ).toBeVisible();
    await expect(page.locator('.project-card')).toHaveCount(3);
    await expect(page.locator('.header-talk')).toHaveAttribute('href', '/demo');
    await page.evaluate(() => globalThis.document.fonts.ready);
    await expect(
      page.getByRole('button', { name: 'Start a conversation', exact: true }),
    ).toBeVisible();
    await noOverflow(page, width, 'public');
    if (width === 1440) {
      await screenshot(page, 'public-desktop.png');
      await screenshot(page, 'public-desktop-hero.png', false);
      await page
        .locator('.voice-panel')
        .screenshot({ path: join(output, 'call-interface-idle.png') });
      report.screenshots.push('call-interface-idle.png');
    }
    if (width === 390) {
      await screenshot(page, 'public-mobile.png');
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
      await expect(
        page
          .getByRole('navigation', { name: 'Mobile navigation' })
          .getByRole('link', { name: 'Project Demo' }),
      ).toHaveAttribute('href', '/demo');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toHaveCount(0);
    }
    if (width === 390 || width === 1440) {
      await page.locator('#work').scrollIntoViewIfNeeded();
      await expect(page.locator('.floating-talk')).toBeVisible();
      await page.locator('.floating-talk').click();
      await expect(page.locator('.voice-panel')).toBeInViewport();
    }
  }
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${url}/demo`);
    await expect(
      page.getByRole('heading', { name: 'AI sales & customer support representative' }),
    ).toBeVisible();
    await expect(page.locator('.project-test')).toHaveCount(3);
    await expect(page.locator('.voice-panel')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Pitch video coming soon' })).toBeDisabled();
    await expect(page.getByRole('link', { name: 'Open admin dashboard' })).toHaveAttribute(
      'href',
      '/admin',
    );
    await page.evaluate(() => globalThis.document.fonts.ready);
    await noOverflow(page, width, 'project-demo');
    if (width === 390) await screenshot(page, 'project-demo-mobile.png');
    if (width === 1440) {
      await screenshot(page, 'project-demo-desktop.png');
      await screenshot(page, 'project-demo-hero.png', false);
    }
    await page.getByRole('tab', { name: 'Returning customer' }).click();
    await expect(page.getByRole('tabpanel')).toContainText(
      'Help an existing customer report a problem',
    );
    if (width === 1440) await screenshot(page, 'project-demo-support-workflow.png', false);
    await page.getByRole('tab', { name: 'New customer' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tabpanel')).toContainText('Ask permission to take it further');
    await page.getByRole('tab', { name: 'New customer' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Returning customer' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: 'New customer' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.locator('.project-test').nth(1).locator('summary').click();
    await expect(page.locator('.project-test').nth(1)).toContainText(
      'fictional contact with email sending disabled',
    );
  }
  assert.equal(sessions, 0, 'Rendering or resizing must not mint sessions');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url);
  await page.getByText('Will I own the source code?', { exact: true }).click();
  await expect(page.getByText(/Your custom code is handed over/)).toBeVisible();
  await page.route('**/api/voice/session', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'INTEGRATION_UNAVAILABLE' } }),
    }),
  );
  await page.getByRole('checkbox', { name: /I agree to microphone/ }).check();
  await expect(
    page.getByRole('button', { name: 'Start a conversation', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Start a conversation', exact: true }).click();
  await expect(page.locator('.voice-panel')).toHaveClass(/voice-panel--failed/);
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  await page.locator('.voice-panel').screenshot({ path: join(output, 'call-interface-error.png') });
  report.screenshots.push('call-interface-error.png');

  const admin = await context.newPage();
  admin.on('pageerror', (error) => report.errors.push(error.name));
  await admin.route('**/api/auth/config', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        url: 'https://auth.example.invalid',
        publishableKey: 'ui-test-public-key',
      }),
    }),
  );
  const userId = '90000000-0000-4000-8000-000000000001';
  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: userId, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture-signature`;
  await admin.route('https://auth.example.invalid/**', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': url,
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: token,
        refresh_token: 'fixture-only',
        token_type: 'bearer',
        expires_in: 3600,
        user: {
          id: userId,
          aud: 'authenticated',
          email: 'review@example.invalid',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: '2026-10-24T10:00:00Z',
        },
      }),
    }),
  );
  await admin.route('**/api/admin/activity', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: fixture }) }),
  );
  await admin.route('**/api/admin/knowledge/*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: '70000000-0000-4000-8000-000000000001',
          document_key: 'services-pricing',
          title: 'Services, pricing and delivery',
          version: '1.1',
          content_markdown:
            '# Services and pricing\n\nApproved example service information for the isolated UI review.',
          content_sha256: 'a'.repeat(64),
        },
      }),
    }),
  );
  await admin.goto(`${url}/admin`);
  await expect(admin.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await admin.evaluate(() => globalThis.document.fonts.ready);
  await screenshot(admin, 'dashboard-sign-in.png', false);
  await admin.getByLabel('Email address').fill('review@example.invalid');
  await admin.getByLabel('Password', { exact: true }).fill('fixture-password-not-a-real-account');
  await admin.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(admin.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(admin.getByText('Potential Leads', { exact: true })).toBeVisible();
  await screenshot(admin, 'dashboard-fixture-desktop.png', false);
  await admin
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('button', { name: 'Calls', exact: true })
    .click();
  await admin.getByLabel('Filter by source').selectOption('imported');
  await expect(admin.getByText('CALL-IMPORTED-EXAMPLE', { exact: true })).toBeVisible();
  await expect(admin.getByText('CALL-BROWSER-EXAMPLE', { exact: true })).toHaveCount(0);
  await admin.getByLabel('Filter by source').selectOption('all');
  await admin.getByRole('button', { name: 'View call CALL-BROWSER-EXAMPLE', exact: true }).click();
  await expect(admin.getByRole('dialog')).toBeVisible();
  await expect(admin.getByText('No linked inquiry in recent records.')).toBeVisible();
  await screenshot(admin, 'dashboard-call-detail-fixture.png', false);
  await admin.keyboard.press('Escape');
  await expect(admin.getByRole('dialog')).not.toBeVisible();
  await screenshot(admin, 'dashboard-calls-fixture.png', false);
  for (const width of [320, 390, 768, 1440]) {
    await admin.setViewportSize({ width, height: 900 });
    await noOverflow(admin, width, 'dashboard-calls');
    await admin
      .getByRole('navigation')
      .getByRole('button', { name: 'Overview', exact: true })
      .click();
    await noOverflow(admin, width, 'dashboard-overview');
    if (width === 390) await screenshot(admin, 'dashboard-fixture-mobile.png', false);
    await admin.getByRole('navigation').getByRole('button', { name: 'Calls', exact: true }).click();
  }
  await admin
    .getByRole('navigation')
    .getByRole('button', { name: 'Tools & activity', exact: true })
    .click();
  await admin
    .getByRole('button', { name: 'View tool attempt 40000000-0000-4000-8000-000000000001' })
    .click();
  await expect(admin.getByText('services-pricing · v1.1 · passage 1')).toBeVisible();
  await admin.keyboard.press('Escape');
  await admin
    .getByRole('navigation')
    .getByRole('button', { name: 'Knowledge status', exact: true })
    .click();
  await admin.getByRole('button', { name: /Services, pricing and delivery/ }).click();
  await expect(
    admin.getByText('Approved example service information for the isolated UI review.'),
  ).toBeVisible();
  await screenshot(admin, 'knowledge-document-fixture.png', false);
  await admin.keyboard.press('Escape');
  await admin
    .getByRole('navigation')
    .getByRole('button', { name: 'Meetings', exact: true })
    .click();
  await expect(admin.getByText('Website discovery call', { exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await admin.setViewportSize({ width, height: 1000 });
    await noOverflow(admin, width, 'dashboard-meetings');
  }
  await screenshot(admin, 'meetings-fixture.png', false);
  await admin
    .getByRole('navigation')
    .getByRole('button', { name: 'Support tickets', exact: true })
    .click();
  await expect(admin.getByText('Appointment list is empty', { exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await admin.setViewportSize({ width, height: 1000 });
    await noOverflow(admin, width, 'dashboard-support');
  }
  await screenshot(admin, 'support-tickets-fixture.png', false);
  await admin.getByRole('button', { name: 'Appointment list is empty', exact: true }).click();
  await expect(admin.getByRole('dialog')).toBeVisible();
  await expect(admin.getByText(/Sending disabled for this demo contact/)).toBeVisible();
  await screenshot(admin, 'support-ticket-detail-fixture.png', false);
  await admin.route('**/api/admin/support/tickets/*', async (route) => {
    const body = route.request().postDataJSON();
    assert.equal(body.status, 'resolved');
    assert(body.resolution.length >= 5);
    fixture.support.tickets[0].status = 'resolved';
    fixture.support.tickets[0].resolution_summary = body.resolution;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: { ticket_id: fixture.support.tickets[0].id, changed: true } }),
    });
  });
  await admin.getByLabel('Status', { exact: true }).selectOption('resolved');
  await admin
    .getByLabel('Resolution notes')
    .fill('Corrected the appointment filter and verified the booking list.');
  await admin.getByRole('button', { name: 'Save ticket update' }).click();
  await expect(admin.getByRole('dialog').locator('.detail-status')).toContainText('Resolved');
  await admin.keyboard.press('Escape');
  await admin.unroute('**/api/admin/activity');
  await admin.route('**/api/admin/activity', (route) =>
    route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }),
  );
  await admin.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(
    admin.getByRole('heading', { name: 'Administrator access is required.' }),
  ).toBeVisible();
  await expect(admin.getByText('Inventory & order workflow', { exact: true })).toHaveCount(0);
  assert.equal(
    (await context.request.get(`${url}/api/admin/activity`)).status(),
    401,
    'Real backend still requires authorization',
  );

  if (liveCall) {
    report.browserCall.attempted = true;
    const live = await context.newPage();
    await live.goto(url);
    await live.getByRole('checkbox', { name: /I agree to microphone/ }).check();
    await expect(
      live.getByRole('button', { name: 'Start a conversation', exact: true }),
    ).toBeEnabled();
    await live.getByRole('button', { name: 'Start a conversation', exact: true }).click();
    try {
      await expect(live.locator('.voice-panel')).toHaveClass(/voice-panel--connected/, {
        timeout: 45_000,
      });
      report.browserCall.connected = true;
      const deadline = Date.now() + 8000;
      let maxLevel = 0;
      while (Date.now() < deadline) {
        maxLevel = Math.max(
          maxLevel,
          await live
            .locator('.voice-symbol')
            .evaluate((element) => Number(element.style.getPropertyValue('--voice-level'))),
        );
        await delay(200);
      }
      report.browserCall.remoteAudioReceived = maxLevel > 0;
      report.browserCall.remoteAudioLevelObserved = maxLevel > 0;
      report.browserCall.audioTracks = await live.evaluate(() =>
        [...globalThis.document.querySelectorAll('audio')].flatMap(
          (audio) =>
            audio.srcObject
              ?.getAudioTracks()
              .map((track) => ({ kind: track.kind, readyState: track.readyState })) ?? [],
        ),
      );
      await live
        .locator('.voice-panel')
        .screenshot({ path: join(output, 'call-interface-connected.png') });
      report.screenshots.push('call-interface-connected.png');
      await live.getByRole('button', { name: 'Mute', exact: true }).click();
      await expect(live.getByRole('button', { name: 'Unmute', exact: true })).toBeVisible();
      await live.getByRole('button', { name: 'End call', exact: true }).click();
      await expect(live.locator('.voice-panel')).toHaveClass(/voice-panel--ended/, {
        timeout: 10_000,
      });
      report.browserCall.muteAndEndVerified = true;
    } catch {
      report.browserCall.limitation =
        'The one bounded real browser call attempt did not complete all checks. Inspect the customer-facing error and provider web-call entitlement/network settings. No configuration was changed.';
      report.browserCall.visibleError = await live
        .locator('.voice-error')
        .textContent()
        .catch(() => null);
      await live
        .locator('.voice-panel')
        .screenshot({ path: join(output, 'call-interface-live-attempt.png') });
      report.screenshots.push('call-interface-live-attempt.png');
      await live.close();
    }
  }
  assert.equal(report.errors.length, 0, 'Browser runtime errors occurred (names only retained)');
  await writeFile(join(output, reportFile), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        result: 'Browser UI review passed',
        widths: report.widths,
        screenshots: report.screenshots,
        browserCall: report.browserCall,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await mkdir(output, { recursive: true });
  await writeFile(join(output, reportFile), JSON.stringify(report, null, 2) + '\n');
  console.error(
    error instanceof Error
      ? error.message.replaceAll(/Bearer\s+[^\s]+/g, 'Bearer [redacted]')
      : 'Visual review failed',
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null) {
            resolve();
            return;
          }
          child.once('exit', resolve);
          child.kill('SIGTERM');
        }),
    ),
  );
}
