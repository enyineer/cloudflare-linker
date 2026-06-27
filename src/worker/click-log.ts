import { getDb } from "../db/client.ts";
import { clicks, type NewClick } from "../db/schema.ts";

/** Insert one click. Never throws - click logging must not break the redirect. */
export async function insertClick(env: Env, record: NewClick): Promise<void> {
  try {
    await getDb(env).insert(clicks).values(record);
  } catch (err) {
    console.error("click log failed:", err instanceof Error ? err.message : err);
  }
}
