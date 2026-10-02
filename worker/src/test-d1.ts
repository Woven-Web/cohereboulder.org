// A minimal in-memory D1 for unit tests, backed by node:sqlite (Node 22.5+).
// Only the surface the Worker uses: prepare().bind().run()/all()/first().
// D1's `?1`-style numbered parameters are SQLite-native, so the SQL runs
// unmodified — the point is to test the real statements, not a mock of them.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

interface SqliteStatement {
  run(...params: unknown[]): { changes: number | bigint };
  all(...params: unknown[]): Record<string, unknown>[];
}
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => SqliteDb;
};

class Statement {
  constructor(
    private db: SqliteDb,
    private sql: string,
    private params: unknown[] = [],
  ) {}
  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params);
  }
  async run() {
    const isQuery = /\bRETURNING\b/i.test(this.sql);
    if (isQuery) {
      const results = this.db.prepare(this.sql).all(...this.params);
      return { success: true, results, meta: { changes: results.length } };
    }
    const info = this.db.prepare(this.sql).run(...this.params);
    return { success: true, results: [], meta: { changes: Number(info.changes) } };
  }
  async all<T = Record<string, unknown>>() {
    const results = this.db.prepare(this.sql).all(...this.params) as T[];
    return { success: true, results, meta: { changes: 0 } };
  }
  async first<T = Record<string, unknown>>() {
    const rows = this.db.prepare(this.sql).all(...this.params) as T[];
    return rows[0] ?? null;
  }
}

export function testD1(schemaFiles: string[]) {
  const db = new DatabaseSync(":memory:");
  for (const file of schemaFiles) db.exec(readFileSync(new URL(file, import.meta.url), "utf8"));
  let batchTail: Promise<unknown> = Promise.resolve();
  return {
    prepare: (sql: string) => new Statement(db, sql),
    /** D1 batch() commits all statements or rolls the entire batch back. */
    batch(statements: Statement[]) {
      const run = async () => {
        db.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          db.exec("COMMIT");
          return results;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      };
      // D1 serializes transactions, including concurrently submitted batches.
      const result = batchTail.then(run);
      batchTail = result.catch(() => {});
      return result;
    },
    /** Direct access for assertions. */
    raw: db,
  };
}

/** A KV stand-in with get/put/delete, enough for rateLimited(). */
export function testKV() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}
