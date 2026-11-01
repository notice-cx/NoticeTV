import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createConnection,
  ERR_CANNOT_CONNECT,
  ERR_INVALID_AUTH,
  type Connection,
  type HassEntity,
  type HaWebSocket,
  type StateChangedEvent,
} from 'home-assistant-js-websocket';
import {
  connectionInputSchema,
  entityIdSchema,
  type HomeAssistantData,
  type HomeAssistantEntity,
  type HomeAssistantStatus,
} from '../shared/home-assistant.js';

type Credentials = { url: string; token: string };
const requestTimeout = 10_000;

export class HomeAssistantError extends Error {}

function bounded<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (callback: () => void) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      callback();
    };
    const cancel = () =>
      finish(() => reject(new HomeAssistantError('The connection was stopped.')));
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(
            new HomeAssistantError(
              'Home Assistant did not respond. Check its address and network access from the NoticeTV server.',
            ),
          ),
        ),
      requestTimeout,
    );
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    operation.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

// Bound the whole authentication exchange, including a server that opens a socket but never authenticates.
function authenticatedSocket(credentials: Credentials, signal: AbortSignal): Promise<HaWebSocket> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(ERR_CANNOT_CONNECT);
      return;
    }
    const url = new URL('/api/websocket', credentials.url);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    const timer = setTimeout(() => fail(ERR_CANNOT_CONNECT), requestTimeout);
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener('message', message);
      socket.removeEventListener('close', closed);
      socket.removeEventListener('error', closed);
      signal.removeEventListener('abort', closed);
    };
    const fail = (reason: number) => {
      cleanup();
      socket.close();
      reject(reason);
    };
    const closed = () => fail(ERR_CANNOT_CONNECT);
    const message = (event: MessageEvent) => {
      try {
        const data = JSON.parse(String(event.data));
        if (data.type === 'auth_required')
          socket.send(JSON.stringify({ type: 'auth', access_token: credentials.token }));
        else if (data.type === 'auth_invalid') fail(ERR_INVALID_AUTH);
        else if (data.type === 'auth_ok' && typeof data.ha_version === 'string') {
          cleanup();
          const authenticated = socket as HaWebSocket;
          authenticated.haVersion = data.ha_version;
          resolve(authenticated);
        }
      } catch {
        fail(ERR_CANNOT_CONNECT);
      }
    };
    socket.addEventListener('message', message);
    socket.addEventListener('close', closed);
    socket.addEventListener('error', closed);
    signal.addEventListener('abort', closed, { once: true });
  });
}

function project(entity: HassEntity): HomeAssistantEntity | null {
  if (
    !entityIdSchema.safeParse(entity.entity_id).success ||
    typeof entity.state !== 'string' ||
    !entity.attributes
  )
    return null;
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  // Entity attributes can contain camera tokens and private URLs. Never forward the raw object.
  return {
    id: entity.entity_id,
    name: text(entity.attributes.friendly_name) || entity.entity_id,
    state: entity.state,
    unit: text(entity.attributes.unit_of_measurement),
    deviceClass: text(entity.attributes.device_class),
    lastUpdated: text(entity.last_updated),
  };
}

class LiveConnection {
  data: Omit<HomeAssistantData, 'entities'> = { phase: 'connecting', receivedAt: null };
  states: Record<string, HassEntity> = {};
  private controller = new AbortController();
  private connection?: Connection;
  private heartbeat?: ReturnType<typeof setInterval>;
  private generation = 0;

  constructor(private credentials: Credentials) {}

  async start() {
    const deadline = setTimeout(() => this.close(), requestTimeout);
    try {
      const connection = await createConnection({
        createSocket: () => authenticatedSocket(this.credentials, this.controller.signal),
        setupRetry: 0,
      });
      if (this.controller.signal.aborted) {
        connection.close();
        throw ERR_CANNOT_CONNECT;
      }
      this.connection = connection;
      connection.addEventListener('disconnected', () => {
        this.generation++;
        if (this.data.phase !== 'auth_failed' && this.data.phase !== 'error')
          this.data.phase = 'reconnecting';
      });
      connection.addEventListener('reconnect-error', () => {
        this.data.phase = 'auth_failed';
        this.close();
      });
      connection.addEventListener('ready', () => {
        void this.synchronize(connection).catch(() => {
          if (!this.controller.signal.aborted) connection.reconnect(true);
        });
      });
      await this.synchronize(connection);
      this.heartbeat = setInterval(() => {
        if (!connection.connected) return;
        void bounded(connection.ping(), this.controller.signal).catch(() => {
          if (!this.controller.signal.aborted) connection.reconnect(true);
        });
      }, 30_000);
      this.heartbeat.unref();
    } catch (error) {
      this.data.phase = error === ERR_INVALID_AUTH ? 'auth_failed' : 'error';
      this.close();
      throw new HomeAssistantError(
        error === ERR_INVALID_AUTH
          ? 'Home Assistant rejected the token. Create a new long-lived access token in your Home Assistant profile.'
          : 'Could not read Home Assistant entities. Check the address, token permissions, and network access from the NoticeTV server.',
      );
    } finally {
      clearTimeout(deadline);
    }
  }

  private async synchronize(connection: Connection) {
    const generation = ++this.generation;
    const pending: StateChangedEvent[] = [];
    let loading = true;
    const current = () => generation === this.generation && !this.controller.signal.aborted;
    const update = (event: StateChangedEvent, entities: Record<string, HassEntity>) => {
      const { entity_id: id, new_state: value } = event.data;
      if (value) {
        if (entityIdSchema.safeParse(id).success) entities[id] = value;
      } else delete entities[id];
    };
    // Subscribe before the snapshot, then replay intervening changes to avoid a missed update.
    await bounded(
      connection.subscribeMessage<StateChangedEvent>(
        (event) => {
          if (!current()) return;
          if (loading) pending.push(event);
          else {
            update(event, this.states);
            this.data.receivedAt = new Date().toISOString();
          }
        },
        { type: 'subscribe_events', event_type: 'state_changed' },
        { resubscribe: false },
      ),
      this.controller.signal,
    );
    const states = await bounded(
      connection.sendMessagePromise<HassEntity[]>({ type: 'get_states' }),
      this.controller.signal,
    );
    if (!current()) return;
    const entities: Record<string, HassEntity> = {};
    for (const value of states) {
      if (entityIdSchema.safeParse(value.entity_id).success) entities[value.entity_id] = value;
    }
    for (const event of pending) update(event, entities);
    loading = false;
    this.states = entities;
    this.data = { phase: 'connected', receivedAt: new Date().toISOString() };
  }

  async config(): Promise<unknown> {
    if (!this.connection?.connected)
      throw new HomeAssistantError('Home Assistant is reconnecting.');
    try {
      return await bounded(
        this.connection.sendMessagePromise({ type: 'get_config' }),
        this.controller.signal,
      );
    } catch (error) {
      if (error instanceof HomeAssistantError && !this.controller.signal.aborted)
        this.connection.reconnect(true);
      throw error;
    }
  }

  async forecast(entityId: string): Promise<unknown[]> {
    const connection = this.connection;
    if (!connection?.connected) throw new HomeAssistantError('Home Assistant is reconnecting.');
    const features = Number(this.states[entityId]?.attributes.supported_features || 0);
    const forecastType =
      features & 1 ? 'daily' : features & 4 ? 'twice_daily' : features & 2 ? 'hourly' : null;
    if (!forecastType) return [];
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(requestTimeout)]);
    let receive!: (value: unknown[]) => void;
    const first = new Promise<unknown[]>((resolve) => {
      receive = resolve;
    });
    const subscription = connection.subscribeMessage<{ forecast: unknown[] | null }>(
      (event) => receive(Array.isArray(event.forecast) ? event.forecast : []),
      { type: 'weather/subscribe_forecast', entity_id: entityId, forecast_type: forecastType },
      { resubscribe: false },
    );
    try {
      await bounded(subscription, signal);
      return await bounded(first, signal);
    } catch (error) {
      // A timed-out command cannot be cancelled in HA's protocol; reconnect to retire it.
      if (error instanceof HomeAssistantError && !this.controller.signal.aborted)
        connection.reconnect(true);
      throw error;
    } finally {
      void subscription.then((unsubscribe) => unsubscribe()).catch(() => undefined);
    }
  }

  close() {
    this.controller.abort();
    clearInterval(this.heartbeat);
    this.connection?.close();
  }
}

export class HomeAssistantConnection {
  generation = 0;
  private credentials: Credentials | null = null;
  private live?: LiveConnection;
  private candidate?: LiveConnection;
  private retry?: ReturnType<typeof setTimeout>;
  private queue: Promise<unknown> = Promise.resolve();
  private stopped = false;

  constructor(private directory: string) {}

  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      const input = JSON.parse(await readFile(join(this.directory, 'home-assistant.json'), 'utf8'));
      if (input !== null) {
        const parsed = connectionInputSchema.parse(input);
        if (!parsed.token) throw new Error('Home Assistant connection has no token.');
        this.credentials = { url: parsed.url, token: parsed.token };
        this.reconnect();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return this;
  }

  status(): HomeAssistantStatus {
    const data = this.data([]);
    return {
      url: this.credentials?.url || null,
      phase: data.phase,
      receivedAt: data.receivedAt,
      entityCount: Object.keys(this.live?.states || {}).length,
    };
  }

  entities(): HomeAssistantEntity[] {
    return Object.values(this.live?.states || {}).flatMap((value) => {
      const entity = project(value);
      return entity ? [entity] : [];
    });
  }

  data(ids: string[]): HomeAssistantData {
    const current = this.live?.data;
    return {
      phase: current?.phase || 'not_configured',
      receivedAt: current?.receivedAt || null,
      entities: Object.fromEntries(
        ids.flatMap((id) =>
          this.live?.states[id] && project(this.live.states[id])
            ? [[id, project(this.live.states[id])!]]
            : [],
        ),
      ),
    };
  }

  configure(input: unknown) {
    return this.serialize(async () => {
      if (this.stopped) throw new HomeAssistantError('The NoticeTV server is stopping.');
      const parsed = connectionInputSchema.parse(input);
      const token =
        parsed.token || (parsed.url === this.credentials?.url ? this.credentials.token : undefined);
      if (!token)
        throw new HomeAssistantError(
          'Enter a long-lived access token for this Home Assistant address.',
        );
      const credentials = { url: parsed.url, token };
      const candidate = new LiveConnection(credentials);
      this.candidate = candidate;
      try {
        await candidate.start();
        await this.persist(credentials);
        clearTimeout(this.retry);
        this.live?.close();
        this.credentials = credentials;
        this.live = candidate;
        this.generation++;
      } catch (error) {
        candidate.close();
        throw error;
      } finally {
        this.candidate = undefined;
      }
      return this.status();
    });
  }

  disconnect() {
    return this.serialize(async () => {
      await this.persist(null);
      clearTimeout(this.retry);
      this.live?.close();
      this.live = undefined;
      this.credentials = null;
      this.generation++;
      return this.status();
    });
  }

  close() {
    this.stopped = true;
    clearTimeout(this.retry);
    this.live?.close();
    this.candidate?.close();
  }

  // Server-only input for typed widget projections. Never serialize these raw states.
  state(id: string): HassEntity | undefined {
    const value = this.live?.states[id];
    return value ? structuredClone(value) : undefined;
  }

  async configuration(): Promise<unknown> {
    if (!this.live) throw new HomeAssistantError('Connect Home Assistant in Sources.');
    return this.live.config();
  }

  async forecast(entityId: string): Promise<unknown[]> {
    if (!this.live) throw new HomeAssistantError('Connect Home Assistant in Sources.');
    entityIdSchema.parse(entityId);
    if (!entityId.startsWith('weather.')) throw new HomeAssistantError('Choose a weather entity.');
    return this.live.forecast(entityId);
  }

  async calendar(entityId: string, start: string, end: string): Promise<unknown> {
    entityIdSchema.parse(entityId);
    if (!entityId.startsWith('calendar.'))
      throw new HomeAssistantError('Choose a calendar entity.');
    const result = await this.json(`/api/calendars/${entityId}`, { start, end });
    if (!Array.isArray(result))
      throw new HomeAssistantError('Home Assistant returned unreadable calendar data.');
    return result;
  }

  async history(entityIds: string[], start: string, end: string): Promise<unknown> {
    for (const id of entityIds) entityIdSchema.parse(id);
    return this.json(`/api/history/period/${encodeURIComponent(start)}`, {
      filter_entity_id: entityIds.join(','),
      end_time: end,
      significant_changes_only: '0',
    });
  }

  async snapshot(entityId: string) {
    entityIdSchema.parse(entityId);
    if (!entityId.startsWith('camera.')) throw new HomeAssistantError('Choose a camera entity.');
    const result = await this.get(`/api/camera_proxy/${entityId}`, {});
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(result.type))
      throw new HomeAssistantError('Home Assistant did not return a supported camera image.');
    return result;
  }

  private async get(path: string, parameters: Record<string, string>) {
    const credentials = this.credentials;
    if (!credentials) throw new HomeAssistantError('Connect Home Assistant in Sources.');
    try {
      const url = new URL(path, credentials.url);
      url.search = new URLSearchParams(parameters).toString();
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${credentials.token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(requestTimeout),
      });
      if (!response.ok || !response.body) throw new Error();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8 * 1024 * 1024) {
          await reader.cancel();
          throw new Error();
        }
        chunks.push(value);
      }
      return {
        body: Buffer.concat(chunks),
        type: response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '',
      };
    } catch {
      throw new HomeAssistantError(
        'Home Assistant could not supply this data. Check the connection and entity permissions.',
      );
    }
  }

  private async json(path: string, parameters: Record<string, string>): Promise<unknown> {
    const result = await this.get(path, parameters);
    try {
      return JSON.parse(result.body.toString('utf8'));
    } catch {
      throw new HomeAssistantError('Home Assistant returned unreadable data.');
    }
  }

  private reconnect(attempt = 0) {
    if (this.stopped || !this.credentials) return;
    const live = new LiveConnection(this.credentials);
    this.live = live;
    void live.start().catch(() => {
      if (this.stopped || this.live !== live || live.data.phase === 'auth_failed') return;
      live.data.phase = 'reconnecting';
      this.retry = setTimeout(
        () => this.reconnect(attempt + 1),
        Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)),
      );
      this.retry.unref();
    });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async persist(credentials: Credentials | null) {
    const temporary = join(this.directory, `.home-assistant-${randomUUID()}.tmp`);
    const handle = await open(temporary, 'wx', 0o600);
    try {
      try {
        await handle.writeFile(`${JSON.stringify(credentials)}\n`);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, join(this.directory, 'home-assistant.json'));
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
}
