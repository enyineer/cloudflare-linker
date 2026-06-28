import { eq } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { appConfig } from "../db/schema.ts";

/** Non-secret Setup choices (e.g. which Cloudflare account to use when the token
 *  can see more than one). Kept in D1 for strong read-after-write and a single
 *  source of truth - KV is reserved for the encryption key only. */

const ACCOUNT_KEY = "selected_account_id";

export async function getSelectedAccount(env: Env): Promise<string | null> {
  try {
    const [row] = await getDb(env).select().from(appConfig).where(eq(appConfig.key, ACCOUNT_KEY)).limit(1);
    return row?.value.trim() || null;
  } catch {
    return null;
  }
}

export async function setSelectedAccount(env: Env, accountId: string): Promise<void> {
  const value = accountId.trim();
  await getDb(env)
    .insert(appConfig)
    .values({ key: ACCOUNT_KEY, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value } });
}

// This Worker's own script name, discovered at runtime (a Worker can't read its
// own name) and cached here. D1 survives redeploys, unlike a dashboard var, so
// the name is stable once detected - no manual configuration that breaks on deploy.
const WORKER_NAME_KEY = "worker_name";

export async function getStoredWorkerName(env: Env): Promise<string | null> {
  try {
    const [row] = await getDb(env).select().from(appConfig).where(eq(appConfig.key, WORKER_NAME_KEY)).limit(1);
    return row?.value.trim() || null;
  } catch {
    return null;
  }
}

export async function setStoredWorkerName(env: Env, name: string): Promise<void> {
  const value = name.trim();
  if (!value) return;
  try {
    await getDb(env)
      .insert(appConfig)
      .values({ key: WORKER_NAME_KEY, value })
      .onConflictDoUpdate({ target: appConfig.key, set: { value } });
  } catch {
    /* best-effort: a routing op shouldn't fail because we couldn't cache the name */
  }
}
