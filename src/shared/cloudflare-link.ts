/** Build a Cloudflare "create API token" deep link with our scopes pre-selected.
 *  Pure - shared with the SPA. See:
 *  https://developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/ */

export interface TokenPerm {
  key: string;
  type: "read" | "edit";
}

/** Read for diagnostics + edit for setting up subdomains (DNS records + Worker
 *  routes). The DNS key is `dns` and the write level is `edit` (verified). */
export const MANAGE_TOKEN_PERMS: TokenPerm[] = [
  { key: "zone", type: "read" },
  { key: "workers_routes", type: "edit" },
  { key: "dns", type: "edit" },
  { key: "workers_scripts", type: "read" },
];

export function cloudflareTokenUrl(perms: TokenPerm[], name: string): string {
  const params = new URLSearchParams({
    permissionGroupKeys: JSON.stringify(perms),
    accountId: "*",
    zoneId: "all",
    name,
  });
  return `https://dash.cloudflare.com/profile/api-tokens?${params.toString()}`;
}

/** Dashboard deep link to the "Add a site" wizard (`:account` auto-resolves).
 *  Cloudflare does not support prefilling the domain, so tell the user the apex. */
export const CLOUDFLARE_ADD_SITE_URL = "https://dash.cloudflare.com/?to=/:account/add-site";

// Country code second levels where the registrable domain has 3 labels (e.g. co.uk).
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "edu", "ac", "mil", "sch", "gob", "go", "ne", "or", "govt"]);

/** Best-effort registrable apex of a hostname (the zone a user must add to
 *  Cloudflare). e.g. go.example.com -> example.com, x.example.co.uk -> example.co.uk. */
export function registrableDomain(hostname: string): string {
  const labels = hostname.replace(/^\*\./, "").toLowerCase().split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const secondLevel = labels[labels.length - 2];
  const take = secondLevel && SECOND_LEVEL.has(secondLevel) ? 3 : 2;
  return labels.slice(-take).join(".");
}
