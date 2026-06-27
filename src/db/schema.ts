import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import {
  DEVICE_CATEGORIES,
  DOMAIN_KINDS,
  DOMAIN_STATUSES,
  ROUTING_MODES,
  USER_ROLES,
  type QueryParam,
  type RedirectType,
} from "../shared/types.ts";

/** Unix-seconds timestamp: INTEGER in SQLite, JS `Date` in app code, DB-side default. */
const createdAt = () =>
  integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`);

// ── domains ──────────────────────────────────────────────────────────────────
// A redirect hostname. Subdomains of the app zone work immediately
// (kind "subdomain", status "active"); external root domains (kind "custom")
// start "pending" until attached. The app's OWN admin host is NOT stored here.
export const domains = sqliteTable("domains", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  hostname: text("hostname").notNull().unique(),
  kind: text("kind", { enum: DOMAIN_KINDS }).notNull().default("subdomain"),
  status: text("status", { enum: DOMAIN_STATUSES }).notNull().default("active"),
  // How it is wired on Cloudflare (set when the operator runs setup).
  routingMode: text("routing_mode", { enum: ROUTING_MODES }).notNull().default("none"),
  createdAt: createdAt(),
});

// ── campaigns ────────────────────────────────────────────────────────────────
// Groups links and supplies default UTM query params (overridable per link).
export const campaigns = sqliteTable("campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  notes: text("notes"),
  createdAt: createdAt(),
});

// ── links ────────────────────────────────────────────────────────────────────
// One (hostname, path) -> target redirect. path "/" is the domain's default link
// and also acts as the host's catch-all for unmatched paths.
export const links = sqliteTable(
  "links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    domainId: integer("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    targetUrl: text("target_url").notNull(),
    redirectType: integer("redirect_type").$type<RedirectType>().notNull().default(301),
    // Appended to the target on redirect. Campaign UTM defaults pre-fill these;
    // on a key conflict the link's own value wins.
    queryParams: text("query_params", { mode: "json" })
      .$type<QueryParam[]>()
      .notNull()
      .default(sql`'[]'`),
    campaignId: integer("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    // Optional: where to send visitors if this link is turned OFF (blank = clean 404).
    fallbackUrl: text("fallback_url"),
    // When true, query params on the incoming request are copied onto the target
    // (link/campaign-configured params still win on conflict).
    forwardQuery: integer("forward_query", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("links_domain_path_unique").on(t.domainId, t.path),
    index("links_campaign_idx").on(t.campaignId),
    check("links_redirect_type_valid", sql`${t.redirectType} in (301, 302, 307, 308)`),
  ],
);

// ── clicks ───────────────────────────────────────────────────────────────────
// One anonymous, GDPR-safe row per redirect. NO IP, NO full UA, NO cookies.
// hostname/path/redirect_type are denormalized so a row stays meaningful for
// aggregate reporting even after its link is deleted (the FK then nulls out).
export const clicks = sqliteTable(
  "clicks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    linkId: integer("link_id").references(() => links.id, { onDelete: "set null" }),
    campaignId: integer("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    ts: integer("ts", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    hostname: text("hostname").notNull(),
    path: text("path").notNull(),
    country: text("country"), // ISO-3166 alpha-2 from request.cf, nullable
    region: text("region"), // coarse region, nullable
    deviceCategory: text("device_category", { enum: DEVICE_CATEGORIES }).notNull().default("unknown"),
    browserFamily: text("browser_family"), // coarse family only; full UA is discarded
    refererOrigin: text("referer_origin"), // origin only, never the full URL
    // Inbound attribution: ONLY the 5 standard utm_* keys are stored (GDPR-safe);
    // any other incoming params are forwarded to the target but never stored here.
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    redirectType: integer("redirect_type").$type<RedirectType>().notNull(),
  },
  (t) => [
    index("clicks_ts_idx").on(t.ts),
    index("clicks_link_idx").on(t.linkId),
    index("clicks_campaign_idx").on(t.campaignId),
  ],
);

// ── app config ───────────────────────────────────────────────────────────────
// Non-secret key/value settings managed by the app (e.g. the chosen Cloudflare
// account when the token can see several). Strong read-after-write, unlike KV.
export const appConfig = sqliteTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date()),
});

// ── secrets ──────────────────────────────────────────────────────────────────
// App-managed secrets (e.g. the operator-pasted Cloudflare API token), stored
// AES-GCM-encrypted at rest. The encryption key lives in KV, not here, so a
// D1-only leak does not reveal plaintext.
export const secrets = sqliteTable("secrets", {
  name: text("name").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date()),
});

// ── users ────────────────────────────────────────────────────────────────────
// Identity comes from Cloudflare Access (verified email); this maps email -> role.
// BOOTSTRAP_ADMIN_EMAIL is upserted as the first admin on first authed request.
export const users = sqliteTable("users", {
  email: text("email").primaryKey(),
  role: text("role", { enum: USER_ROLES }).notNull().default("viewer"),
  createdAt: createdAt(),
});

// Inferred row types for the API + worker.
export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type Link = typeof links.$inferSelect;
export type NewLink = typeof links.$inferInsert;
export type Click = typeof clicks.$inferSelect;
export type NewClick = typeof clicks.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
