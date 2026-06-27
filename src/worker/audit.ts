import { desc, lt } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { auditLog } from "../db/schema.ts";

/** Audit log writes/reads (IO). The pure summary builder lives in audit-summary.ts. */

export async function recordAudit(env: Env, actor: string, action: string, summary: string): Promise<void> {
  try {
    await getDb(env).insert(auditLog).values({ actor, action, summary });
  } catch {
    /* best-effort: auditing must never break the action it records */
  }
}

export async function listAudit(env: Env, opts: { limit: number; before?: number }) {
  const where = opts.before ? lt(auditLog.id, opts.before) : undefined;
  return getDb(env).select().from(auditLog).where(where).orderBy(desc(auditLog.id)).limit(opts.limit);
}
