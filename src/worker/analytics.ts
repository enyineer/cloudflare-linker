import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { getDb, type Db } from "../db/client.ts";
import { campaigns, clicks, domains } from "../db/schema.ts";
import type {
  Breakdown,
  CampaignStatsDto,
  ClickFilter,
  DomainStatsDto,
  FacetsDto,
  LinkStatsDto,
  OverviewDto,
} from "../shared/contract.ts";
import { FILTER_FIELDS, FILTER_NULL, NUMERIC_FILTER_FIELDS, filterNullLabel, type FilterField } from "../shared/types.ts";
import type { ResolvedRange } from "./analytics-range.ts";

/** Aggregate the click table for the dashboard and the per-link / -campaign /
 *  -domain detail views. Breakdowns share one { label, clicks } shape; every
 *  query is scoped to the date range (+ an optional entity filter), and each
 *  view also counts the immediately-preceding equal-length window for trends. */

function must(value: SQL | undefined): SQL {
  if (!value) throw new Error("empty SQL filter");
  return value;
}

/** When bots are excluded, restrict every query to human clicks. */
function botFilter(includeBots: boolean): SQL | undefined {
  return includeBots ? undefined : eq(clicks.isBot, false);
}

// Each filterable field -> its clicks column (the server-side whitelist; the zod
// enum is the first gate, this is the second - nothing else can reach SQL).
const FILTER_COLUMNS: Record<FilterField, SQLiteColumn> = {
  country: clicks.country,
  device: clicks.deviceCategory,
  browser: clicks.browserFamily,
  source: clicks.utmSource,
  referrer: clicks.refererOrigin,
  campaign: clicks.campaignId,
  region: clicks.region,
  medium: clicks.utmMedium,
  utmCampaign: clicks.utmCampaign,
  term: clicks.utmTerm,
  content: clicks.utmContent,
  hostname: clicks.hostname,
  path: clicks.path,
  redirectType: clicks.redirectType,
};
const NUMERIC = new Set<FilterField>(NUMERIC_FILTER_FIELDS);
const FACET_LIMIT = 25;

/** One field's predicate: OR across its values; the null sentinel becomes IS NULL. */
function fieldScope(f: ClickFilter): SQL | undefined {
  const col = FILTER_COLUMNS[f.field];
  const wantsNull = f.values.includes(FILTER_NULL);
  const concrete = f.values.filter((v) => v !== FILTER_NULL);
  const parts: SQL[] = [];
  if (NUMERIC.has(f.field)) {
    const nums = concrete.map(Number).filter((n) => Number.isInteger(n));
    if (nums.length === 1) parts.push(eq(col, nums[0]));
    else if (nums.length > 1) parts.push(inArray(col, nums));
  } else if (concrete.length === 1) {
    parts.push(eq(col, concrete[0]));
  } else if (concrete.length > 1) {
    parts.push(inArray(col, concrete));
  }
  if (wantsNull) parts.push(isNull(col));
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : or(...parts);
}

/** All active filters AND-ed together (each field is internally OR-ed). */
function filtersScope(filters?: ClickFilter[]): SQL | undefined {
  if (!filters?.length) return undefined;
  const scopes = filters.map(fieldScope).filter((s): s is SQL => s !== undefined);
  return scopes.length ? and(...scopes) : undefined;
}

type FacetScope = "overview" | "link" | "campaign" | "domain";

/** The entity predicate for a facets request (mirrors the get* entity scopes). */
async function facetEntityScope(db: Db, scope: FacetScope, id?: number): Promise<SQL | undefined> {
  if (scope === "link" && id != null) return eq(clicks.linkId, id);
  if (scope === "campaign" && id != null) return eq(clicks.campaignId, id);
  if (scope === "domain" && id != null) {
    const [d] = await db.select({ hostname: domains.hostname }).from(domains).where(eq(domains.id, id)).limit(1);
    return eq(clicks.hostname, d?.hostname ?? " ");
  }
  return undefined;
}

/** Top observed values for one field (value + friendly label + count). */
async function facetValues(
  db: Db,
  field: FilterField,
  where: SQL,
): Promise<{ value: string; label: string; clicks: number }[]> {
  if (field === "campaign") {
    const rows = await db
      .select({ id: clicks.campaignId, name: campaigns.name, clicks: count() })
      .from(clicks)
      .leftJoin(campaigns, eq(clicks.campaignId, campaigns.id))
      .where(where)
      .groupBy(clicks.campaignId)
      .orderBy(desc(count()))
      .limit(FACET_LIMIT);
    return rows.map((r) =>
      r.id == null
        ? { value: FILTER_NULL, label: filterNullLabel("campaign"), clicks: r.clicks }
        : { value: String(r.id), label: r.name ?? `Campaign #${r.id}`, clicks: r.clicks },
    );
  }
  const col = FILTER_COLUMNS[field];
  const rows = await db
    .select({ v: col, clicks: count() })
    .from(clicks)
    .where(where)
    .groupBy(col)
    .orderBy(desc(count()))
    .limit(FACET_LIMIT);
  return rows.map((r) =>
    r.v == null
      ? { value: FILTER_NULL, label: filterNullLabel(field), clicks: r.clicks }
      : { value: String(r.v), label: String(r.v), clicks: r.clicks },
  );
}

/** Value pick-lists for every filterable field, within the range + entity + bot
 *  scope (NOT the active filters, so the lists stay stable while assembling one). */
export async function getFacets(
  env: Env,
  input: { scope: FacetScope; id?: number; includeBots: boolean },
  range: ResolvedRange,
): Promise<FacetsDto> {
  const db = getDb(env);
  const entity = await facetEntityScope(db, input.scope, input.id);
  const where = currentWhere(range, and(entity, botFilter(input.includeBots)));
  const fields = await Promise.all(
    FILTER_FIELDS.map(async (field) => ({ field, values: await facetValues(db, field, where) })),
  );
  return { fields: fields.filter((f) => f.values.length > 0) };
}

function currentWhere(range: ResolvedRange, scope?: SQL): SQL {
  return must(and(gte(clicks.ts, range.fromDate), lte(clicks.ts, range.toDate), scope));
}

function previousWhere(range: ResolvedRange, scope?: SQL): SQL {
  const length = range.toDate.getTime() - range.fromDate.getTime();
  const to = new Date(range.fromDate.getTime() - 1);
  const from = new Date(to.getTime() - length);
  return must(and(gte(clicks.ts, from), lte(clicks.ts, to), scope));
}

const DAY = sql<string>`date(${clicks.ts}, 'unixepoch')`;

async function overTime(db: Db, where: SQL): Promise<{ date: string; clicks: number }[]> {
  return db.select({ date: DAY, clicks: count() }).from(clicks).where(where).groupBy(DAY).orderBy(DAY);
}

async function topBy(
  db: Db,
  column: SQLiteColumn,
  where: SQL,
  opts: { filterNull?: boolean; fallback?: string; limit?: number } = {},
): Promise<Breakdown> {
  const finalWhere = opts.filterNull ? and(where, isNotNull(column)) ?? where : where;
  const rows = await db
    .select({ label: column, clicks: count() })
    .from(clicks)
    .where(finalWhere)
    .groupBy(column)
    .orderBy(desc(count()))
    .limit(opts.limit ?? 10);
  const fallback = opts.fallback ?? "Unknown";
  return rows.map((r) => ({
    label: r.label == null ? fallback : String(r.label),
    clicks: r.clicks,
    value: r.label == null ? FILTER_NULL : String(r.label),
  }));
}

async function topLinks(db: Db, where: SQL): Promise<Breakdown> {
  const rows = await db
    .select({ hostname: clicks.hostname, path: clicks.path, clicks: count() })
    .from(clicks)
    .where(where)
    .groupBy(clicks.hostname, clicks.path)
    .orderBy(desc(count()))
    .limit(10);
  return rows.map((r) => ({ label: `${r.hostname}${r.path === "/" ? "" : r.path}`, clicks: r.clicks }));
}

async function byCampaign(db: Db, where: SQL): Promise<Breakdown> {
  const rows = await db
    .select({ id: clicks.campaignId, name: campaigns.name, clicks: count() })
    .from(clicks)
    .leftJoin(campaigns, eq(clicks.campaignId, campaigns.id))
    .where(where)
    .groupBy(clicks.campaignId)
    .orderBy(desc(count()))
    .limit(20);
  return rows.map((r) => ({
    label: r.name ?? "No campaign",
    clicks: r.clicks,
    value: r.id == null ? FILTER_NULL : String(r.id),
  }));
}

export async function getOverview(
  env: Env,
  range: ResolvedRange,
  includeBots: boolean,
  filters?: ClickFilter[],
): Promise<OverviewDto> {
  const db = getDb(env);
  const scope = and(botFilter(includeBots), filtersScope(filters));
  const where = currentWhere(range, scope);
  const [totalClicks, previousClicks, botClicks, series, campaignRanks, linkRanks, countries, sources, devices, referrers] =
    await Promise.all([
      db.$count(clicks, where),
      db.$count(clicks, previousWhere(range, scope)),
      db.$count(clicks, currentWhere(range, and(eq(clicks.isBot, true), filtersScope(filters)))),
      overTime(db, where),
      byCampaign(db, where),
      topLinks(db, where),
      topBy(db, clicks.country, where, { filterNull: true }),
      topBy(db, clicks.utmSource, where, { filterNull: true }),
      topBy(db, clicks.deviceCategory, where, {}),
      topBy(db, clicks.refererOrigin, where, { fallback: "Direct / none" }),
    ]);
  return {
    range: { from: range.from, to: range.to },
    totalClicks,
    previousClicks,
    botClicks,
    overTime: series,
    byCampaign: campaignRanks,
    topLinks: linkRanks,
    topCountries: countries,
    topSources: sources,
    byDevice: devices,
    topReferrers: referrers,
  };
}

export async function getLinkStats(
  env: Env,
  range: ResolvedRange,
  linkId: number,
  includeBots: boolean,
  filters?: ClickFilter[],
): Promise<LinkStatsDto> {
  const db = getDb(env);
  const scope = and(eq(clicks.linkId, linkId), botFilter(includeBots), filtersScope(filters));
  const where = currentWhere(range, scope);
  const [totalClicks, previousClicks, series, countries, sources, devices, browsers, referrers] = await Promise.all([
    db.$count(clicks, where),
    db.$count(clicks, previousWhere(range, scope)),
    overTime(db, where),
    topBy(db, clicks.country, where, { filterNull: true }),
    topBy(db, clicks.utmSource, where, { filterNull: true }),
    topBy(db, clicks.deviceCategory, where, {}),
    topBy(db, clicks.browserFamily, where, { fallback: "Unknown" }),
    topBy(db, clicks.refererOrigin, where, { fallback: "Direct / none" }),
  ]);
  return {
    range: { from: range.from, to: range.to },
    totalClicks,
    previousClicks,
    overTime: series,
    topCountries: countries,
    topSources: sources,
    byDevice: devices,
    byBrowser: browsers,
    topReferrers: referrers,
  };
}

export async function getCampaignStats(
  env: Env,
  range: ResolvedRange,
  campaignId: number,
  includeBots: boolean,
  filters?: ClickFilter[],
): Promise<CampaignStatsDto> {
  const db = getDb(env);
  const scope = and(eq(clicks.campaignId, campaignId), botFilter(includeBots), filtersScope(filters));
  const where = currentWhere(range, scope);
  const [totalClicks, previousClicks, series, links, sources, countries, devices] = await Promise.all([
    db.$count(clicks, where),
    db.$count(clicks, previousWhere(range, scope)),
    overTime(db, where),
    topLinks(db, where),
    topBy(db, clicks.utmSource, where, { filterNull: true }),
    topBy(db, clicks.country, where, { filterNull: true }),
    topBy(db, clicks.deviceCategory, where, {}),
  ]);
  return {
    range: { from: range.from, to: range.to },
    totalClicks,
    previousClicks,
    overTime: series,
    byLink: links,
    topSources: sources,
    topCountries: countries,
    byDevice: devices,
  };
}

export async function getDomainStats(
  env: Env,
  range: ResolvedRange,
  domainId: number,
  includeBots: boolean,
  filters?: ClickFilter[],
): Promise<DomainStatsDto> {
  const db = getDb(env);
  const [domain] = await db.select({ hostname: domains.hostname }).from(domains).where(eq(domains.id, domainId)).limit(1);
  // Clicks store the hostname (not domain id); a sentinel matches nothing if the domain is gone.
  const scope = and(eq(clicks.hostname, domain?.hostname ?? " "), botFilter(includeBots), filtersScope(filters));
  const where = currentWhere(range, scope);
  const [totalClicks, previousClicks, series, links, sources, countries, devices] = await Promise.all([
    db.$count(clicks, where),
    db.$count(clicks, previousWhere(range, scope)),
    overTime(db, where),
    topLinks(db, where),
    topBy(db, clicks.utmSource, where, { filterNull: true }),
    topBy(db, clicks.country, where, { filterNull: true }),
    topBy(db, clicks.deviceCategory, where, {}),
  ]);
  return {
    range: { from: range.from, to: range.to },
    totalClicks,
    previousClicks,
    overTime: series,
    byLink: links,
    topSources: sources,
    topCountries: countries,
    byDevice: devices,
  };
}
