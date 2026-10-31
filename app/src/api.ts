import type { Dashboard, Document } from '../shared/dashboard';

export type Role = 'editor' | 'display' | null;
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'The connection was interrupted. Try again.';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(data.error || 'NoticeTV could not complete this request.', response.status);
  return data as T;
}

export const saveDashboard = (dashboard: Dashboard, baseRevision: number, publish: boolean) =>
  api<Document>(publish ? '/publish' : '/draft', publish ? 'POST' : 'PUT', {
    dashboard,
    baseRevision,
  });
