import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const images = resolve(root, '../docs/images');
const directory = await mkdtemp(resolve(tmpdir(), 'noticetv-docs-'));
const port = Number(process.env.NOTICETV_DOCS_PORT || 3002);
assert(Number.isInteger(port) && port > 0 && port < 65536, 'Choose a valid documentation port.');
const origin = `http://127.0.0.1:${port}`;
const key = randomBytes(32).toString('base64url');
const captureTime = new Date('2026-05-12T09:41:00Z');
const server = spawn(process.execPath, ['build/server/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    NOTICETV_HOST: '127.0.0.1',
    NOTICETV_ORIGIN: origin,
    NOTICETV_DATA_DIR: directory,
    NOTICETV_EDITOR_KEY: key,
    NOTICETV_SECURE_COOKIES: '0',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let browser;
try {
  await new Promise((ready, reject) => {
    let output = '';
    const timeout = setTimeout(
      () => reject(new Error('Documentation server did not start. Build the app first.')),
      15_000,
    );
    server.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('NoticeTV is ready')) {
        clearTimeout(timeout);
        ready();
      }
    });
    server.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    server.once('exit', () => {
      clearTimeout(timeout);
      reject(new Error('Documentation server exited before startup.'));
    });
  });
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'UTC',
    locale: 'en-US',
    reducedMotion: 'reduce',
  });
  const blocked = [];
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === origin) await route.continue();
    else {
      blocked.push(route.request().url());
      await route.abort('blockedbyclient');
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Keep the fictional agenda, forecast dates, clock, and year progress consistent between captures.
  await page.clock.setFixedTime(captureTime);
  await mkdir(images, { recursive: true });
  await page.goto(`${origin}/demo`);
  await expect(page.locator('.dashboard')).toHaveAttribute('data-theme', 'graphite');
  await page.evaluate(() => document.fonts.ready);
  const shot = async (locator, name) =>
    locator.screenshot({ path: resolve(images, name), animations: 'disabled', scale: 'css' });
  await shot(page, 'noticetv-editor.png');
  for (const [id, name] of [
    ['graphite', 'Graphite'],
    ['midnight', 'Midnight'],
    ['paper', 'Paper'],
    ['ember', 'Ember'],
    ['moss', 'Moss'],
  ]) {
    await page.getByRole('radio', { name, exact: true }).check();
    await expect(page.locator('.dashboard')).toHaveAttribute('data-theme', id);
    await shot(page.locator('.canvas-frame'), `noticetv-theme-${id}.png`);
  }
  await page.getByRole('radio', { name: 'Graphite', exact: true }).check();
  await page.getByRole('button', { name: 'Add widget', exact: true }).click();
  await shot(page.getByRole('dialog'), 'noticetv-widgets.png');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await shot(page.getByRole('dialog').locator('.dashboard'), 'noticetv-dashboard.png');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: resolve(images, 'noticetv-editor-phone.png'),
    fullPage: true,
    animations: 'disabled',
    scale: 'css',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin);
  await page.getByLabel('Editor key', { exact: true }).fill(key);
  await page.getByRole('button', { name: 'Open your editor', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your dashboard', exact: true })).toBeVisible();
  await page.route(`${origin}/api/pairing`, (route) =>
    route.fulfill({ json: { code: '381726', expires: captureTime.getTime() + 5 * 60_000 } }),
  );
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Connect a screen', exact: true })
    .click();
  await expect(page.getByLabel('Pairing code')).toContainText(/\d{6}/);
  await shot(page.getByRole('dialog'), 'noticetv-pairing.png');
  assert.deepEqual(errors, [], 'Captures must not contain application errors.');
  assert.deepEqual(blocked, [], 'Documentation captures must not request external services.');
  console.log(`Captured ten documentation screenshots in docs/images using fictional data.`);
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = once(server, 'exit');
    server.kill('SIGTERM');
    await stopped;
  }
  await rm(directory, { recursive: true, force: true });
}
