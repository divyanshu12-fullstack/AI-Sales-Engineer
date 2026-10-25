import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  livenessResponseSchema,
  readinessResponseSchema,
} from '../packages/contracts/dist/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const webRoot = join(root, 'apps', 'web');
const webRequire = createRequire(join(webRoot, 'package.json'));
const viteCli = join(dirname(webRequire.resolve('vite/package.json')), 'bin', 'vite.js');
const development = process.argv.includes('--dev');
const children = [];

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      if (address === null || typeof address === 'string') {
        socket.close();
        reject(new Error('Could not allocate a local smoke-test port.'));
        return;
      }
      socket.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });

const start = (name, args, env, cwd = root) => {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const record = { child, name, output: '', error: undefined };
  children.push(record);
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      record.output = (record.output + String(chunk)).slice(-4000);
    });
  }
  child.once('error', (error) => {
    record.error = error;
  });
  return record;
};

const waitFor = async (url, record) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (record.error || record.child.exitCode !== null || record.child.signalCode !== null) {
      throw new Error(`${record.name} failed to start.\n${record.output}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return response;
    } catch {
      // Only startup connection failures are retried; assertions below are not retried.
    }
    await delay(100);
  }
  throw new Error(`${record.name} did not become reachable.\n${record.output}`);
};

const stop = ({ child }) =>
  new Promise((resolve) => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const deadline = setTimeout(() => child.kill('SIGKILL'), 3000);
    deadline.unref();
    child.once('exit', () => {
      clearTimeout(deadline);
      resolve();
    });
    child.kill('SIGTERM');
  });

try {
  const apiPort = await getFreePort();
  let webPort = await getFreePort();
  while (webPort === apiPort) webPort = await getFreePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;
  const api = start(
    'API',
    development ? ['--import', 'tsx', 'apps/api/src/server.ts'] : ['apps/api/dist/server.js'],
    {
      NODE_ENV: development ? 'development' : 'production',
      HOST: '127.0.0.1',
      PORT: String(apiPort),
      WEB_ORIGIN: webUrl,
      LOG_LEVEL: 'silent',
      SUPPORT_EMAIL_WORKER_ENABLED: 'false',
    },
  );
  const web = start(
    'Web',
    [
      viteCli,
      ...(development ? [] : ['preview']),
      '--host',
      '127.0.0.1',
      '--port',
      String(webPort),
      '--strictPort',
    ],
    { PORT: String(apiPort), NODE_ENV: development ? 'development' : 'production' },
    webRoot,
  );

  const live = await waitFor(`${apiUrl}/api/health/live`, api);
  livenessResponseSchema.parse(await live.json());

  const ready = await fetch(`${apiUrl}/api/health/ready`);
  assert.equal(ready.status, 503);
  const readiness = readinessResponseSchema.parse(await ready.json());
  assert(readiness.data.integrations.every(({ status }) => status === 'unavailable'));

  const page = await waitFor(webUrl, web);
  const html = await page.text();
  assert(
    html.includes('<title>AsterByte Solutions | Thoughtful software. Practical outcomes.</title>'),
  );
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)];
  const entry = scripts.find(([, path]) => path !== '/@vite/client')?.[1];
  assert(entry, 'The web page must reference a JavaScript entry point.');
  const asset = await fetch(new URL(entry, webUrl));
  assert.equal(asset.status, 200);
  assert((await asset.text()).length > 0);

  const proxy = await fetch(`${webUrl}/api/health/live`, { headers: { Origin: webUrl } });
  assert.equal(proxy.status, 200);
  livenessResponseSchema.parse(await proxy.json());

  console.log(
    `PASS: ${development ? 'development' : 'built'} API and web startup, health contracts, unavailable integrations, JavaScript asset and API proxy.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Smoke test failed.');
  process.exitCode = 1;
} finally {
  // Only these two directly spawned Node processes are stopped, never unrelated servers.
  await Promise.all(children.map(stop));
}
