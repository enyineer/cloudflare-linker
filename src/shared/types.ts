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
