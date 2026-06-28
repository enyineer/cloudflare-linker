/** Pure D1/SQLite error classification (no Env/IO, so it's unit-testable). */

/**
 * True for a UNIQUE-constraint violation. drizzle-orm wraps the driver error in a
 * `DrizzleQueryError` ("Failed query: ...") and puts the original D1 error - which
 * carries "UNIQUE constraint failed" - in `.cause`, so we walk the cause chain
 * rather than only inspecting the top-level message.
 */
export function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; cur != null && depth < 5; depth++) {
    const message = cur instanceof Error ? cur.message : String(cur);
    if (/UNIQUE constraint failed/i.test(message)) return true;
    cur = cur instanceof Error ? cur.cause : undefined;
  }
  return false;
}
