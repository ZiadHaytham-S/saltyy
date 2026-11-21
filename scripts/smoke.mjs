import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const children = [];

async function ensureFree(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => server.close(resolve));
}
function start(args, directory, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: fileURLToPath(new URL(directory, root)),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output = (output + chunk).slice(-4000);
  });
  child.stderr.on('data', (chunk) => {
    output = (output + chunk).slice(-4000);
  });
  child.on('error', (error) => {
    output += error.message;
  });
  children.push(child);
  return { child, output: () => output };
}
function stop(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
  } else {
    child.kill('SIGTERM');
  }
}
async function waitFor(url, expectedStatus, server) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.child.exitCode !== null)
      throw new Error('Server exited: ' + server.output());
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.status === expectedStatus) return response;
    } catch {
      /* Startup may still be in progress. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Server did not become ready: ' + server.output());
}
try {
  await ensureFree(4000);
  await ensureFree(3000);
  const isolated = start(
    ['--env-file-if-exists=.env', 'dist/main.js'],
    'apps/api/',
    {
      API_PORT: '4000',
      API_HOST: '127.0.0.1',
      MONGODB_URI:
        'mongodb://127.0.0.1:27018/sallty?replicaSet=rs0&directConnection=true',
    },
  );
  await waitFor('http://127.0.0.1:4000/health', 200, isolated);
  const missingDatabase = await waitFor(
    'http://127.0.0.1:4000/ready',
    503,
    isolated,
  );
  assert.equal((await missingDatabase.json()).status, 'not_ready');
  await new Promise((resolve) => setTimeout(resolve, 2500));
  await waitFor('http://127.0.0.1:4000/health', 200, isolated);
  stop(isolated.child);
  await new Promise((resolve) =>
    isolated.child.exitCode !== null
      ? resolve()
      : isolated.child.once('exit', resolve),
  );
  const api = start(
    ['--env-file-if-exists=.env', 'dist/main.js'],
    'apps/api/',
    { API_PORT: '4000', API_HOST: '127.0.0.1' },
  );
  const health = await waitFor('http://127.0.0.1:4000/health', 200, api);
  assert.deepEqual(await health.json(), {
    status: 'ok',
    service: 'sallty-api',
  });
  const ready = await waitFor('http://127.0.0.1:4000/ready', 200, api);
  assert.equal((await ready.json()).transactions, 'supported');
  const next = require.resolve('next/dist/bin/next', {
    paths: [fileURLToPath(new URL('apps/web/', root))],
  });
  const web = start(
    [next, 'start', '--hostname', '127.0.0.1', '--port', '3000'],
    'apps/web/',
    { NEXT_TELEMETRY_DISABLED: '1' },
  );
  const page = await waitFor('http://127.0.0.1:3000', 200, web);
  const html = await page.text();
  assert.match(html, /lang="ar"/);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /سلتي/);
  assert.match(html, /إنشاء حساب تاجر/);
  assert.doesNotMatch(html, /PHASE 03|الداتا بيز/);
  const proxy = await fetch('http://127.0.0.1:3000/api/v1/health');
  assert.equal(proxy.status, 200);
  assert.deepEqual(await proxy.json(), { status: 'ok', service: 'sallty-api' });
  stop(api.child);
  const unavailable = await fetch('http://127.0.0.1:3000');
  assert.equal(unavailable.status, 200);
  assert.match(await unavailable.text(), /إنشاء حساب تاجر/);
  console.log(
    'PASS: production API health/readiness, Arabic RTL public page, Next API rewrite, and public page availability during API outage.',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Smoke check failed');
  process.exitCode = 1;
} finally {
  for (const child of children) stop(child);
}
