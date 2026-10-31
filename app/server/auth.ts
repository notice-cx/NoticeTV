import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type Role = 'editor' | 'display';
const COOKIE = 'noticetv_session';

export async function loadEditorKey(directory: string) {
  const configured = process.env.NOTICETV_EDITOR_KEY;
  if (configured) {
    if (configured.length < 24 || configured.length > 256)
      throw new Error('NOTICETV_EDITOR_KEY must have 24 to 256 characters.');
    return configured;
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = join(directory, 'editor-key');
  try {
    await writeFile(filename, `${randomBytes(32).toString('base64url')}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const key = (await readFile(filename, 'utf8')).trim();
  if (key.length < 24 || key.length > 256)
    throw new Error('The editor-key file is invalid. Restore it before starting NoticeTV.');
  return key;
}

export function equalSecret(a: string, b: string) {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}

export function sessionCookie(role: Role, key: string, secure: boolean) {
  const maxAge = role === 'editor' ? 12 * 60 * 60 : 30 * 24 * 60 * 60;
  const payload = Buffer.from(
    JSON.stringify({
      role,
      expires: Date.now() + maxAge * 1000,
      nonce: randomBytes(16).toString('hex'),
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', key).update(payload).digest('base64url');
  return `${COOKIE}=${payload}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function readSessionDetails(
  cookie: string | undefined,
  key: string,
): { role: Role; expires: number } | null {
  const value = cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!value || value.length > 1024) return null;
  try {
    const parts = value.split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const expected = createHmac('sha256', key).update(payload).digest('base64url');
    if (!equalSecret(signature, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return (data.role === 'editor' || data.role === 'display') &&
      typeof data.expires === 'number' &&
      data.expires > Date.now()
      ? { role: data.role, expires: data.expires }
      : null;
  } catch {
    return null;
  }
}

export function readSession(cookie: string | undefined, key: string): Role | null {
  return readSessionDetails(cookie, key)?.role ?? null;
}

export const clearSessionCookie = (secure: boolean) =>
  `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
