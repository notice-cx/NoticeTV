import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork } from 'node:child_process';

// A fresh directory prevents a previous run's saved sources from being contacted by this suite.
const directory = await mkdtemp(join(tmpdir(), 'noticetv-browser-'));
const server = fork('build/server/index.js', {
  env: { ...process.env, NOTICETV_DATA_DIR: directory },
  stdio: 'inherit',
});
process.on('SIGTERM', () => server.kill('SIGTERM'));
process.on('SIGINT', () => server.kill('SIGINT'));
server.on('exit', async (code) => {
  await rm(directory, { recursive: true, force: true });
  process.exit(code || 0);
});
