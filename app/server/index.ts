import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { loadEditorKey } from './auth.js';
import { DashboardStore } from './store.js';
import { HomeAssistantConnection } from './home-assistant.js';

const development = process.env.NODE_ENV !== 'production' && !import.meta.url.includes('/build/');
const root = resolve(dirname(fileURLToPath(import.meta.url)), development ? '..' : '../..');
const port = Number(process.env.PORT || 3000);
const host = process.env.NOTICETV_HOST || '127.0.0.1';
const origin = process.env.NOTICETV_ORIGIN || `http://localhost:${port}`;
const directory = resolve(process.env.NOTICETV_DATA_DIR || resolve(root, '.data'));
const editorKey = await loadEditorKey(directory);
const store = await new DashboardStore(directory).initialize();
const homeAssistant = await new HomeAssistantConnection(directory).initialize();
const app = createApp({
  store,
  editorKey,
  origin,
  development,
  homeAssistant,
  secureCookies: process.env.NOTICETV_SECURE_COOKIES === '1',
});
const server = createServer(app);
let closeVite: (() => Promise<void>) | undefined;

if (development) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true, hmr: { server }, allowedHosts: [new URL(origin).hostname] },
    appType: 'custom',
  });
  closeVite = () => vite.close();
  app.use(vite.middlewares);
  app.get(/.*/, async (request, response, next) => {
    try {
      const html = await vite.transformIndexHtml(
        request.originalUrl,
        await readFile(resolve(root, 'index.html'), 'utf8'),
      );
      response.type('html').send(html);
    } catch (error) {
      next(error);
    }
  });
} else {
  app.use(express.static(resolve(root, 'dist'), { index: false, dotfiles: 'deny', maxAge: '1h' }));
  app.get(/.*/, (_request, response) => {
    response.set('Cache-Control', 'no-cache').sendFile(resolve(root, 'dist/index.html'));
  });
}

server.listen(port, host, () => {
  console.log(`NoticeTV is ready at ${origin}`);
  console.log('Open /demo to explore the design. Run npm run access-key to get your editor key.');
});
const shutdown = async () => {
  homeAssistant.close();
  await closeVite?.();
  server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
