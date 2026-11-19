// Embedded Postgres access. One PGlite instance; every logical request runs
// inside a serialized transaction that SET LOCALs the acting context, so the
// non-owner role and the tenant GUCs never leak across queued requests.

import { PGlite } from "@electric-sql/pglite";
import { MIGRATIONS } from "./migrations.ts";
import { SEED_SQL } from "./seed.ts";

export interface Actor {
  tenantId: number;
  userId: number;
  actor: "user" | "webhook" | "system";
}

export class PortalDb {
  private inner: PGlite;
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(inner: PGlite) {
    this.inner = inner;
  }

  static async open(): Promise<PortalDb> {
    const inner = new PGlite();
    const db = new PortalDb(inner);
    await db.migrate();
    return db;
  }

  private async migrate(): Promise<void> {
    for (const m of MIGRATIONS) {
      const seen = await this.inner.query(
        "SELECT 1 FROM portal.schema_migrations WHERE id = $1",
        [m.id],
      ).catch(() => ({ rows: [] }));
      if ((seen as { rows: unknown[] }).rows.length > 0) continue;
      await this.inner.exec(m.sql);
      await this.inner.query(
        "INSERT INTO portal.schema_migrations (id) VALUES ($1)",
        [m.id],
      );
    }
    const seeded = await this.inner.query(
      "SELECT 1 FROM portal.schema_migrations WHERE id = 'seed'",
    );
    if (seeded.rows.length === 0) {
      await this.inner.exec(SEED_SQL);
      await this.inner.query(
        "INSERT INTO portal.schema_migrations (id) VALUES ('seed')",
      );
    }
  }

  // Raw owner-context call (no SET ROLE) for bootstrap/system lookups only.
  async system<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return this.enqueue(async () => {
      const r = await this.inner.query(sql, params);
      return r.rows as T[];
    });
  }

  // Run fn inside a transaction as the non-owner role with tenant context.
  async tx<T>(actor: Actor, fn: (q: Query) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      await this.inner.exec("BEGIN");
      try {
        await this.inner.query(
          `SELECT set_config('app.tenant_id', $1, true),
                  set_config('app.user_id', $2, true),
                  set_config('app.actor', $3, true)`,
          [String(actor.tenantId), String(actor.userId), actor.actor],
        );
        await this.inner.exec("SET LOCAL ROLE app_user");
        const q: Query = async (sql, params = []) => {
          const r = await this.inner.query(sql, params);
          return r.rows as Record<string, unknown>[];
        };
        const out = await fn(q);
        await this.inner.exec("COMMIT");
        return out;
      } catch (err) {
        await this.inner.exec("ROLLBACK");
        throw err;
      }
    });
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

export type Query = (
  sql: string,
  params?: unknown[],
) => Promise<Record<string, unknown>[]>;
