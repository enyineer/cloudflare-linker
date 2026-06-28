import { inArray } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { appConfig } from "../db/schema.ts";

/**
 * App-wide, non-secret settings (analytics filtering + bot handling), stored as
 * key/value rows in `app_config`. Read on the redirect hot path, so values are
 * cached in-isolate for a short TTL; admin writes bust the cache immediately.
 */

export interface AppSettings {
  /** Hide bot/scanner clicks from analytics by default. */
  analyticsExcludeBots: boolean;
  /** 404 (no log, no redirect) catch-all hits to obvious scanner/probe paths. */
  blockScannerPaths: boolean;
  /** Don't store bot clicks at all (vs. store-and-hide). */
  dropBotClicks: boolean;
  /** Treat known hosting/datacenter ASNs as bots (false-positive prone; corroborated). */
  flagDatacenterTraffic: boolean;
  /** Trust request.cf.botManagement (only set this if you have paid Bot Management). */
  botManagementEnabled: boolean;
  /** Log catch-all hits to unconfigured (non-scanner) paths. */
  logUnmatchedPaths: boolean;
  /** Cloudflare bot score (1 bot .. 99 human) at/below which a click counts as a bot. */
  botScoreThreshold: number;
  /** Days to keep bot clicks before the scheduled purge removes them. */
  botRetentionDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  analyticsExcludeBots: true,
  blockScannerPaths: true,
  dropBotClicks: false,
  flagDatacenterTraffic: false,
  botManagementEnabled: false,
  logUnmatchedPaths: true,
  botScoreThreshold: 30,
  botRetentionDays: 90,
};

// app_config key for each setting.
const KEYS: Record<keyof AppSettings, string> = {
  analyticsExcludeBots: "analytics_exclude_bots",
  blockScannerPaths: "block_scanner_paths",
  dropBotClicks: "drop_bot_clicks",
  flagDatacenterTraffic: "flag_datacenter_traffic",
  botManagementEnabled: "bot_management_enabled",
  logUnmatchedPaths: "log_unmatched_paths",
  botScoreThreshold: "bot_score_threshold",
  botRetentionDays: "bot_retention_days",
};

const CACHE_TTL_MS = 30_000;
let cache: { value: AppSettings; expires: number } | null = null;

function parse(rows: { key: string; value: string }[]): AppSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const bool = (key: string, dflt: boolean): boolean => {
    const v = map.get(key);
    return v == null ? dflt : v === "true";
  };
  const num = (key: string, dflt: number, min: number, max: number): number => {
    const v = map.get(key);
    const n = v == null ? Number.NaN : Number.parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
  };
  return {
    analyticsExcludeBots: bool(KEYS.analyticsExcludeBots, DEFAULT_SETTINGS.analyticsExcludeBots),
    blockScannerPaths: bool(KEYS.blockScannerPaths, DEFAULT_SETTINGS.blockScannerPaths),
    dropBotClicks: bool(KEYS.dropBotClicks, DEFAULT_SETTINGS.dropBotClicks),
    flagDatacenterTraffic: bool(KEYS.flagDatacenterTraffic, DEFAULT_SETTINGS.flagDatacenterTraffic),
    botManagementEnabled: bool(KEYS.botManagementEnabled, DEFAULT_SETTINGS.botManagementEnabled),
    logUnmatchedPaths: bool(KEYS.logUnmatchedPaths, DEFAULT_SETTINGS.logUnmatchedPaths),
    botScoreThreshold: num(KEYS.botScoreThreshold, DEFAULT_SETTINGS.botScoreThreshold, 1, 99),
    botRetentionDays: num(KEYS.botRetentionDays, DEFAULT_SETTINGS.botRetentionDays, 1, 3650),
  };
}

/** Current settings (defaults if the table is empty / unreadable). Cached briefly. */
export async function getSettings(env: Env, fresh = false): Promise<AppSettings> {
  if (!fresh && cache && cache.expires > Date.now()) return cache.value;
  let value = DEFAULT_SETTINGS;
  try {
    const rows = await getDb(env)
      .select()
      .from(appConfig)
      .where(inArray(appConfig.key, Object.values(KEYS)));
    value = parse(rows);
  } catch {
    /* table missing / pre-migration -> safe defaults */
  }
  cache = { value, expires: Date.now() + CACHE_TTL_MS };
  return value;
}

/** Upsert the provided settings keys and return the full, fresh settings. Admin-only. */
export async function updateSettings(env: Env, patch: Partial<AppSettings>): Promise<AppSettings> {
  const db = getDb(env);
  for (const key of Object.keys(patch) as (keyof AppSettings)[]) {
    const v = patch[key];
    if (v === undefined) continue;
    const value = String(v);
    await db
      .insert(appConfig)
      .values({ key: KEYS[key], value })
      .onConflictDoUpdate({ target: appConfig.key, set: { value } });
  }
  cache = null;
  return getSettings(env, true);
}
