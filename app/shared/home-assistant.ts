import { z } from 'zod';

export const entityIdSchema = z
  .string()
  .max(255)
  .regex(/^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/);

export const connectionInputSchema = z.object({
  url: z
    .string()
    .trim()
    .max(2048)
    .transform((value, context) => {
      try {
        const url = new URL(value);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          url.pathname !== '/'
        )
          throw new Error();
        return url.origin;
      } catch {
        context.addIssue({
          code: 'custom',
          message:
            'Use your Home Assistant’s http:// or https:// address, without a path or embedded credentials.',
        });
        return z.NEVER;
      }
    }),
  token: z.string().trim().min(1).max(8192).optional(),
});

export type ConnectionPhase =
  'not_configured' | 'connecting' | 'connected' | 'reconnecting' | 'auth_failed' | 'error';
export type HomeAssistantEntity = {
  id: string;
  name: string;
  state: string;
  unit: string | null;
  deviceClass: string | null;
  lastUpdated: string | null;
};
export type HomeAssistantData = {
  phase: ConnectionPhase;
  receivedAt: string | null;
  entities: Record<string, HomeAssistantEntity>;
};
export type HomeAssistantStatus = {
  url: string | null;
  phase: ConnectionPhase;
  entityCount: number;
  receivedAt: string | null;
};

export const connectionLabels: Record<ConnectionPhase, string> = {
  not_configured: 'Not connected',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  auth_failed: 'Token rejected',
  error: 'Connection needs attention',
};
