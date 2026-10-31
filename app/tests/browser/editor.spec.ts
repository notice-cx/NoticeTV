import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { createDashboard, type Document } from '../../shared/dashboard';

const fixtureKey = 'noticetv-browser-test-fixture-only';

test('editor and widget collection meet automated accessibility checks', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Home, in the here & now.' })).toBeVisible();
  const editor = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    editor.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Add widget', exact: true }).click();
  const collection = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    collection.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map(({ target }) => target),
    })),
  ).toEqual([]);
});

test.beforeEach(async ({ context }) => {
  // The entire suite is offline except for its own loopback server and explicit fixtures.
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      await route.continue();
      return;
    }
    if (url.hostname === 'geocoding-api.open-meteo.com') {
      await route.fulfill({
        json: {
          results: [
            { id: 1, name: 'Test City', latitude: 40, longitude: -73, country: 'Test Country' },
          ],
        },
      });
      return;
    }
    if (url.hostname === 'api.open-meteo.com') {
      await route.fulfill({
        json: {
          current: {
            temperature_2m: 18,
            relative_humidity_2m: 60,
            weather_code: 2,
            wind_speed_10m: 8,
            is_day: 1,
          },
          daily: {
            time: ['2026-10-31'],
            weather_code: [2],
            temperature_2m_max: [20],
            temperature_2m_min: [12],
          },
        },
      });
      return;
    }
    await route.abort('blockedbyclient');
  });
});

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Editor key', { exact: true }).fill(fixtureKey);
  await page.getByRole('button', { name: 'Open your editor', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your dashboard', exact: true })).toBeVisible();
  const current = (await (await page.request.get('/api/document')).json()) as Document;
  await page.request.post('/api/publish', {
    headers: { Origin: 'http://localhost:3001' },
    data: { dashboard: createDashboard(), baseRevision: current.revision },
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your dashboard', exact: true })).toBeVisible();
}

test('demo renders at desktop and phone sizes, with an accessible widget collection', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Home, in the here & now.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/noticetv-editor-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Add widget', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Live stream', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/noticetv-widget-collection.png' });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Add widget', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/noticetv-editor-phone.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('a draft stays off the display until published and a paired screen cannot edit', async ({
  page,
  browser,
}) => {
  await login(page);
  const title = `The shared view ${Date.now()}`;
  await page.getByLabel('Dashboard title').fill(title);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Connect a screen', exact: true })
    .click();
  await expect(page.getByLabel('Pairing code')).toContainText(/\d{6}/);
  const code = (await page.getByLabel('Pairing code').innerText()).replace(/\s/g, '');
  const viewerContext = await browser.newContext();
  await viewerContext.route('**/*', (route) =>
    new URL(route.request().url()).hostname === 'localhost'
      ? route.continue()
      : route.abort('blockedbyclient'),
  );
  const screen = await viewerContext.newPage();
  await screen.goto('/display');
  await screen.getByLabel('Pairing code', { exact: true }).fill(code);
  await screen.getByRole('button', { name: 'Connect screen', exact: true }).click();
  await expect(screen.locator('.dashboard')).toBeVisible();
  await expect(screen.getByRole('heading', { name: title })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Published');
  await expect(screen.getByRole('heading', { name: title })).toBeVisible({ timeout: 15_000 });
  const forbidden = await screen.request.post('/api/publish', {
    headers: { Origin: 'http://localhost:3001' },
    data: {},
  });
  expect(forbidden.status()).toBe(403);
  await screen.screenshot({ path: 'test-results/noticetv-paired-display.png' });
  await viewerContext.close();
});

test('weather connects through location search and widget changes survive a reload', async ({
  page,
}) => {
  await login(page);
  const weather = page.getByRole('button', { name: 'Edit Weather', exact: true });
  if (!(await weather.count())) {
    await page.getByRole('button', { name: 'Add widget', exact: true }).click();
    await page.getByRole('button', { name: 'Weather A sense' }).click();
  } else await weather.click();
  await page.getByPlaceholder('Search a town or city').fill('Test');
  await page.getByRole('button', { name: 'Search locations' }).click();
  await page.getByRole('button', { name: /Test City/ }).click();
  await expect(page.getByText('Forecast connected', { exact: true })).toBeVisible();
  await expect(page.locator('.temperature')).toContainText('18');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
  await page.reload();
  await page.getByRole('button', { name: 'Edit Weather', exact: true }).click();
  await expect(page.getByText('Forecast connected', { exact: true })).toBeVisible();
});

test('an expired editor session reconnects without losing unsaved work', async ({
  page,
  context,
}) => {
  await login(page);
  await page.getByLabel('Dashboard title').fill('Keep this draft');
  await context.clearCookies();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reconnect your editor.' })).toBeVisible();
  await page.getByLabel('Editor key', { exact: true }).fill(fixtureKey);
  await page.getByRole('button', { name: 'Open your editor', exact: true }).click();
  await expect(page.getByLabel('Dashboard title')).toHaveValue('Keep this draft');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
});

test('HLS plays a local fixture and recovers after a media error', async ({ page }) => {
  await login(page);
  await page.route('**/test-media/**', async (route) => {
    const filename = new URL(route.request().url()).pathname.split('/').at(-1)!;
    if (!['index.m3u8', 'segment0.m2ts', 'segment1.m2ts', 'segment2.m2ts'].includes(filename)) {
      await route.abort();
      return;
    }
    await route.fulfill({
      body: await readFile(new URL(`../fixtures/hls/${filename}`, import.meta.url)),
      contentType: filename.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
    });
  });
  const document = (await (await page.request.get('/api/document')).json()) as Document;
  const board = createDashboard();
  board.widgets = board.widgets
    .filter((widget) => widget.type === 'video')
    .map((widget) =>
      widget.type === 'video'
        ? { ...widget, url: 'http://localhost:3001/test-media/index.m3u8', width: 12, height: 6 }
        : widget,
    );
  await page.request.post('/api/publish', {
    headers: { Origin: 'http://localhost:3001' },
    data: { dashboard: board, baseRevision: document.revision },
  });
  await page.goto('/display');
  await expect(page.locator('video')).toBeVisible();
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0.2);
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.muted)).toBe(true);
  await page
    .locator('video')
    .evaluate((video: HTMLVideoElement) => video.dispatchEvent(new Event('error')));
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0.2);
  await page.screenshot({ path: 'test-results/noticetv-hls-playback.png' });
});
