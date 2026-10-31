import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  createDashboard,
  dashboardSchema,
  type Dashboard,
  type Document,
} from '../shared/dashboard.js';

const documentSchema = z.object({
  revision: z.number().int().nonnegative(),
  publishedVersion: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  draft: dashboardSchema,
  published: dashboardSchema,
});

export class RevisionConflict extends Error {}

export class DashboardStore {
  private document!: Document;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private directory: string) {}

  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      this.document = documentSchema.parse(
        JSON.parse(await readFile(join(this.directory, 'dashboard.json'), 'utf8')),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const dashboard = createDashboard();
      const document = {
        revision: 0,
        publishedVersion: 0,
        updatedAt: new Date().toISOString(),
        draft: dashboard,
        published: dashboard,
      };
      await this.persist(document);
      this.document = document;
    }
    return this;
  }

  read(): Document {
    return structuredClone(this.document);
  }

  save(dashboard: Dashboard, baseRevision: number, publish: boolean): Promise<Document> {
    const operation = this.queue.then(async () => {
      if (baseRevision !== this.document.revision) throw new RevisionConflict();
      const validated = dashboardSchema.parse(dashboard);
      const next: Document = {
        revision: this.document.revision + 1,
        publishedVersion: this.document.publishedVersion + (publish ? 1 : 0),
        updatedAt: new Date().toISOString(),
        draft: validated,
        published: publish ? validated : this.document.published,
      };
      // A failed disk write must never become a successful in-memory publication.
      await this.persist(next);
      this.document = structuredClone(next);
      return this.read();
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private async persist(document: Document) {
    const temporary = join(this.directory, `.dashboard-${randomUUID()}.tmp`);
    const handle = await open(temporary, 'wx', 0o600);
    try {
      try {
        await handle.writeFile(`${JSON.stringify(document, null, 2)}\n`);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, join(this.directory, 'dashboard.json'));
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
}
