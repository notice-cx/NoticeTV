import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

try {
  const directory = resolve(process.env.NOTICETV_DATA_DIR || '.data');
  console.log(
    process.env.NOTICETV_EDITOR_KEY ||
      (await readFile(resolve(directory, 'editor-key'), 'utf8')).trim(),
  );
} catch {
  console.error('Start NoticeTV first, then run npm run access-key from the app directory.');
  process.exitCode = 1;
}
