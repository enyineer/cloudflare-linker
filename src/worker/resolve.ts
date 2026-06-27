import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { campaigns, domains, links, type Campaign, type Link } from "../db/schema.ts";
import type { QueryParam, RedirectType } from "../shared/types.ts";
import { decideRedirect } from "./redirect.ts";

type CampaignUtm = Pick<Campaign, "utmSource" | "utmMedium" | "utmCampaign">;

/**
 * The resolved link configuration for a (hostname, path) - NOT the final URL.
 * The final target is built per-request (so it can fold in forwarded incoming
 * params), which keeps this value cacheable.
 */
export type Resolution =
  | {
      kind: "redirect";
      status: RedirectType;
      linkId: number;
      campaignId: number | null;
      targetUrl: string;
      queryParams: QueryParam[];
      forwardQuery: boolean;
      campaign: CampaignUtm | null;
    }
  | { kind: "fallback"; status: 302; linkId: number; campaignId: number | null; url: string };

// Tiny in-isolate cache for hot links. Hits only, short TTL, so admin edits go
// live almost immediately; misses are never cached (new links work at once).
const CACHE_TTL_MS = 5_000;
const CACHE_MAX_ENTRIES = 1_000;
const resolveCache = new Map<string, { value: Resolution; expires: number }>();

function cacheKey(hostname: string, path: string): string {
  return `${hostname}\n${path}`;
}

function readCache(key: string): Resolution | undefined {
  const entry = resolveCache.get(key);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    resolveCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCache(key: string, value: Resolution): void {
  if (resolveCache.size >= CACHE_MAX_ENTRIES) resolveCache.clear();
  resolveCache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

/** Resolve (hostname, path) to a link config or null (clean 404). */
export async function resolveRedirect(env: Env, hostname: string, path: string): Promise<Resolution | null> {
  const key = cacheKey(hostname, path);
  const cached = readCache(key);
  if (cached) return cached;

  const db = getDb(env);

  const domainRows = await db
    .select()
    .from(domains)
    .where(and(eq(domains.hostname, hostname), eq(domains.status, "active")))
    .limit(1);
  const domain = domainRows[0];
  if (!domain) return null;

  const candidatePaths = path === "/" ? ["/"] : [path, "/"];
  const rows = await db
    .select()
    .from(links)
    .where(and(eq(links.domainId, domain.id), inArray(links.path, candidatePaths)));

  const exactLink = rows.find((r) => r.path === path);
  const rootLink = rows.find((r) => r.path === "/");

  const decision = decideRedirect<Link>(path, exactLink, rootLink);
  if (decision.action === "notfound") return null;

  const link = decision.link;
  let resolved: Resolution;
  if (decision.action === "fallback") {
    resolved = { kind: "fallback", status: 302, linkId: link.id, campaignId: link.campaignId, url: decision.url };
  } else {
    resolved = {
      kind: "redirect",
      status: link.redirectType,
      linkId: link.id,
      campaignId: link.campaignId,
      targetUrl: link.targetUrl,
      queryParams: link.queryParams,
      forwardQuery: link.forwardQuery,
      campaign: await loadCampaign(env, link.campaignId),
    };
  }

  writeCache(key, resolved);
  return resolved;
}

async function loadCampaign(env: Env, campaignId: number | null): Promise<CampaignUtm | null> {
  if (campaignId == null) return null;
  const rows = await getDb(env)
    .select({ utmSource: campaigns.utmSource, utmMedium: campaigns.utmMedium, utmCampaign: campaigns.utmCampaign })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  return rows[0] ?? null;
}
