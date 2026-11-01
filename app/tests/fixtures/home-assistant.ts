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

export async function startHomeAssistantFixture() {
  const server = createServer((_request, response) => {
    response.writeHead(404);
    response.end();
  });
  const websocket = new WebSocketServer({ server });
  const subscriptions = new Map<WebSocket, number>();
  const controls = {
    rejectAuth: false,
    rejectSubscription: false,
    stallAuth: false,
    stallSnapshot: false,
    respondToPing: true,
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
      } else if (message.type === 'unsubscribe_events') {
        subscriptions.delete(socket);
        socket.send(
          JSON.stringify({ id: message.id, type: 'result', success: true, result: null }),
        );
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  function update(id: string, state: string | null) {
    const previous = states.get(id);
    const next =
      state === null ? null : entity(id, state, previous?.attributes || { friendly_name: id });
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
