import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createDashboard, createWidget, type Document } from '../../shared/dashboard';
import { fixtureToken, startHomeAssistantFixture } from '../fixtures/home-assistant';

test('weather uses a selected HA temperature while keeping its forecast and publishing only selected data', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date('2026-05-12T09:41:00Z'));
  const origin = 'http://localhost:3001';
  const selected = 'sensor.living_room_temperature';
  const fixture = await startHomeAssistantFixture();
  const viewer = await browser.newContext({ baseURL: origin });
  let forecastUnavailable = false;
  const routeSources = async (target: typeof context) => {
    await target.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'localhost') return route.continue();
      if (url.hostname !== 'api.open-meteo.com') return route.abort('blockedbyclient');
      if (forecastUnavailable) return route.fulfill({ status: 503, body: 'Fixture outage' });
      const fahrenheit = url.searchParams.get('temperature_unit') === 'fahrenheit';
      return route.fulfill({
        json: {
          current: {
            temperature_2m: fahrenheit ? 64 : 18,
            relative_humidity_2m: 68,
            weather_code: 2,
            wind_speed_10m: 8,
            is_day: 1,
          },
          daily: {
            time: ['2026-05-12', '2026-05-13', '2026-05-14', '2026-05-15', '2026-05-16'],
            weather_code: [2, 0, 3, 61, 2],
            temperature_2m_max: fahrenheit ? [68, 70, 66, 64, 68] : [20, 21, 19, 18, 20],
            temperature_2m_min: fahrenheit ? [54, 55, 52, 50, 54] : [12, 13, 11, 10, 12],
          },
        },
      });
    });
  };
  await routeSources(context);
  await routeSources(viewer);
  const headers = { Origin: origin };
  try {
    await page.goto('/');
    await page.getByLabel('Editor key', { exact: true }).fill('noticetv-browser-test-fixture-only');
    await page.getByRole('button', { name: 'Open your editor', exact: true }).click();
    await expect(page.locator('.dashboard')).toBeVisible();
    expect(
      (
        await page.request.put('/api/home-assistant', {
          headers,
          data: { url: fixture.url, token: fixtureToken },
        })
      ).ok(),
    ).toBe(true);
    fixture.update(selected, '21.5', { friendly_name: 'Outdoor temperature' });
    const savedDocument = (await (await page.request.get('/api/document')).json()) as Document;
    const dashboard = {
      ...createDashboard(),
      title: 'Weather source preview',
      subtitle: 'Fictional readings',
      units: 'fahrenheit' as const,
      widgets: [
        {
          ...createWidget('weather'),
          title: 'Outside',
          location: 'Fixture city',
          latitude: 1,
          longitude: 2,
        },
      ],
    };
    expect(
      (
        await page.request.post('/api/publish', {
          headers,
          data: { dashboard, baseRevision: savedDocument.revision },
        })
      ).ok(),
    ).toBe(true);
    await page.reload();
    const weather = page.getByRole('region', { name: 'Outside', exact: true });
    await expect(weather.locator('.temperature')).toHaveText('64°');
    await page.getByRole('button', { name: 'Edit Outside', exact: true }).click();
    const picker = page.getByRole('combobox', { name: /^Current temperature sensor/ });
    await expect(picker).toHaveValue('');
    await page.getByLabel('Find sources').fill('Outdoor');
    await picker.selectOption(selected);
    await expect(weather.locator('.temperature')).toHaveText('71°');
    await expect(weather.locator('.weather-temperature-source')).toContainText(
      'Outdoor temperature · Home Assistant',
    );
    await expect(weather.locator('.forecast-day')).toHaveCount(5);
    await expect(weather).toContainText('Forecasts by Open-Meteo');
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      axe.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })),
    ).toEqual([]);
    await page.screenshot({ path: 'test-results/noticetv-weather-sensor.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: 'test-results/noticetv-weather-sensor-phone.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Canvas settings', exact: true }).click();
    await page.getByRole('button', { name: 'Celsius · °C', exact: true }).click();
    await expect(weather.locator('.temperature')).toHaveText('22°');
    fixture.update(selected, '0');
    await expect(weather.locator('.temperature')).toHaveText('0°');
    fixture.update(selected, 'unavailable');
    await expect(weather.locator('.temperature')).toHaveText('—');
    await expect(weather).toContainText('HA temperature unavailable');
    fixture.update(selected, '70', { unit_of_measurement: 'ppm' });
    await expect(weather.locator('.temperature')).toHaveText('—');
    fixture.update(selected, '273.15', { unit_of_measurement: 'K' });
    await expect(weather.locator('.temperature')).toHaveText('0°');
    fixture.controls.stallAuth = true;
    fixture.dropConnections();
    await expect(weather).toContainText('Last known reading');
    await expect(weather).toContainText('Updated');
    await expect(weather.locator('.temperature')).toHaveText('0°');
    fixture.update(selected, '50', { unit_of_measurement: '°F' });
    fixture.controls.stallAuth = false;
    fixture.dropConnections();
    await expect(weather.locator('.temperature')).toHaveText('10°', { timeout: 15_000 });
    forecastUnavailable = true;
    await page.getByRole('button', { name: 'Fahrenheit · °F', exact: true }).click();
    await expect(weather).toContainText('Forecast unavailable.');
    await expect(weather.locator('.temperature')).toHaveText('50°');
    forecastUnavailable = false;
    await page.getByRole('button', { name: 'Celsius · °C', exact: true }).click();
    await expect(weather.locator('.forecast-day')).toHaveCount(5);
    await page.getByRole('button', { name: 'Edit Outside', exact: true }).click();
    await picker.selectOption('');
    await expect(weather.locator('.temperature')).toHaveText('18°');
    await expect(weather.locator('.weather-temperature-source')).toHaveCount(0);
    await picker.selectOption(selected);
    const pairing = await (await page.request.post('/api/pairing', { headers, data: {} })).json();
    const screen = await viewer.newPage();
    await screen.goto('/display');
    await screen.getByLabel('Pairing code', { exact: true }).fill(pairing.code);
    await screen.getByRole('button', { name: 'Connect screen', exact: true }).click();
    await expect(screen.locator('.dashboard')).toBeVisible();
    expect(
      (await screen.request.get(`/api/home-assistant/data?entities=${selected}`)).status(),
    ).toBe(403);
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(screen.locator('.temperature')).toHaveText('10°', { timeout: 15_000 });
    expect(
      (await screen.request.get(`/api/home-assistant/data?entities=${selected}`)).status(),
    ).toBe(200);
    await page.reload();
    await page.getByRole('button', { name: 'Edit Outside', exact: true }).click();
    await expect(picker).toHaveValue(selected);
  } finally {
    await page.request
      .delete('/api/home-assistant', { headers, data: {}, timeout: 5000 })
      .catch(() => undefined);
    await viewer.close();
    await fixture.close();
  }
});

test('Home weather saves a searched second location and keeps its local forecast dates', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(60_000);
  await page.clock.setFixedTime(new Date('2026-05-12T09:41:00Z'));
  const fixture = await startHomeAssistantFixture({ rich: true });
  const origin = 'http://localhost:3001';
  const headers = { Origin: origin };
  const viewer = await browser.newContext({ baseURL: origin });
  const forecasts: URL[] = [];
  let outage = false;
  const routes = async (target: typeof context) =>
    target.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'localhost') return route.continue();
      if (url.hostname === 'geocoding-api.open-meteo.com')
        return route.fulfill({
          json: {
            results: [
              {
                id: 1,
                name: 'Test City',
                latitude: 1,
                longitude: 2,
                admin1: 'Fictional region',
                country: 'Fictional country',
              },
            ],
          },
        });
      if (url.hostname !== 'api.open-meteo.com') return route.abort('blockedbyclient');
      forecasts.push(url);
      if (outage) return route.fulfill({ status: 503, body: 'Fixture forecast outage' });
      const fahrenheit = url.searchParams.get('temperature_unit') === 'fahrenheit';
      return route.fulfill({
        json: {
          current: {
            temperature_2m: fahrenheit ? 48.2 : 9,
            relative_humidity_2m: 75,
            weather_code: 61,
            wind_speed_10m: 8,
            is_day: 1,
          },
          daily: {
            time: [
              '2026-05-13',
              '2026-05-14',
              '2026-05-15',
              '2026-05-16',
              '2026-05-17',
              '2026-05-18',
            ],
            weather_code: [61, 2, 0, 3, 61, 0],
            temperature_2m_max: Array(6).fill(fahrenheit ? 59 : 15),
            temperature_2m_min: Array(6).fill(fahrenheit ? 41 : 5),
          },
        },
      });
    });
  await routes(context);
  await routes(viewer);
  try {
    await page.goto('/');
    await page.getByLabel('Editor key', { exact: true }).fill('noticetv-browser-test-fixture-only');
    await page.getByRole('button', { name: 'Open your editor', exact: true }).click();
    await expect(page.locator('.dashboard')).toBeVisible();
    expect(
      (
        await page.request.put('/api/home-assistant', {
          headers,
          data: { url: fixture.url, token: fixtureToken },
        })
      ).ok(),
    ).toBe(true);
    const document = (await (await page.request.get('/api/document')).json()) as Document;
    const dashboard = {
      ...createDashboard(),
      title: 'Second location preview',
      subtitle: 'Fictional readings',
      timeZone: 'Pacific/Honolulu',
      widgets: [{ ...createWidget('ha-weather'), entityId: 'weather.demo_home' }],
    };
    expect(
      (
        await page.request.put('/api/draft', {
          headers,
          data: { dashboard, baseRevision: document.revision },
        })
      ).ok(),
    ).toBe(true);
    await page.reload();
    await page.getByRole('button', { name: 'Edit Outside', exact: true }).click();
    await expect(page.getByLabel('Second location source')).toHaveValue('location');
    await expect(page.locator('.home-city-strip')).toHaveCount(0);
    await page.getByPlaceholder('Search a town or city').fill('Test City');
    await page.getByRole('button', { name: 'Search second location', exact: true }).click();
    await page.getByRole('button', { name: /Test City Fictional region/ }).click();
    const strip = page.getByRole('region', { name: 'Test City weather', exact: true });
    await expect(strip).toContainText('9°');
    await expect(strip.locator('.home-city-days > div')).toHaveCount(6);
    await expect(strip.locator('.home-city-days > div').nth(1)).toContainText('Thu');
    expect(forecasts.at(-1)?.searchParams.get('timezone')).toBe('auto');
    expect(forecasts.at(-1)?.searchParams.get('forecast_days')).toBe('6');
    expect(forecasts.at(-1)?.searchParams.get('latitude')).toBe('1');
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      axe.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })),
    ).toEqual([]);
    await page.screenshot({ path: 'test-results/noticetv-second-location.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: 'test-results/noticetv-second-location-phone.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Draft saved');
    await page.reload();
    await page.getByRole('button', { name: 'Edit Outside', exact: true }).click();
    await expect(page.getByPlaceholder('Search a town or city')).toHaveValue('Test City');
    await expect(strip).toContainText('9°');
    const pairing = await (await page.request.post('/api/pairing', { headers, data: {} })).json();
    const screen = await viewer.newPage();
    await screen.goto('/display');
    await screen.getByLabel('Pairing code', { exact: true }).fill(pairing.code);
    await screen.getByRole('button', { name: 'Connect screen', exact: true }).click();
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(
      screen.getByRole('region', { name: 'Test City weather', exact: true }),
    ).toContainText('9°', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Canvas settings', exact: true }).click();
    await page.getByRole('button', { name: 'Fahrenheit · °F', exact: true }).click();
    await expect(strip).toContainText('48°');
    outage = true;
    await page.getByRole('button', { name: 'Celsius · °C', exact: true }).click();
    await expect(strip).toContainText('Weather unavailable');
    await expect(page.locator('.home-weather-temperature')).toContainText('20');
    await page.getByRole('button', { name: 'Edit Outside', exact: true }).click();
    await page.getByLabel('Second location source').selectOption('off');
    await expect(page.locator('.home-city-strip')).toHaveCount(0);
    await page.getByLabel('Second location source').selectOption('location');
    await page.getByRole('button', { name: 'Remove location', exact: true }).click();
    await expect(page.getByPlaceholder('Search a town or city')).toHaveValue('');
    await expect(page.locator('.home-city-strip')).toHaveCount(0);
    await page.getByLabel('Second location source').selectOption('home-assistant');
    await page
      .getByRole('combobox', { name: /^Second location weather/ })
      .selectOption('weather.demo_city');
    await expect(page.locator('.home-city-strip')).toBeVisible();
    expect(
      fixture.messages.filter((message) => message.type === 'weather/subscribe_forecast'),
    ).toHaveLength(2);
  } finally {
    await page.request
      .delete('/api/home-assistant', { headers, data: {}, timeout: 5000 })
      .catch(() => undefined);
    await viewer.close();
    await fixture.close();
  }
});
