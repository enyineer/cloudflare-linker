/** Pure migration-SQL parsing (no D1, no Vite glob) so it is unit-testable. */

/** Split a Drizzle migration file into individual, idempotent SQL statements. */
export function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(makeIdempotent);
}

/** Make CREATE TABLE/INDEX idempotent so re-application over existing tables is a no-op. */
export function makeIdempotent(statement: string): string {
  return statement
    .replace(/^CREATE TABLE (?!IF NOT EXISTS)/i, "CREATE TABLE IF NOT EXISTS ")
    .replace(/^CREATE UNIQUE INDEX (?!IF NOT EXISTS)/i, "CREATE UNIQUE INDEX IF NOT EXISTS ")
    .replace(/^CREATE INDEX (?!IF NOT EXISTS)/i, "CREATE INDEX IF NOT EXISTS ");
}
