/** Pure URL/string helpers + validation regexes, shared by the Worker and the
 *  contract (so the SPA bundles them too). No IO, no Env. */

export const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
export const PATH_RE = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@/%]*$/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercase a hostname and drop a trailing FQDN dot. */
export function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

/** Normalize a request path: ensure a leading "/", drop trailing slashes (root stays "/"). */
export function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  const p = pathname.replace(/\/+$/, "");
  if (p === "") return "/";
  return p.startsWith("/") ? p : `/${p}`;
}

/** Turn a name into a url-safe slug. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** True only for absolute http(s) URLs. */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
