import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { HassEntity } from 'home-assistant-js-websocket';

export const fixtureToken = 'noticetv-home-assistant-fixture-token';
export const fixtureAttributeSecret = 'fixture-attribute-secret-never-forward';

function entity(id: string, state: string, attributes: HassEntity['attributes']): HassEntity {
  return {
    entity_id: id,
    state,
    attributes,
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    context: { id: 'fixture', user_id: null, parent_id: null },
  };
}

export async function startHomeAssistantFixture({ rich = false } = {}) {
  const requests: { path: string; authorization: string | undefined }[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://fixture.test');
    requests.push({
      path: url.pathname + url.search,
      authorization: request.headers.authorization,
    });
    const json = (value: unknown, status = 200) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(value));
    };
    if (request.headers.authorization !== `Bearer ${fixtureToken}` || controls.rejectAuth) {
      json({ error: 'Unauthorized fixture' }, 401);
      return;
    }
    const now = controls.now || new Date();
    if (url.pathname.startsWith('/api/calendars/')) {
      const id = url.pathname.split('/').at(-1)!;
      if (controls.failedCalendars.includes(id)) {
        json({ error: 'Fixture calendar outage' }, 503);
        return;
      }
      const start = new Date(now.getTime() + 45 * 60_000),
        end = new Date(now.getTime() + 105 * 60_000);
      json([
        {
          summary: id.endsWith('work') ? 'Fixture planning meeting' : 'Fixture evening walk',
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          description: 'Plain text <script>window.fixtureExecuted = true</script>',
          location: 'Fixture room',
          private_token: fixtureAttributeSecret,
        },
        {
          summary: 'Declined fixture event',
          start: start.toISOString(),
          end: end.toISOString(),
          status: 'declined',
        },
      ]);
      return;
    }
    if (url.pathname.startsWith('/api/history/period/')) {
      if (controls.failHistory) {
        json({ error: 'Fixture recorder outage' }, 503);
        return;
      }
      const start = Date.parse(decodeURIComponent(url.pathname.split('/').at(-1)!)),
        end = Date.parse(url.searchParams.get('end_time') || now.toISOString());
      const ids = (url.searchParams.get('filter_entity_id') || '').split(',');
      json(
        ids.map((id) =>
          Array.from({ length: 17 }, (_, index) => {
            const state = states.get(id),
              isClimate = id.startsWith('climate.');
            const time = new Date(start + ((end - start) * index) / 16).toISOString();
            const value =
              (isClimate
                ? Number(state?.attributes.current_temperature || 20)
                : Number(state?.state || 50)) +
              Math.sin(index / 3) * (id.includes('co2') ? 100 : 1.5);
            return {
              entity_id: id,
              state: index === 7 ? 'unavailable' : isClimate ? 'heat' : String(value),
              attributes: {
                ...state?.attributes,
                ...(isClimate ? { current_temperature: value, temperature: 25 } : {}),
              },
              last_changed: new Date(start).toISOString(),
              last_updated: time,
            };
          }),
        ),
      );
      return;
    }
    if (url.pathname.startsWith('/api/camera_proxy/')) {
      if (controls.snapshotRedirect) {
        response.writeHead(302, { Location: controls.snapshotRedirect });
        response.end();
        return;
      }
      if (controls.failSnapshot) {
        json({ error: 'Fixture camera outage' }, 503);
        return;
      }
      response.writeHead(200, { 'Content-Type': controls.imageType });
      response.end(
        controls.oversizedImage
          ? Buffer.alloc(9 * 1024 * 1024)
          : Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
              'base64',
            ),
      );
      return;
    }
    json({ error: 'Unknown fixture endpoint' }, 404);
  });
  const websocket = new WebSocketServer({ server });
  const subscriptions = new Map<WebSocket, number>();
  const controls = {
    rejectAuth: false,
    rejectSubscription: false,
    stallAuth: false,
    stallSnapshot: false,
    respondToPing: true,
    now: null as Date | null,
    failHistory: false,
    failSnapshot: false,
    failedCalendars: [] as string[],
    snapshotRedirect: null as string | null,
    imageType: 'image/png',
    oversizedImage: false,
  };
  const states = new Map<string, HassEntity>([
    [
      'sensor.living_room_temperature',
      entity('sensor.living_room_temperature', '21.5', {
        friendly_name: 'Living room temperature',
        unit_of_measurement: '°C',
        device_class: 'temperature',
        access_token: fixtureAttributeSecret,
        entity_picture: `/api/camera_proxy/camera.fixture?token=${fixtureAttributeSecret}`,
      }),
    ],
    [
      'sensor.private_value',
      entity('sensor.private_value', '42', { friendly_name: 'Private fixture value' }),
    ],
    [
      'binary_sensor.front_door',
      entity('binary_sensor.front_door', 'off', {
        friendly_name: 'Front door',
        device_class: 'door',
      }),
    ],
  ]);
  if (rich) {
    const add = (id: string, value: string, attributes: HassEntity['attributes']) =>
      states.set(id, entity(id, value, { access_token: fixtureAttributeSecret, ...attributes }));
    add('weather.demo_home', 'partlycloudy', {
      friendly_name: 'Fixture home',
      temperature: 20,
      temperature_unit: '°C',
      humidity: 55,
      supported_features: 1,
      attribution: 'Fixture weather provider',
    });
    add('weather.demo_city', 'sunny', {
      friendly_name: 'Fixture city',
      temperature: 16,
      temperature_unit: '°C',
      humidity: 62,
      supported_features: 2,
    });
    add('sensor.demo_outdoor_temperature', '18.5', {
      friendly_name: 'Outdoor temperature',
      unit_of_measurement: '°C',
      device_class: 'temperature',
    });
    add('sensor.demo_humidity', '63', {
      friendly_name: 'Outdoor humidity',
      unit_of_measurement: '%',
      device_class: 'humidity',
    });
    add('sensor.demo_aqi', '24', { friendly_name: 'Air quality index' });
    add('sun.sun', 'above_horizon', { friendly_name: 'Sun' });
    add('calendar.demo_personal', 'off', { friendly_name: 'Personal calendar' });
    add('calendar.demo_work', 'off', { friendly_name: 'Work calendar' });
    add('climate.demo_upstairs', 'heat', {
      friendly_name: 'Upstairs thermostat',
      current_temperature: 21.5,
      temperature: 25,
      temperature_unit: '°C',
    });
    add('climate.demo_downstairs', 'heat', {
      friendly_name: 'Downstairs thermostat',
      current_temperature: 20.2,
      temperature: 25,
      temperature_unit: '°C',
    });
    add('sensor.demo_co2', '640', {
      friendly_name: 'Indoor CO₂',
      unit_of_measurement: 'ppm',
      device_class: 'carbon_dioxide',
    });
    add('sensor.demo_readiness', '86', { friendly_name: 'Readiness score' });
    add('binary_sensor.demo_door', 'off', { friendly_name: 'Front door', device_class: 'door' });
    add('binary_sensor.demo_window', 'off', {
      friendly_name: 'Kitchen window',
      device_class: 'window',
    });
    add('binary_sensor.demo_motion', 'off', {
      friendly_name: 'Front door motion',
      device_class: 'motion',
    });
    add('camera.demo_front', 'idle', {
      friendly_name: 'Front door camera',
      entity_picture: `/api/camera_proxy/camera.demo_front?token=${fixtureAttributeSecret}`,
    });
  }
  const messages: { type: string; id?: number; event_type?: string }[] = [];
  let beforeSnapshot: (() => void) | undefined;
  websocket.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.10.0' }));
    socket.on('close', () => subscriptions.delete(socket));
    socket.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      messages.push(message);
      if (message.type === 'auth') {
        if (controls.stallAuth) return;
        if (controls.rejectAuth || message.access_token !== fixtureToken) {
          socket.send(JSON.stringify({ type: 'auth_invalid', message: 'Invalid fixture token' }));
          socket.close();
        } else socket.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.10.0' }));
      } else if (message.type === 'subscribe_events') {
        if (!controls.rejectSubscription) subscriptions.set(socket, message.id);
        socket.send(
          JSON.stringify({
            id: message.id,
            type: 'result',
            success: !controls.rejectSubscription,
            result: null,
            ...(controls.rejectSubscription
              ? { error: { code: 'unauthorized', message: 'Fixture account cannot subscribe' } }
              : {}),
          }),
        );
      } else if (message.type === 'get_states') {
        if (controls.stallSnapshot) return;
        const snapshot = [...states.values()];
        beforeSnapshot?.();
        beforeSnapshot = undefined;
        socket.send(
          JSON.stringify({ id: message.id, type: 'result', success: true, result: snapshot }),
        );
      } else if (message.type === 'ping' && controls.respondToPing) {
        socket.send(JSON.stringify({ id: message.id, type: 'pong' }));
      } else if (message.type === 'get_config') {
        socket.send(
          JSON.stringify({
            id: message.id,
            type: 'result',
            success: true,
            result: {
              latitude: 40,
              longitude: -74,
              time_zone: 'UTC',
              unit_system: { temperature: '°C' },
              internal_url: `http://private.fixture/${fixtureAttributeSecret}`,
            },
          }),
        );
      } else if (message.type === 'weather/subscribe_forecast') {
        const now = controls.now || new Date(),
          today = now.toISOString().slice(0, 10);
        const count = message.forecast_type === 'hourly' ? 28 : 7;
        const forecast = Array.from({ length: count }, (_, index) => ({
          datetime: new Date(
            Date.parse(`${today}T12:00:00Z`) +
              index * (message.forecast_type === 'hourly' ? 6 : 24) * 3600_000,
          ).toISOString(),
          condition: index % 3 === 0 ? 'sunny' : 'partlycloudy',
          temperature: 22 + (index % 4),
          templow: message.forecast_type === 'daily' ? 12 + (index % 3) : undefined,
          private_token: fixtureAttributeSecret,
        }));
        socket.send(
          JSON.stringify({ id: message.id, type: 'result', success: true, result: null }),
        );
        socket.send(
          JSON.stringify({
            id: message.id,
            type: 'event',
            event: { type: message.forecast_type, forecast },
          }),
        );
      } else if (message.type === 'unsubscribe_events') {
        if (subscriptions.get(socket) === message.subscription) subscriptions.delete(socket);
        socket.send(
          JSON.stringify({ id: message.id, type: 'result', success: true, result: null }),
        );
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  function update(id: string, state: string | null, attributes: HassEntity['attributes'] = {}) {
    const previous = states.get(id);
    const next =
      state === null
        ? null
        : entity(id, state, { ...(previous?.attributes || { friendly_name: id }), ...attributes });
    if (next) states.set(id, next);
    else states.delete(id);
    for (const [socket, subscription] of subscriptions)
      socket.send(
        JSON.stringify({
          type: 'event',
          id: subscription,
          event: {
            event_type: 'state_changed',
            data: { entity_id: id, old_state: previous || null, new_state: next },
          },
        }),
      );
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    controls,
    messages,
    requests,
    states,
    update,
    beforeSnapshot(callback: () => void) {
      beforeSnapshot = callback;
    },
    dropConnections() {
      for (const socket of websocket.clients) socket.terminate();
    },
    async close() {
      for (const socket of websocket.clients) socket.terminate();
      await new Promise<void>((resolve) => websocket.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
