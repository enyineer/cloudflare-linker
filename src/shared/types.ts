// Shared enums + value types used by BOTH the Worker (DB schema) and the SPA.

export const REDIRECT_TYPES = [301, 302, 307, 308] as const;
export type RedirectType = (typeof REDIRECT_TYPES)[number];

export const DOMAIN_KINDS = ["subdomain", "custom"] as const;
export type DomainKind = (typeof DOMAIN_KINDS)[number];

export const DOMAIN_STATUSES = ["active", "disabled", "pending"] as const;
export type DomainStatus = (typeof DOMAIN_STATUSES)[number];

// How this web address is wired on Cloudflare:
//  none  - not set up (no route yet)
//  whole - the whole hostname routes to the Worker (host/*); covers all paths
//  paths - only specific link paths route to the Worker (coexists with an
//          existing site); a route is managed per link
export const ROUTING_MODES = ["none", "whole", "paths"] as const;
export type RoutingMode = (typeof ROUTING_MODES)[number];

export const USER_ROLES = ["admin", "editor", "viewer"] as const;
export type Role = (typeof USER_ROLES)[number];

export const DEVICE_CATEGORIES = ["mobile", "tablet", "desktop", "bot", "unknown"] as const;
export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number];

/** One appended query-string parameter, e.g. { key: "utm_source", value: "newsletter" }. */
export interface QueryParam {
  key: string;
  value: string;
}

// ── analytics filters ───────────────────────────────────────────────────────────
// Fields a click can be filtered by. Each maps to a clicks column server-side
// (see worker/analytics.ts FIELD_COL). isBot is intentionally NOT here - it's
// owned by the "Include bots" toggle.
export const FILTER_FIELDS = [
  "country",
  "device",
  "browser",
  "source",
  "referrer",
  "campaign",
  "region",
  "medium",
  "utmCampaign",
  "term",
  "content",
  "hostname",
  "path",
  "redirectType",
] as const;
export type FilterField = (typeof FILTER_FIELDS)[number];

/** Plain-English field labels for the UI. */
export const FILTER_FIELD_LABELS: Record<FilterField, string> = {
  country: "Country",
  device: "Device",
  browser: "Browser",
  source: "Source",
  referrer: "Referrer",
  campaign: "Campaign",
  region: "Region",
  medium: "Medium",
  utmCampaign: "Campaign tag",
  term: "Term",
  content: "Content",
  hostname: "Web address",
  path: "Path",
  redirectType: "Redirect type",
};

// The fields surfaced first in the "Add filter" picker; the rest go under "More".
export const COMMON_FILTER_FIELDS: readonly FilterField[] = [
  "country",
  "device",
  "browser",
  "source",
  "referrer",
  "campaign",
];

/** Friendly label for the "no value" option of a field (a NULL column). */
export function filterNullLabel(field: FilterField): string {
  if (field === "referrer") return "Direct / none";
  if (field === "campaign") return "No campaign";
  if (field === "country" || field === "region" || field === "browser") return "Unknown";
  return "Not set";
}

/** Wire sentinel for "this field has no value" (maps to IS NULL server-side). */
export const FILTER_NULL = "__none__";

/** Numeric filter fields whose wire value is a stringified number. */
export const NUMERIC_FILTER_FIELDS: readonly FilterField[] = ["campaign", "redirectType"];
