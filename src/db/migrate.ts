/**
 * Runtime auto-migration for D1.
 *
 * D1 has no filesystem, so drizzle-orm's FS migrator cannot run in a Worker.
 * Instead we bundle the generated `drizzle/*.sql` files at build time (Vite
 * `?raw` glob) and apply any not-yet-applied ones on the first request after a
 * deploy. A non-technical operator therefore never has to run a CLI.
 *
 * Tracking uses Wrangler's own `d1_migrations` table (same name + schema +
 * filename keys), so this runtime path and `wrangler d1 migrations apply`
 * interoperate in EITHER order:
 *   - wrangler-first: the migration is already recorded here -> we skip it.
 *   - runtime-first: we record it here -> a later `wrangler ... apply` skips it.
 * Each CREATE is also rewritten to `IF NOT EXISTS` as a belt-and-suspenders
 * guard against a tracker/schema drift.
 */

// Wrangler's migrations table (default `migrations_table`). Mirrors the exact
// schema Wrangler creates so the two migration paths share one source of truth.
const MIGRATIONS_TABLE = "d1_migrations";
const CREATE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

import { splitStatements } from "./migrations-parse.ts";

const migrationModules = import.meta.glob("../../drizzle/*.sql", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

interface Migration {
  name: string;
  statements: string[];
}

const MIGRATIONS: Migration[] = Object.entries(migrationModules)
  .map(([path, raw]) => ({
    name: path.split("/").pop() ?? path,
    statements: splitStatements(raw),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

// One run per isolate: concurrent first requests share a single promise.
let migratePromise: Promise<void> | null = null;

export function ensureMigrated(db: D1Database): Promise<void> {
  migratePromise ??= runMigrations(db).catch((err: unknown) => {
    // Allow a later request to retry if this run failed.
    migratePromise = null;
    throw err;
  });
  return migratePromise;
}

async function runMigrations(db: D1Database): Promise<void> {
  await db.prepare(CREATE_MIGRATIONS_TABLE).run();

  const { results } = await db.prepare(`SELECT name FROM ${MIGRATIONS_TABLE}`).all<{ name: string }>();
  const applied = new Set(results.map((r) => r.name));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;

    // Apply the migration's statements AND claim it in one atomic batch. If
    // another cold isolate already claimed it, the UNIQUE(name) insert fails and
    // D1 rolls back the whole batch, so nothing is applied twice.
    const claim = db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (?)`).bind(migration.name);

    try {
      await db.batch([...migration.statements.map((s) => db.prepare(s)), claim]);
    } catch (err) {
      // Lost the race? If the migration is now recorded, treat it as applied.
      const exists = await db
        .prepare(`SELECT 1 FROM ${MIGRATIONS_TABLE} WHERE name = ?`)
        .bind(migration.name)
        .first();
      if (!exists) throw err;
    }
  }
}
