import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { HomeAssistantConnection } from '../server/home-assistant';
import { HAWidgets } from '../server/ha-widgets';
import { DashboardStore } from '../server/store';
import { createApp } from '../server/app';
import { sessionCookie } from '../server/auth';
import { createHomePreview } from '../shared/rich-demo';
import { createWidget, type WidgetOf } from '../shared/dashboard';
import type { RichWidgetType } from '../shared/rich-widgets';
import {
  fixtureToken,
  fixtureAttributeSecret,
  startHomeAssistantFixture,
} from './fixtures/home-assistant';

let fixture: Awaited<ReturnType<typeof startHomeAssistantFixture>>;
let directory: string;
let connection: HomeAssistantConnection;
let now: Date;
let widgets: HAWidgets;
let server: Server | undefined;
const sample = <T extends RichWidgetType>(type: T): WidgetOf<T> =>
  [...createHomePreview().widgets, ...createHomePreview(true).widgets].find(
    (widget) => widget.type === type,
  )! as WidgetOf<T>;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'noticetv-rich-test-'));
  fixture = await startHomeAssistantFixture({ rich: true });
  now = new Date('2026-11-01T09:30:00Z');
  fixture.controls.now = now;
  connection = await new HomeAssistantConnection(directory).initialize();
  await connection.configure({ url: fixture.url, token: fixtureToken });
  widgets = new HAWidgets(connection, () => now);
});
afterEach(async () => {
  vi.restoreAllMocks();
  connection.close();
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
  await fixture.close();
  await rm(directory, { recursive: true, force: true });
});

describe('rich HA data through typed widget reads', () => {
  it('prioritizes outdoor sensors, aggregates forecasts, converts units, and shares subscriptions', async () => {
    const widget = sample('ha-weather');
    const [result, duplicate] = await Promise.all([
      widgets.data(widget, 'UTC', 'fahrenheit'),
      widgets.data(widget, 'UTC', 'fahrenheit'),
    ]);
    expect(result).toEqual(duplicate);
    if (result.type !== 'ha-weather') throw new Error('Expected weather');
    expect(result.data.current).toMatchObject({ temperature: 65.3, humidity: 63, unit: '°F' });
    expect(result.data.current?.forecast).toHaveLength(7);
    expect(result.data.secondary?.forecast).toHaveLength(7);
    expect(result.data.aqi).toBe(24);
    expect(result.data.moon.fraction).toBeGreaterThanOrEqual(0);
    expect(
      fixture.messages.filter((message) => message.type === 'weather/subscribe_forecast'),
    ).toHaveLength(2);
    expect(fixture.messages.filter((message) => message.type === 'get_config')).toHaveLength(1);
    await vi.waitFor(() =>
      expect(
        fixture.messages.filter((message) => message.type === 'unsubscribe_events'),
      ).toHaveLength(2),
    );
    fixture.update('sensor.demo_outdoor_temperature', '19.5');
    await vi.waitFor(() =>
      expect(connection.state('sensor.demo_outdoor_temperature')?.state).toBe('19.5'),
    );
    const updated = await widgets.data(widget, 'UTC', 'celsius');
    if (updated.type !== 'ha-weather') throw new Error('Expected weather');
    expect(updated.data.current?.temperature).toBe(19.5);
    expect(
      fixture.messages.filter((message) => message.type === 'weather/subscribe_forecast'),
    ).toHaveLength(2);
    expect(JSON.stringify(updated)).not.toContain(fixtureAttributeSecret);
    expect(JSON.stringify(updated)).not.toContain('latitude');
  });

  it('reads measured thermostat attributes and 24-hour recorder history, preserving gaps', async () => {
    const value = await widgets.data(sample('ha-climate'), 'UTC', 'celsius');
    if (value.type !== 'ha-climate') throw new Error('Expected climate');
    expect(value.data.temperatures.map((source) => source.value)).toEqual([21.5, 20.2]);
    expect(value.data.temperatures[0].points.some((point) => point.value === null)).toBe(true);
    expect(
      new Set(value.data.temperatures[0].points.map((point) => point.time)).size,
    ).toBeGreaterThan(10);
    expect(value.data.co2?.value).toBe(640);
    const request = new URL(
      fixture.requests.find((request) => request.path.includes('/api/history/'))!.path,
      fixture.url,
    );
    expect(request.searchParams.get('significant_changes_only')).toBe('0');
    expect(request.searchParams.get('no_attributes')).toBeNull();
    expect(
      Date.parse(request.searchParams.get('end_time')!) -
        Date.parse(decodeURIComponent(request.pathname.split('/').at(-1)!)),
    ).toBe(86_400_000);
    const fahrenheit = await widgets.data(sample('ha-climate'), 'UTC', 'fahrenheit');
    if (fahrenheit.type !== 'ha-climate') throw new Error('Expected climate');
    expect(fahrenheit.data.temperatures[0].value).toBe(70.7);
    expect(
      fixture.requests.filter((request) => request.path.includes('/api/history/')),
    ).toHaveLength(1);
  });

  it('loads a seven-day readiness trend and rejects missing scores without inventing zero', async () => {
    const result = await widgets.data(sample('ha-readiness'), 'UTC', 'celsius');
    if (result.type !== 'ha-readiness') throw new Error('Expected readiness');
    expect(result.data.score.value).toBe(86);
    expect(result.data.points.length).toBeGreaterThan(10);
    expect(result.data.average).toBeGreaterThan(80);
    expect(result.data.end - result.data.start).toBe(7 * 86_400_000);
    fixture.update('sensor.demo_readiness', 'unavailable');
    await vi.waitFor(() =>
      expect(connection.state('sensor.demo_readiness')?.state).toBe('unavailable'),
    );
    const unavailable = await widgets.data(sample('ha-readiness'), 'UTC', 'celsius');
    if (unavailable.type !== 'ha-readiness') throw new Error('Expected readiness');
    expect(unavailable.data.score.value).toBeNull();
  });

  it('keeps unavailable contacts separate from closed contacts and exposes motion accurately', async () => {
    fixture.update('binary_sensor.demo_window', 'unavailable');
    fixture.update('binary_sensor.demo_motion', 'on');
    await vi.waitFor(() => expect(connection.state('binary_sensor.demo_motion')?.state).toBe('on'));
    const result = await widgets.data(sample('ha-status'), 'UTC', 'celsius');
    if (result.type !== 'ha-status') throw new Error('Expected status');
    expect(result.data.contacts.map((contact) => contact.state)).toEqual(['closed', 'unavailable']);
    expect(result.data.motion).toBe('active');
    expect(JSON.stringify(result)).not.toContain(fixtureAttributeSecret);
  });

  it('retains calendar data during partial outages, with a bounded retry backoff', async () => {
    const widget = sample('ha-agenda');
    const initial = await widgets.data(widget, 'UTC', 'celsius');
    if (initial.type !== 'ha-agenda') throw new Error('Expected agenda');
    expect(initial.data.events).toHaveLength(2);
    expect(initial.data.nextMeeting?.title).toBe('Fixture planning meeting');
    fixture.controls.failedCalendars = ['calendar.demo_work'];
    now = new Date(now.getTime() + 5 * 60_000 + 1);
    fixture.controls.now = now;
    const outage = await widgets.data(widget, 'UTC', 'celsius');
    if (outage.type !== 'ha-agenda') throw new Error('Expected agenda');
    expect(outage.stale).toBe(true);
    expect(outage.warnings.join(' ')).toContain('last update');
    expect(outage.data.events.some((event) => event.title === 'Fixture planning meeting')).toBe(
      true,
    );
    const count = fixture.requests.length;
    await widgets.data(widget, 'UTC', 'celsius');
    expect(fixture.requests).toHaveLength(count);
  });

  it('retains history after recorder failures and clears cached sources on disconnection', async () => {
    const widget = sample('ha-climate');
    await widgets.data(widget, 'UTC', 'celsius');
    fixture.controls.failHistory = true;
    now = new Date(now.getTime() + 5 * 60_000 + 1);
    const outage = await widgets.data(widget, 'UTC', 'celsius');
    if (outage.type !== 'ha-climate') throw new Error('Expected climate');
    expect(outage.stale).toBe(true);
    expect(outage.data.temperatures[0].points.length).toBeGreaterThan(10);
    await connection.disconnect();
    const disconnected = await widgets.data(widget, 'UTC', 'celsius');
    if (disconnected.type !== 'ha-climate') throw new Error('Expected climate');
    expect(
      disconnected.data.temperatures.every(
        (source) => source.points.length === 0 && source.value === null,
      ),
    ).toBe(true);
  });

  it('shares camera snapshots, retains explicitly stale images, and never follows credential-bearing redirects', async () => {
    const first = await widgets.snapshot('camera.demo_front');
    expect(first.type).toBe('image/png');
    expect(first.stale).toBe(false);
    await widgets.snapshot('camera.demo_front');
    expect(
      fixture.requests.filter((request) => request.path.includes('/api/camera_proxy/')),
    ).toHaveLength(1);
    fixture.controls.failSnapshot = true;
    now = new Date(now.getTime() + 20_001);
    const stale = await widgets.snapshot('camera.demo_front');
    expect(stale.stale).toBe(true);
    expect(stale.body).toEqual(first.body);
    expect(stale.capturedAt).toBe(first.capturedAt);
    const other = await startHomeAssistantFixture();
    try {
      fixture.controls.failSnapshot = false;
      fixture.controls.snapshotRedirect = `${other.url}/api/camera_proxy/camera.private`;
      await expect(connection.snapshot('camera.demo_front')).rejects.toThrow('could not supply');
      expect(other.requests).toEqual([]);
    } finally {
      await other.close();
    }
  });

  it('discards reads that finish after a different HA connection has been saved', async () => {
    let finish!: (value: unknown) => void;
    const history = vi.spyOn(connection, 'history').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = widgets.data(sample('ha-readiness'), 'UTC', 'celsius');
    await vi.waitFor(() => expect(history).toHaveBeenCalled());
    await connection.configure({ url: fixture.url, token: fixtureToken });
    finish([]);
    await expect(pending).rejects.toThrow('connection changed');
  });

  it('rejects active image formats and oversized camera responses', async () => {
    fixture.controls.imageType = 'image/svg+xml';
    await expect(connection.snapshot('camera.demo_front')).rejects.toThrow(
      'supported camera image',
    );
    fixture.controls.imageType = 'image/png';
    fixture.controls.oversizedImage = true;
    await expect(connection.snapshot('camera.demo_front')).rejects.toThrow('could not supply');
  });
});

describe('published widget permission checks', () => {
  it('keeps drafts, arbitrary entities, private attributes, and credentials out of display reads', async () => {
    const store = await new DashboardStore(directory).initialize();
    server = createServer();
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`,
      key = 'rich-widget-permission-fixture';
    server.on('request', createApp({ store, homeAssistant: connection, origin, editorKey: key }));
    const request = (
      path: string,
      role: 'editor' | 'display' | null,
      method = 'GET',
      body?: unknown,
    ) =>
      fetch(`${origin}/api/home-assistant${path}`, {
        method,
        headers: {
          ...(role ? { Cookie: sessionCookie(role, key, false).split(';')[0] } : {}),
          ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const camera = sample('ha-camera'),
      cameraPath = `/widgets/${camera.id}/snapshot`;
    const board = {
      ...createHomePreview(),
      widgets: [
        ...createHomePreview().widgets.filter((widget) => widget.type !== 'ha-camera'),
        camera,
        sample('ha-status'),
      ],
    };
    await store.save(board, 0, false);
    const preview = { widget: sample('ha-weather'), timeZone: 'UTC', units: 'celsius' };
    expect((await request('/widget-preview', null, 'POST', preview)).status).toBe(401);
    expect((await request('/widget-preview', 'display', 'POST', preview)).status).toBe(403);
    expect(
      (await request('/camera-preview', 'display', 'POST', { ...preview, widget: camera })).status,
    ).toBe(403);
    expect((await request(cameraPath, 'display')).status).toBe(404);
    const editorData = await request('/widget-preview', 'editor', 'POST', preview);
    expect(editorData.status).toBe(200);
    await store.save(board, 1, true);
    for (const widget of board.widgets) {
      const response = await request(`/widgets/${widget.id}/data`, 'display');
      expect(response.status).toBe(200);
      const json = await response.text();
      expect(json).not.toContain(fixtureAttributeSecret);
      expect(json).not.toContain(fixtureToken);
      expect(json).not.toContain('internal_url');
      expect(json).not.toContain('latitude');
    }
    const photo = await request(`${cameraPath}?entityId=camera.private`, 'display');
    expect(photo.status).toBe(200);
    expect(photo.headers.get('content-type')).toBe('image/png');
    expect(photo.headers.get('cache-control')).toBe('no-store');
    expect(photo.headers.get('x-noticetv-captured-at')).toBeTruthy();
    expect((await photo.arrayBuffer()).byteLength).toBeGreaterThan(50);
    expect(fixture.requests.some((request) => request.path.includes('camera.private'))).toBe(false);
    const replacement = { ...camera, entityId: 'camera.private' };
    await store.save(
      {
        ...board,
        widgets: board.widgets.map((widget) => (widget.id === camera.id ? replacement : widget)),
      },
      2,
      false,
    );
    expect((await (await request(`/widgets/${camera.id}/data`, 'display')).json()).data.name).toBe(
      'Front door camera',
    );
    expect(
      (await request(`/widgets/${createWidget('ha-camera').id}/snapshot`, 'display')).status,
    ).toBe(404);
    const writes = fixture.messages.filter((message) =>
      ['call_service', 'fire_event', 'execute_script'].includes(message.type),
    );
    expect(writes).toEqual([]);
    expect(
      fixture.requests.every((request) => request.authorization === `Bearer ${fixtureToken}`),
    ).toBe(true);
  });
});
