import { and, eq, lt } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { clicks } from "../db/schema.ts";
import { getSettings } from "./settings.ts";

/** Delete bot clicks older than the configured retention window. Run on a cron so
 *  bot noise doesn't accumulate (human clicks are kept indefinitely). */
export async function purgeOldBotClicks(env: Env): Promise<void> {
  const { botRetentionDays } = await getSettings(env, true);
  const cutoff = new Date(Date.now() - botRetentionDays * 86_400_000);
  await getDb(env)
    .delete(clicks)
    .where(and(eq(clicks.isBot, true), lt(clicks.ts, cutoff)));
}
