import express, { type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { dashboardSchema, widgetSchema, validTimeZone } from '../shared/dashboard.js';
import { isRichWidget, widgetEntityIds } from '../shared/rich-widgets.js';
import { HAWidgets } from './ha-widgets.js';
import {
  clearSessionCookie,
  equalSecret,
  readSession,
  readSessionDetails,
  sessionCookie,
} from './auth.js';
import { DashboardStore, RevisionConflict } from './store.js';
import { connectionInputSchema, entityIdSchema } from '../shared/home-assistant.js';
import { HomeAssistantConnection, HomeAssistantError } from './home-assistant.js';

type Options = {
  store: DashboardStore;
  editorKey: string;
  origin: string;
  secureCookies?: boolean;
  development?: boolean;
  homeAssistant: HomeAssistantConnection;
};

export function createApp({
  store,
  editorKey,
  origin,
  secureCookies = false,
  development = false,
  homeAssistant,
}: Options) {
  const app = express();
  const expected = new URL(origin);
  const pairings = new Map<string, number>();
  const haWidgets = new HAWidgets(homeAssistant);
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    if (request.get('host') !== expected.host) {
      response.status(421).json({ error: 'Use the configured NoticeTV address.' });
      return;
    }
    response.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': `default-src 'self'; script-src 'self'${development ? " 'unsafe-inline'" : ''}; style-src 'self' 'unsafe-inline'; connect-src 'self' https: http: ws: wss:; img-src 'self' data: blob: https: http:; media-src 'self' blob: https: http:; worker-src 'self' blob:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
    });
    if (request.path.startsWith('/api/')) response.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (request.get('origin') !== expected.origin) {
        response.status(403).json({ error: 'Open the editor at the configured NoticeTV address.' });
        return;
      }
      if (!request.is('application/json')) {
        response.status(415).json({ error: 'Send JSON.' });
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: '128kb' }));

  const authorized =
    (editorOnly: boolean): RequestHandler =>
    (request, response, next) => {
      const session = readSessionDetails(request.headers.cookie, editorKey);
      const role = session?.role;
      if (!role) {
        response.status(401).json({ error: 'Connect to NoticeTV to continue.' });
        return;
      }
      if (editorOnly && role !== 'editor') {
        response
          .status(403)
          .json({ error: 'This screen can display dashboards. Use the editor to make changes.' });
        return;
      }
      if (session?.role === 'display' && session.expires - Date.now() < 29 * 24 * 60 * 60_000) {
        response.set('Set-Cookie', sessionCookie('display', editorKey, secureCookies));
      }
      next();
    };
  const authLimit = rateLimit({
    windowMs: 15 * 60_000,
    limit: 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Try again in 15 minutes.' },
  });

  app.get('/api/session', (request, response) => {
    response.json({ role: readSession(request.headers.cookie, editorKey) });
  });
  app.post('/api/login', authLimit, (request, response) => {
    const result = z.object({ key: z.string().min(1).max(256) }).safeParse(request.body);
    if (!result.success || !equalSecret(result.data.key, editorKey)) {
      response.status(401).json({ error: 'That editor key didn’t match. Check it and try again.' });
      return;
    }
    response
      .set('Set-Cookie', sessionCookie('editor', editorKey, secureCookies))
      .json({ role: 'editor' });
  });
  app.post('/api/logout', (_request, response) => {
    response.set('Set-Cookie', clearSessionCookie(secureCookies)).json({ ok: true });
  });
  app.post('/api/pairing', authorized(true), (_request, response) => {
    pairings.clear();
    const code = String(randomInt(100_000, 1_000_000));
    const expires = Date.now() + 5 * 60_000;
    pairings.set(code, expires);
    response.json({ code, expires });
  });
  app.post('/api/pair', authLimit, (request, response) => {
    const result = z.object({ code: z.string().regex(/^\d{6}$/) }).safeParse(request.body);
    const expires = result.success ? pairings.get(result.data.code) : undefined;
    if (!result.success || !expires || expires <= Date.now()) {
      response
        .status(401)
        .json({ error: 'That code is invalid or has expired. Create a new code in the editor.' });
      return;
    }
    pairings.delete(result.data.code);
    response
      .set('Set-Cookie', sessionCookie('display', editorKey, secureCookies))
      .json({ role: 'display' });
  });
  app.get('/api/dashboard', authorized(false), (_request, response) => {
    const { published: dashboard, publishedVersion: version } = store.read();
    response.json({ dashboard, version });
  });
  app.get('/api/document', authorized(true), (_request, response) => {
    response.json(store.read());
  });

  app.get('/api/home-assistant', authorized(true), (_request, response) => {
    response.json(homeAssistant.status());
  });
  const connectionLimit = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many connection attempts. Try again in a minute.' },
  });
  app.put(
    '/api/home-assistant',
    authorized(true),
    connectionLimit,
    async (request, response, next) => {
      const result = connectionInputSchema.safeParse(request.body);
      if (!result.success) {
        response
          .status(400)
          .json({ error: result.error.issues.map((issue) => issue.message).join(' ') });
        return;
      }
      try {
        response.json(await homeAssistant.configure(result.data));
      } catch (error) {
        if (error instanceof HomeAssistantError)
          response.status(422).json({ error: error.message });
        else next(error);
      }
    },
  );
  app.delete('/api/home-assistant', authorized(true), async (_request, response, next) => {
    try {
      response.json(await homeAssistant.disconnect());
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/home-assistant/entities', authorized(true), (_request, response) => {
    response.json({ entities: homeAssistant.entities() });
  });
  app.get('/api/home-assistant/data', authorized(false), (request, response) => {
    const result = z
      .string()
      .max(5200)
      .transform((value) => (value ? value.split(',') : []))
      .pipe(z.array(entityIdSchema).max(20))
      .safeParse(request.query.entities ?? '');
    if (!result.success) {
      response.status(400).json({ error: 'Choose up to 20 valid Home Assistant entities.' });
      return;
    }
    if (readSession(request.headers.cookie, editorKey) !== 'editor') {
      const allowed = new Set(store.read().published.widgets.flatMap(widgetEntityIds));
      if (result.data.some((id) => !allowed.has(id))) {
        response.status(403).json({ error: 'This entity is not part of the published dashboard.' });
        return;
      }
    }
    response.json(homeAssistant.data(result.data));
  });

  const widgetInput = z.object({
    widget: widgetSchema,
    timeZone: z.string().max(100).refine(validTimeZone),
    units: z.enum(['celsius', 'fahrenheit']),
  });
  const preview =
    (snapshot: boolean): RequestHandler =>
    async (request, response, next) => {
      const input = widgetInput.safeParse(request.body);
      if (
        !input.success ||
        !isRichWidget(input.data.widget) ||
        (snapshot && (input.data.widget.type !== 'ha-camera' || !input.data.widget.entityId))
      ) {
        response
          .status(400)
          .json({ error: 'Choose a valid Home Assistant widget and its sources.' });
        return;
      }
      try {
        const { widget, timeZone, units } = input.data;
        if (snapshot && widget.type === 'ha-camera') {
          const image = await haWidgets.snapshot(widget.entityId);
          response
            .set({
              'Content-Type': image.type,
              'X-NoticeTV-Captured-At': image.capturedAt,
              'X-NoticeTV-Stale': image.stale ? '1' : '0',
            })
            .send(image.body);
        } else if (isRichWidget(widget))
          response.json(await haWidgets.data(widget, timeZone, units));
      } catch (error) {
        if (error instanceof HomeAssistantError)
          response.status(503).json({ error: error.message });
        else next(error);
      }
    };
  const published =
    (snapshot: boolean): RequestHandler =>
    async (request, response, next) => {
      const board = store.read().published;
      const widget = board.widgets.find((entry) => entry.id === request.params.id);
      if (
        !widget ||
        !isRichWidget(widget) ||
        (snapshot && (widget.type !== 'ha-camera' || !widget.entityId))
      ) {
        response.status(404).json({ error: 'This Home Assistant widget is not published.' });
        return;
      }
      try {
        if (snapshot && widget.type === 'ha-camera') {
          const image = await haWidgets.snapshot(widget.entityId);
          response
            .set({
              'Content-Type': image.type,
              'X-NoticeTV-Captured-At': image.capturedAt,
              'X-NoticeTV-Stale': image.stale ? '1' : '0',
            })
            .send(image.body);
        } else response.json(await haWidgets.data(widget, board.timeZone, board.units));
      } catch (error) {
        if (error instanceof HomeAssistantError)
          response.status(503).json({ error: error.message });
        else next(error);
      }
    };
  app.post('/api/home-assistant/widget-preview', authorized(true), preview(false));
  app.post('/api/home-assistant/camera-preview', authorized(true), preview(true));
  app.get('/api/home-assistant/widgets/:id/data', authorized(false), published(false));
  app.get('/api/home-assistant/widgets/:id/snapshot', authorized(false), published(true));

  const save =
    (publish: boolean): RequestHandler =>
    async (request, response, next) => {
      const result = z
        .object({ dashboard: dashboardSchema, baseRevision: z.number().int().nonnegative() })
        .safeParse(request.body);
      if (!result.success) {
        response
          .status(400)
          .json({ error: result.error.issues.map((issue) => issue.message).join(' ') });
        return;
      }
      try {
        response.json(await store.save(result.data.dashboard, result.data.baseRevision, publish));
      } catch (error) {
        if (error instanceof RevisionConflict) {
          response.status(409).json({
            error:
              'This dashboard changed in another editor. Reload the saved version before publishing.',
          });
          return;
        }
        next(error);
      }
    };
  app.put('/api/draft', authorized(true), save(false));
  app.post('/api/publish', authorized(true), save(true));
  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'This NoticeTV endpoint does not exist.' });
  });
  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      const status = (error as { status?: number }).status;
      response.status(status === 413 ? 413 : status === 400 ? 400 : 500).json({
        error:
          status === 413
            ? 'This dashboard is too large.'
            : status === 400
              ? 'The request contains invalid JSON.'
              : 'NoticeTV could not save this change. Your published dashboard is still available.',
      });
    },
  );
  return app;
}
