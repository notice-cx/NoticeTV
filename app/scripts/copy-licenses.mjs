import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve('dist/licenses');
await mkdir(directory, { recursive: true });
for (const name of ['react', 'react-dom', 'hls.js', 'lucide-react', 'zod', 'suncalc']) {
  await copyFile(resolve('node_modules', name, 'LICENSE'), resolve(directory, `${name}.txt`));
}
