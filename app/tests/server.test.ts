import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, get, type Server } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDashboard } from '../shared/dashboard';
import { createApp } from '../server/app';
import { readSession, sessionCookie } from '../server/auth';
import { DashboardStore, RevisionConflict } from '../server/store';

const key = 'noticetv-unit-test-editor-fixture';
let directory: string;
let server: Server | undefined;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'noticetv-test-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (server) {
    const active = server;
    server = undefined;
    await new Promise<void>((resolve) => active.close(() => resolve()));
  }
  await rm(directory, { recursive: true, force: true });
});

describe('durable publication', () => {
  it('saves drafts without changing the display, then publishes and survives a restart', async () => {
    const store = await new DashboardStore(directory).initialize();
    const edited = { ...createDashboard(), title: 'The new view' };
    const draft = await store.save(edited, 0, false);
    expect(draft.published.title).not.toBe(edited.title);
    expect(draft.publishedVersion).toBe(0);
    const published = await store.save(edited, 1, true);
    expect(published.published.title).toBe(edited.title);
    expect(published.publishedVersion).toBe(1);
    expect((await new DashboardStore(directory).initialize()).read()).toEqual(published);
  });

  it('refuses a stale editor instead of overwriting newer work', async () => {
    const store = await new DashboardStore(directory).initialize();
    const results = await Promise.allSettled([
      store.save({ ...createDashboard(), title: 'First edit' }, 0, true),
      store.save({ ...createDashboard(), title: 'Stale edit' }, 0, true),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: expect.any(RevisionConflict) });
    expect(store.read().published.title).toBe('First edit');
    await expect(store.save(createDashboard(), 1, false)).resolves.toMatchObject({ revision: 2 });
  });

  it('does not replace an unreadable or invalid saved dashboard with an empty one', async () => {
    await writeFile(join(directory, 'dashboard.json'), '{broken');
    await expect(new DashboardStore(directory).initialize()).rejects.toThrow();
    expect(await readFile(join(directory, 'dashboard.json'), 'utf8')).toBe('{broken');
  });
});

describe('editor and screen permissions', () => {
  async function start() {
    const store = await new DashboardStore(directory).initialize();
    server = createServer();
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const origin = `http://127.0.0.1:${port}`;
    server.on('request', createApp({ store, editorKey: key, origin }));
    async function request(
      path: string,
      method = 'GET',
      body?: unknown,
      cookie?: string,
      extraHeaders?: Record<string, string>,
    ) {
      return fetch(`${origin}/api${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: origin }),
          ...(cookie ? { Cookie: cookie } : {}),
          ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }
    const login = await request('/login', 'POST', { key });
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    return { request, cookie, store, origin };
  }

  it('requires authentication for all dashboard data', async () => {
    const { request } = await start();
    for (const path of ['/dashboard', '/document']) expect((await request(path)).status).toBe(401);
    expect((await request('/login', 'POST', { key: 'wrong' })).status).toBe(401);
    expect(await (await request('/session')).json()).toEqual({ role: null });
  });

  it('rejects cross-origin writes and unexpected hosts, including an authenticated request', async () => {
    const { request, cookie, origin } = await start();
    expect(
      (await request('/pairing', 'POST', {}, cookie, { Origin: 'https://other.example' })).status,
    ).toBe(403);
    const status = await new Promise<number | undefined>((resolve, reject) => {
      get(
        `${origin}/api/document`,
        { headers: { Host: 'other.example', Cookie: cookie } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      ).on('error', reject);
    });
    expect(status).toBe(421);
  });

  it('pairs a screen once, without giving it editing or pairing privileges', async () => {
    const { request, cookie } = await start();
    const { code } = await (await request('/pairing', 'POST', {}, cookie)).json();
    const paired = await request('/pair', 'POST', { code });
    expect(paired.status).toBe(200);
    const viewer = paired.headers.get('set-cookie')!.split(';')[0];
    expect(paired.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict');
    expect((await request('/dashboard', 'GET', undefined, viewer)).status).toBe(200);
    expect((await request('/document', 'GET', undefined, viewer)).status).toBe(403);
    expect(
      (await request('/publish', 'POST', { dashboard: createDashboard(), baseRevision: 0 }, viewer))
        .status,
    ).toBe(403);
    expect((await request('/pairing', 'POST', {}, viewer)).status).toBe(403);
    expect((await request('/pair', 'POST', { code })).status).toBe(401);
  });

  it('validates publication and returns a conflict for concurrent editors', async () => {
    const { request, cookie } = await start();
    const invalid = { ...createDashboard(), timeZone: 'invalid-zone' };
    expect(
      (await request('/publish', 'POST', { dashboard: invalid, baseRevision: 0 }, cookie)).status,
    ).toBe(400);
    expect(
      (await request('/publish', 'POST', { dashboard: createDashboard(), baseRevision: 0 }, cookie))
        .status,
    ).toBe(200);
    expect(
      (await request('/draft', 'PUT', { dashboard: createDashboard(), baseRevision: 0 }, cookie))
        .status,
    ).toBe(409);
    expect(
      (await request('/document', 'GET', undefined, cookie)).headers.get('cache-control'),
    ).toBe('no-store');
  });

  it('does not accept tampered screen roles or a different server’s session', () => {
    const cookie = sessionCookie('display', key, true);
    expect(cookie).toContain('; Secure');
    expect(readSession(cookie, key)).toBe('display');
    expect(readSession(cookie, 'another-server')).toBeNull();
    const [name, value] = cookie.split(';')[0].split('=');
    const [payload, signature] = value.split('.');
    const changed = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, 'base64url').toString()),
        role: 'editor',
      }),
    ).toString('base64url');
    expect(readSession(`${name}=${changed}.${signature}`, key)).toBeNull();
  });

  it('renews an active display while refusing expired sessions', async () => {
    const { request } = await start();
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now - 2 * 24 * 60 * 60_000);
    const display = sessionCookie('display', key, false).split(';')[0];
    const editor = sessionCookie('editor', key, false).split(';')[0];
    clock.mockReturnValue(now - 31 * 24 * 60 * 60_000);
    const expired = sessionCookie('display', key, false).split(';')[0];
    clock.mockRestore();
    const active = await request('/dashboard', 'GET', undefined, display);
    expect(active.status).toBe(200);
    expect(readSession(active.headers.get('set-cookie')!, key)).toBe('display');
    expect((await request('/document', 'GET', undefined, editor)).status).toBe(401);
    expect((await request('/dashboard', 'GET', undefined, expired)).status).toBe(401);
  });
});
