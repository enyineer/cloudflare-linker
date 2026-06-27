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
