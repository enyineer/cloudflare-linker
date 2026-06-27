/** Pure analysis of Cloudflare API payloads (no fetch, no Env) - unit-testable. */

export interface CfZone {
  id: string;
  name: string;
  status: string;
}
export interface CfRoute {
  pattern: string;
  script: string | null;
}
export interface CfWorkerDomain {
  hostname: string;
  service: string;
  zone_id?: string;
  cert_id?: string | null;
}

export interface RoutingResult {
  ok: boolean;
  routes: string[];
  message: string;
}
export interface CustomDomainResult {
  hostname: string;
  zoneOnAccount: boolean;
  attached: boolean;
  certProvisioned: boolean;
  message: string;
}

/** The account zone a hostname belongs to (longest matching suffix), or null. */
export function zoneForHostname(hostname: string, zones: CfZone[]): CfZone | null {
  const h = hostname.toLowerCase();
  let best: CfZone | null = null;
  for (const zone of zones) {
    const name = zone.name.toLowerCase();
    if (h === name || h.endsWith(`.${name}`)) {
      if (!best || zone.name.length > best.name.length) best = zone;
    }
  }
  return best;
}

/** A subdomain wildcard lives in the HOST part (e.g. `*.go.example.com/*`),
 *  not the trailing path `/*` that every route pattern has. */
export function isWildcard(pattern: string): boolean {
  const host = pattern.split("/")[0] ?? pattern;
  return host.includes("*");
}

/** Does a wildcard Worker route on this zone point at our script? */
export function analyzeRoutes(routes: CfRoute[], workerName: string): RoutingResult {
  const ours = routes.filter((r) => r.script === workerName);
  const patterns = ours.map((r) => r.pattern);
  const wildcards = ours.filter((r) => isWildcard(r.pattern));
  if (wildcards.length > 0) {
    return { ok: true, routes: patterns, message: `Subdomains route to this Worker via ${wildcards.map((r) => r.pattern).join(", ")}.` };
  }
  if (ours.length > 0) {
    return {
      ok: false,
      routes: patterns,
      message: "Routes point to this Worker, but none is a wildcard - new subdomains will not resolve. Add a route like *.<your-zone>/*.",
    };
  }
  return {
    ok: false,
    routes: patterns,
    message: "No Worker route on this zone points to this app, so subdomains will not resolve. Add a wildcard route like *.<your-zone>/*.",
  };
}

/** The route pattern that sends a single hostname (any path) to a Worker. */
export function hostnameRoutePattern(hostname: string): string {
  return `${hostname}/*`;
}

/** The route pattern for one specific link path (e.g. example.com/promo), so the
 *  Worker handles only that path and the rest of the host stays on its origin. */
export function linkRoutePattern(hostname: string, path: string): string {
  return `${hostname}${path.startsWith("/") ? path : `/${path}`}`;
}

/** The wildcard route pattern that sends every subdomain of a zone to a Worker. */
export function subdomainRoutePattern(zoneName: string): string {
  return hostnameRoutePattern(`*.${zoneName}`);
}

export function isApexHost(hostname: string, zoneName: string): boolean {
  return hostname.toLowerCase() === zoneName.toLowerCase();
}

export function isWildcardHost(hostname: string): boolean {
  return hostname.startsWith("*.");
}

/** Find a route matching an exact pattern (any script). */
export function findRouteByPattern(routes: CfRoute[], pattern: string): CfRoute | undefined {
  return routes.find((r) => r.pattern === pattern);
}

/** Find the zone-wide wildcard route (any script). */
export function findSubdomainRoute(routes: CfRoute[], zoneName: string): CfRoute | undefined {
  return findRouteByPattern(routes, subdomainRoutePattern(zoneName));
}

export type HostnameState = "connected" | "covered" | "needs_setup";

/** Is a hostname already served by this Worker - directly, or (for a plain
 *  subdomain) via the zone-wide wildcard route? */
export function classifyHostname(
  hostname: string,
  zoneName: string,
  routes: CfRoute[],
  workerName: string,
): HostnameState {
  const own = findRouteByPattern(routes, hostnameRoutePattern(hostname));
  if (own?.script === workerName) return "connected";
  if (!isApexHost(hostname, zoneName) && !isWildcardHost(hostname)) {
    const wildcard = findSubdomainRoute(routes, zoneName);
    if (wildcard?.script === workerName) return "covered";
  }
  return "needs_setup";
}

/** Status of a single custom domain against the account's zones + worker domains. */
export function analyzeCustomDomain(
  hostname: string,
  zones: CfZone[],
  domains: CfWorkerDomain[],
  workerName: string,
): CustomDomainResult {
  const zoneOnAccount = zoneForHostname(hostname, zones) !== null;
  const entry = domains.find(
    (d) => d.hostname.toLowerCase() === hostname.toLowerCase() && d.service === workerName,
  );
  const attached = entry !== undefined;
  const certProvisioned = Boolean(entry?.cert_id);

  let message: string;
  if (!zoneOnAccount) message = "This domain's zone is not on your Cloudflare account. Add the zone there first.";
  else if (!attached) message = "Zone found, but the domain is not attached to this Worker yet.";
  else if (!certProvisioned) message = "Attached - the TLS certificate is still being provisioned.";
  else message = "Attached and serving with a certificate.";

  return { hostname, zoneOnAccount, attached, certProvisioned, message };
}
