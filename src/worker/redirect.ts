import type { Campaign } from "../db/schema.ts";
import type { QueryParam } from "../shared/types.ts";

/** Pure redirect-decision + target-building logic (no DB, no Env) - unit-testable. */

interface DecidableLink {
  path: string;
  enabled: boolean;
  fallbackUrl: string | null;
}

export type RedirectDecision<T extends DecidableLink> =
  | { action: "redirect"; link: T }
  | { action: "fallback"; link: T; url: string }
  | { action: "notfound" };

/**
 * Decide how a request resolves, given the exact-path link and the host's "/"
 * default link (if any). Approved model:
 *   - exact enabled link             -> redirect to it
 *   - exact disabled link + fallback -> redirect to its fallback_url
 *   - otherwise (unknown path, or disabled link with no fallback)
 *     -> the "/" default link acts as the host catch-all (if enabled)
 *   - nothing usable                 -> not found (clean 404)
 */
export function decideRedirect<T extends DecidableLink>(
  requestPath: string,
  exactLink: T | undefined,
  rootLink: T | undefined,
): RedirectDecision<T> {
  if (exactLink) {
    if (exactLink.enabled) return { action: "redirect", link: exactLink };
    if (exactLink.fallbackUrl) return { action: "fallback", link: exactLink, url: exactLink.fallbackUrl };
    // disabled with no fallback -> fall through to the catch-all below
  }

  if (rootLink && rootLink.enabled && rootLink.path !== requestPath) {
    return { action: "redirect", link: rootLink };
  }

  return { action: "notfound" };
}

type CampaignUtm = Pick<Campaign, "utmSource" | "utmMedium" | "utmCampaign">;

/**
 * Build the final redirect target. Precedence (low -> high, later overrides):
 *   target URL's own query  <  forwarded incoming params  <  campaign UTM defaults
 *   <  the link's own configured params.
 * So the operator's configuration always wins; forwarded params only fill keys
 * that aren't configured. `incomingParams` is empty when forwarding is off.
 * Returns null if the stored target URL is invalid (misconfigured link).
 */
export function buildTarget(
  targetUrl: string,
  linkParams: QueryParam[],
  campaign: CampaignUtm | null,
  incomingParams: QueryParam[] = [],
): string | null {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return null;
  }

  for (const param of incomingParams) {
    if (param.key) url.searchParams.set(param.key, param.value);
  }
  if (campaign) {
    if (campaign.utmSource) url.searchParams.set("utm_source", campaign.utmSource);
    if (campaign.utmMedium) url.searchParams.set("utm_medium", campaign.utmMedium);
    if (campaign.utmCampaign) url.searchParams.set("utm_campaign", campaign.utmCampaign);
  }
  for (const param of linkParams) {
    if (param.key) url.searchParams.set(param.key, param.value);
  }

  return url.toString();
}

/** Flatten a URLSearchParams into key/value pairs (for forwarding). */
export function paramsFromSearch(params: URLSearchParams): QueryParam[] {
  const out: QueryParam[] = [];
  params.forEach((value, key) => out.push({ key, value }));
  return out;
}
