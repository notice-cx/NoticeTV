import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HomeAssistantConnection } from '../server/home-assistant';
import { DashboardStore } from '../server/store';
import { createApp } from '../server/app';
import { sessionCookie } from '../server/auth';
import { createDashboard, createWidget } from '../shared/dashboard';
import {
  fixtureAttributeSecret,
  fixtureToken,
  startHomeAssistantFixture,
} from './fixtures/home-assistant';

let directory: string;
let fixture: Awaited<ReturnType<typeof startHomeAssistantFixture>>;
let connection: HomeAssistantConnection;
let server: Server | undefined;
const selected = 'sensor.living_room_temperature';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'noticetv-ha-test-'));
  fixture = await startHomeAssistantFixture();
  connection = await new HomeAssistantConnection(directory).initialize();
});
afterEach(async () => {
  connection.close();
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
  await fixture.close();
  await rm(directory, { recursive: true, force: true });
});
const connect = () => connection.configure({ url: fixture.url, token: fixtureToken });

describe('shared Home Assistant connection', () => {
  it('authenticates, subscribes before the snapshot, and projects only display-safe fields', async () => {
    fixture.beforeSnapshot(() => fixture.update(selected, '22.5'));
    await connect();
    expect(connection.status()).toMatchObject({ phase: 'connected', entityCount: 3 });
    expect(connection.data([selected]).entities[selected]).toMatchObject({
      state: '22.5',
      unit: '°C',
      name: 'Living room temperature',
    });
    expect(
      fixture.messages.filter((message) => message.type !== 'auth').map((message) => message.type),
    ).toEqual(['subscribe_events', 'get_states']);
    expect(JSON.stringify(connection.entities())).not.toContain(fixtureAttributeSecret);
    expect(JSON.stringify(connection.status())).not.toContain(fixtureToken);
    expect(connection.data([selected]).entities).not.toHaveProperty('sensor.private_value');
    fixture.update(selected, '23');
    await vi.waitFor(() => expect(connection.data([selected]).entities[selected].state).toBe('23'));
    fixture.update(selected, 'unavailable');
    await vi.waitFor(() =>
      expect(connection.data([selected]).entities[selected].state).toBe('unavailable'),
    );
    fixture.update(selected, null);
    await vi.waitFor(() => expect(connection.data([selected]).entities[selected]).toBeUndefined());
  });

  it('stores credentials separately with owner-only permissions and restores the connection after restart', async () => {
    await connect();
    const file = join(directory, 'home-assistant.json');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      url: fixture.url,
      token: fixtureToken,
    });
    connection.close();
    connection = await new HomeAssistantConnection(directory).initialize();
    await vi.waitFor(() => expect(connection.status().phase).toBe('connected'));
    expect(connection.data([selected]).entities[selected].state).toBe('21.5');
    await connection.configure({ url: `${fixture.url}/` });
    expect(connection.status().phase).toBe('connected');
    await connection.disconnect();
    expect(connection.status()).toMatchObject({
      url: null,
      phase: 'not_configured',
      entityCount: 0,
    });
    expect(await readFile(file, 'utf8')).not.toContain(fixtureToken);
    connection.close();
    connection = await new HomeAssistantConnection(directory).initialize();
    expect(connection.status().phase).toBe('not_configured');
  });

  it('retains known readings on a dropped connection and refreshes the full snapshot after reconnect', async () => {
    await connect();
    fixture.controls.stallAuth = true;
    fixture.dropConnections();
    await vi.waitFor(() => expect(connection.status().phase).toBe('reconnecting'));
    expect(connection.data([selected]).entities[selected].state).toBe('21.5');
    fixture.update(selected, '24');
    fixture.update('sensor.private_value', null);
    fixture.controls.stallAuth = false;
    fixture.dropConnections();
    await vi.waitFor(() => expect(connection.status().phase).toBe('connected'), { timeout: 5000 });
    expect(connection.data([selected]).entities[selected].state).toBe('24');
    expect(connection.entities().some((entity) => entity.id === 'sensor.private_value')).toBe(
      false,
    );
    expect(fixture.messages.filter((message) => message.type === 'subscribe_events')).toHaveLength(
      2,
    );
  });

  it('keeps a working connection when a replacement token fails, then stops retrying revoked credentials', async () => {
    await connect();
    await expect(
      connection.configure({ url: fixture.url, token: 'bad-fixture-token' }),
    ).rejects.toThrow('rejected the token');
    expect(connection.status().phase).toBe('connected');
    expect(JSON.parse(await readFile(join(directory, 'home-assistant.json'), 'utf8')).token).toBe(
      fixtureToken,
    );
    fixture.controls.rejectAuth = true;
    fixture.dropConnections();
    await vi.waitFor(() => expect(connection.status().phase).toBe('auth_failed'), {
      timeout: 5000,
    });
    expect(connection.data([selected]).entities[selected].state).toBe('21.5');
    fixture.controls.rejectAuth = false;
    await connect();
    expect(connection.status().phase).toBe('connected');
  });

  it('rejects unsupported URLs and never reuses a token for a different server', async () => {
    await connect();
    for (const url of [
      'file:///tmp/fixture',
      'ftp://example.test',
      'https://name:secret@example.test',
      `${fixture.url}/api`,
      `${fixture.url}?token=secret`,
      `${fixture.url}#secret`,
    ]) {
      await expect(connection.configure({ url, token: fixtureToken })).rejects.toThrow();
    }
    await expect(connection.configure({ url: 'http://127.0.0.1:1' })).rejects.toThrow(
      'Enter a long-lived access token',
    );
    expect(connection.status().url).toBe(fixture.url);
  });

  it('reports subscription permission errors without saving an unusable connection', async () => {
    fixture.controls.rejectSubscription = true;
    await expect(connect()).rejects.toThrow('Could not read Home Assistant entities');
    expect(connection.status().phase).toBe('not_configured');
    await expect(readFile(join(directory, 'home-assistant.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('bounds a stalled authentication exchange', async () => {
    fixture.controls.stallAuth = true;
    await expect(connect()).rejects.toThrow('Could not read Home Assistant entities');
    expect(connection.status().phase).toBe('not_configured');
  }, 15_000);

  it('detects a silent connection with its heartbeat and retains the last known reading', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      await connect();
      fixture.controls.respondToPing = false;
      fixture.controls.stallAuth = true;
      await vi.advanceTimersByTimeAsync(40_001);
      expect(connection.status().phase).toBe('reconnecting');
      expect(connection.data([selected]).entities[selected].state).toBe('21.5');
    } finally {
      connection.close();
      vi.useRealTimers();
    }
  });

  it('bounds a stalled initial snapshot', async () => {
    fixture.controls.stallSnapshot = true;
    await expect(connect()).rejects.toThrow('Could not read Home Assistant entities');
    expect(connection.status().phase).toBe('not_configured');
  }, 15_000);
});

describe('Home Assistant access from editor and paired screens', () => {
  async function start() {
    const store = await new DashboardStore(directory).initialize();
    server = createServer();
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const key = 'home-assistant-permission-test-fixture';
    server.on('request', createApp({ store, editorKey: key, origin, homeAssistant: connection }));
    const request = (
      path: string,
      role: 'editor' | 'display' | null,
      method = 'GET',
      body?: unknown,
    ) =>
      fetch(`${origin}/api${path}`, {
        method,
        headers: {
          ...(role ? { Cookie: sessionCookie(role, key, false).split(';')[0] } : {}),
          ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    return { store, request };
  }

  it('lets only editors configure and discover entities; screens can read only published selections', async () => {
    const { store, request } = await start();
    for (const path of [
      '/home-assistant',
      '/home-assistant/entities',
      `/home-assistant/data?entities=${selected}`,
    ])
      expect((await request(path, null)).status).toBe(401);
    for (const path of ['/home-assistant', '/home-assistant/entities'])
      expect((await request(path, 'display')).status).toBe(403);
    expect(
      (
        await request('/home-assistant', 'display', 'PUT', {
          url: fixture.url,
          token: fixtureToken,
        })
      ).status,
    ).toBe(403);
    expect((await request('/home-assistant', 'display', 'DELETE', {})).status).toBe(403);
    const saved = await request('/home-assistant', 'editor', 'PUT', {
      url: fixture.url,
      token: fixtureToken,
    });
    expect(saved.status).toBe(200);
    expect(await saved.text()).not.toContain(fixtureToken);
    const board = {
      ...createDashboard(),
      widgets: [{ ...createWidget('entity'), entityId: selected }],
    };
    await store.save(board, 0, false);
    expect((await request(`/home-assistant/data?entities=${selected}`, 'display')).status).toBe(
      403,
    );
    expect((await request(`/home-assistant/data?entities=${selected}`, 'editor')).status).toBe(200);
    await store.save(board, 1, true);
    const data = await (
      await request(`/home-assistant/data?entities=${selected}`, 'display')
    ).json();
    expect(Object.keys(data.entities)).toEqual([selected]);
    expect(JSON.stringify(data)).not.toContain(fixtureAttributeSecret);
    expect(JSON.stringify(data)).not.toContain(fixtureToken);
    expect(JSON.stringify(data)).not.toContain(fixture.url);
    expect(
      (await request('/home-assistant/data?entities=sensor.private_value', 'display')).status,
    ).toBe(403);
    expect((await request('/home-assistant/data?entities=/api/services', 'editor')).status).toBe(
      400,
    );
    expect(
      (await request('/home-assistant/data?entities=sensor.valid&entities=sensor.other', 'editor'))
        .status,
    ).toBe(400);
    const document = await (await request('/document', 'editor')).text();
    expect(document).not.toContain(fixtureToken);
    expect(document).not.toContain(fixture.url);
    const actions = new Set(fixture.messages.map((message) => message.type));
    expect([...actions]).toEqual(['auth', 'subscribe_events', 'get_states']);
  });
});
