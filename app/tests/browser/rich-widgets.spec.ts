import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Document } from '../../shared/dashboard';
import { startHomeAssistantFixture, fixtureToken } from '../fixtures/home-assistant';

test.beforeEach(async ({ context, page }) => {
  await context.route('**/*', (route) =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort('blockedbyclient'),
  );
  await page.clock.setFixedTime(new Date('2026-05-12T09:41:00Z'));
});

test('the rich home preview stays readable in every theme, with calendar details', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/demo?home');
  await expect(page.getByRole('heading', { name: 'Home, connected.', exact: true })).toBeVisible();
  await expect(page.getByLabel('Seven-day forecast')).toBeVisible();
  await expect(page.locator('.home-city-days > div')).toHaveCount(6);
  await expect(page.locator('.climate-readings')).toContainText('21.5');
  await expect(page.locator('.readiness-main')).toContainText('86');
  await expect(page.locator('.meeting-reminder')).toContainText('IN 48 MIN');
  for (const [id, name] of [
    ['graphite', 'Graphite'],
    ['paper', 'Paper'],
    ['midnight', 'Midnight'],
    ['ember', 'Ember'],
    ['moss', 'Moss'],
  ]) {
    await page.getByRole('radio', { name, exact: true }).check();
    await expect(page.locator('.dashboard')).toHaveAttribute('data-theme', id);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      axe.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })),
    ).toEqual([]);
    await page.locator('.canvas-frame').screenshot({ path: `test-results/rich-home-${id}.png` });
  }
  await page.getByRole('radio', { name: 'Graphite', exact: true }).check();
  await page.getByRole('button', { name: 'Fahrenheit · °F', exact: true }).click();
  await expect(page.locator('.climate-readings')).toContainText('70.7');
  await page.getByRole('button', { name: 'Celsius · °C', exact: true }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = page.getByRole('dialog');
  await preview.getByRole('button', { name: 'month', exact: true }).click();
  await expect(preview.getByLabel('Month overview')).toBeVisible();
  const monthAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    monthAxe.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map(({ target }) => target),
    })),
  ).toEqual([]);
  await preview.screenshot({ path: 'test-results/rich-home-month.png' });
  await preview.getByRole('button', { name: 'week', exact: true }).click();
  await preview.getByRole('button', { name: /Designing what comes next/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'Designing what comes next', exact: true }),
  ).toContainText('An example event');
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Hide cursor on display' }).check();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.dashboard')).toHaveCSS('cursor', 'none');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Hide cursor on display' }).uncheck();
  await page.getByRole('checkbox', { name: 'Allow display interactions' }).uncheck();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'month', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/rich-home-phone.png', fullPage: true });
});

test('camera and contact previews remain fictional and snapshots can enlarge', async ({ page }) => {
  await page.goto('/demo?home&cameras');
  await expect(
    page.getByRole('heading', { name: 'A little closer to home.', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.home-status-summary')).toContainText('All closed');
  await expect(page.getByAltText('Illustrated front-door preview')).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    axe.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })),
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/rich-camera-editor.png', fullPage: true });
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Enlarge Front door snapshot', exact: true })
    .click();
  await expect(
    page
      .getByRole('dialog', { name: 'Front door', exact: true })
      .getByAltText('Illustrated front-door preview'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
});

test('rich widgets use configured HA sources and publish data and snapshots to a separate display', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date());
  const fixture = await startHomeAssistantFixture({ rich: true });
  const viewer = await browser.newContext({ baseURL: 'http://localhost:3001' });
  await viewer.route('**/*', (route) =>
    new URL(route.request().url()).hostname === 'localhost'
      ? route.continue()
      : route.abort('blockedbyclient'),
  );
  const origin = 'http://localhost:3001';
  try {
    await page.goto('/');
    await page.getByLabel('Editor key', { exact: true }).fill('noticetv-browser-test-fixture-only');
    await page.getByRole('button', { name: 'Open your editor', exact: true }).click();
    await expect(page.locator('.dashboard')).toBeVisible();
    await page.request.delete('/api/home-assistant', { headers: { Origin: origin }, data: {} });
    await page.getByRole('button', { name: 'Data sources', exact: true }).click();
    await page.getByLabel('Home Assistant address').fill(fixture.url);
    await page.getByLabel('Access token').fill(fixtureToken);
    await page.getByRole('button', { name: 'Connect Home Assistant', exact: true }).click();
    await expect(page.locator('.ha-connection-status')).toContainText('Connected');
    await page.getByRole('button', { name: 'Add widget', exact: true }).click();
    await page.getByRole('button', { name: 'Use Home layout', exact: true }).click();
    await page.getByRole('button', { name: 'Replace draft layout', exact: true }).click();
    await expect(page.locator('.widget')).toHaveCount(5);
    await expect(page.locator('.rich-empty')).toHaveCount(5);
    await page.getByRole('button', { name: 'Canvas settings', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Allow display interactions' }).check();
    await page.getByRole('button', { name: 'Celsius · °C', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Outside', exact: true }).click();
    await page.getByRole('combobox', { name: /^Weather entity/ }).selectOption('weather.demo_home');
    await page
      .getByRole('combobox', { name: /^Outdoor temperature/ })
      .selectOption('sensor.demo_outdoor_temperature');
    await page
      .getByRole('combobox', { name: /^Outdoor humidity/ })
      .selectOption('sensor.demo_humidity');
    await page
      .getByRole('combobox', { name: /^Air quality index/ })
      .selectOption('sensor.demo_aqi');
    await page.getByRole('combobox', { name: /^Sun entity/ }).selectOption('sun.sun');
    await page.getByLabel('Second location source').selectOption('home-assistant');
    await page
      .getByRole('combobox', { name: /^Second location weather/ })
      .selectOption('weather.demo_city');
    await page.getByRole('button', { name: 'Edit Indoor climate', exact: true }).click();
    await page
      .getByRole('combobox', { name: /^Temperature 1 entity/ })
      .selectOption('climate.demo_upstairs');
    await page
      .getByRole('combobox', { name: /^Temperature 2 entity/ })
      .selectOption('climate.demo_downstairs');
    await page
      .getByRole('combobox', { name: 'CO₂ entity', exact: true })
      .selectOption('sensor.demo_co2');
    await page.getByLabel('Temperature 1 label', { exact: true }).fill('Upstairs');
    await page.getByLabel('Temperature 2 label', { exact: true }).fill('Downstairs');
    await page.getByRole('button', { name: 'Edit Readiness', exact: true }).click();
    await page
      .getByRole('combobox', { name: /^Readiness score/ })
      .selectOption('sensor.demo_readiness');
    await page.getByRole('button', { name: 'Edit The week ahead', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Add calendar', exact: true })
      .selectOption('calendar.demo_work');
    await page
      .getByRole('checkbox', { name: 'Remind me about meetings in Work calendar', exact: true })
      .check();
    await page
      .getByRole('combobox', { name: 'Add calendar', exact: true })
      .selectOption('calendar.demo_personal');
    await expect(page.locator('.home-weather-temperature')).toContainText('19');
    await expect(page.locator('.home-weather-meta')).toContainText('63% humidity');
    await expect(page.locator('.climate-readings')).toContainText('21.5');
    await expect(page.locator('.readiness-main')).toContainText('86');
    await expect(page.locator('.meeting-reminder')).toContainText('Fixture planning meeting');
    fixture.update('climate.demo_upstairs', 'heat', { current_temperature: 22.7 });
    await expect(page.locator('.climate-readings')).toContainText('22.7', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Edit The week ahead', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Hide declined invitations', exact: true }).uncheck();
    await expect(page.locator('.connected-agenda-list')).toContainText('Declined fixture event');
    await page.getByRole('checkbox', { name: 'Hide declined invitations', exact: true }).check();
    await expect(page.locator('.connected-agenda-list')).toContainText('Fixture planning meeting');
    await expect(page.locator('.connected-agenda-list')).not.toContainText(
      'Declined fixture event',
    );
    const pickerAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      pickerAxe.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map(({ target }) => target),
      })),
    ).toEqual([]);
    await page.getByRole('button', { name: 'Edit Front door', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Camera entity', exact: true })
      .selectOption('camera.demo_front');
    await page
      .getByRole('combobox', { name: 'Motion sensor', exact: true })
      .selectOption('binary_sensor.demo_motion');
    const cameraWidget = page.getByRole('region', { name: 'Front door', exact: true });
    await expect(cameraWidget.getByAltText('Front door camera snapshot')).toBeVisible();
    await expect
      .poll(() =>
        cameraWidget.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    const pairing = await (
      await page.request.post('/api/pairing', { headers: { Origin: origin }, data: {} })
    ).json();
    const screen = await viewer.newPage();
    await screen.goto('/display');
    await screen.getByLabel('Pairing code', { exact: true }).fill(pairing.code);
    await screen.getByRole('button', { name: 'Connect screen', exact: true }).click();
    await expect(screen.locator('.dashboard')).toBeVisible();
    const current = (await (await page.request.get('/api/document')).json()) as Document;
    const camera = current.draft.widgets.find((widget) => widget.type === 'ha-camera')!;
    expect(
      (await screen.request.get(`/api/home-assistant/widgets/${camera.id}/snapshot`)).status(),
    ).toBe(404);
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const displayedCamera = screen.getByRole('region', { name: 'Front door', exact: true });
    await expect(displayedCamera.getByAltText('Front door camera snapshot')).toBeVisible({
      timeout: 15_000,
    });
    await expect(screen.locator('.climate-readings')).toContainText('22.7');
    const photo = await screen.request.get(`/api/home-assistant/widgets/${camera.id}/snapshot`);
    expect(photo.headers()['content-type']).toBe('image/png');
    expect(
      (
        await screen.request.post('/api/home-assistant/widget-preview', {
          headers: { Origin: origin },
          data: { widget: camera, timeZone: 'UTC', units: 'celsius' },
        })
      ).status(),
    ).toBe(403);
    await screen
      .getByRole('region', { name: 'The week ahead', exact: true })
      .getByRole('button', { name: /Fixture planning meeting/ })
      .click();
    const details = screen.getByRole('dialog', { name: 'Fixture planning meeting', exact: true });
    await expect(details).toContainText('<script>window.fixtureExecuted = true</script>');
    expect(
      await screen.evaluate(
        () => (window as unknown as { fixtureExecuted?: boolean }).fixtureExecuted,
      ),
    ).toBeUndefined();
    await screen.getByRole('button', { name: 'Close details', exact: true }).click();
    await displayedCamera
      .getByRole('button', { name: 'Enlarge Front door snapshot', exact: true })
      .click();
    await expect(
      screen
        .getByRole('dialog', { name: 'Front door', exact: true })
        .getByAltText('Front door camera snapshot'),
    ).toBeVisible();
    await screen.getByRole('button', { name: 'Close details', exact: true }).click();
    fixture.update('sensor.demo_readiness', 'unavailable');
    await expect(screen.locator('.readiness-main')).toContainText('Awaiting a reading', {
      timeout: 10_000,
    });
    await screen.screenshot({ path: 'test-results/rich-published-display.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: 'test-results/rich-source-picker-phone.png', fullPage: true });
  } finally {
    await page.request
      .delete('/api/home-assistant', { headers: { Origin: origin }, data: {}, timeout: 5000 })
      .catch(() => undefined);
    await viewer.close();
    await fixture.close();
  }
});
