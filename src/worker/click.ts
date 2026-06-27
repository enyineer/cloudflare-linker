import type { NewClick } from "../db/schema.ts";
import type { DeviceCategory, RedirectType } from "../shared/types.ts";

/**
 * GDPR-safe click analytics (pure derivations).
 *
 * We derive ONLY a coarse device category + browser family from the User-Agent
 * (then discard the UA), a country/region from request.cf, and the referer's
 * ORIGIN. No IP, no full UA, no cookies, no per-person identifier is ever stored.
 */

/** Coarse device class. Intentionally lossy - cannot single out a person. */
export function deviceCategory(ua: string | null): DeviceCategory {
  if (!ua) return "unknown";
  const s = ua.toLowerCase();
  if (/bot|crawler|spider|crawling|facebookexternalhit|slurp|bingpreview|headless|monitoring/.test(s)) {
    return "bot";
  }
  if (/ipad|tablet|playbook|silk|kindle|(android(?!.*mobi))/.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobi|windows phone|blackberry|bb10|opera mini|iemobile/.test(s)) {
    return "mobile";
  }
  return "desktop";
}

/** Coarse browser family - no version, so it carries no fingerprinting detail. */
export function browserFamily(ua: string | null): string | null {
  if (!ua) return null;
  if (/Edg(e|A|iOS)?\//.test(ua)) return "Edge";
  if (/OPR\/|Opera|Opera Mini/.test(ua)) return "Opera";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/Firefox\/|FxiOS\//.test(ua)) return "Firefox";
  if (/CriOS\/|Chrome\//.test(ua)) return "Chrome";
  if (/Version\/.*Safari\//.test(ua)) return "Safari";
  if (/bot|crawler|spider/i.test(ua)) return "Bot";
  return "Other";
}

/** Reduce a referer to its origin (scheme + host), or null. Never the full URL. */
export function refererOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const origin = new URL(referer).origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

export interface Utm {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
}

const UTM_MAX_LEN = 200;

/** Extract ONLY the five standard utm_* keys from an inbound request. Any other
 *  incoming params are never stored (they may be forwarded to the target, but
 *  storing arbitrary params could capture identifiers - GDPR-unsafe). */
export function extractUtm(params: URLSearchParams): Utm {
  const get = (key: string): string | null => {
    const raw = params.get(key);
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed === "" ? null : trimmed.slice(0, UTM_MAX_LEN);
  };
  return {
    utmSource: get("utm_source"),
    utmMedium: get("utm_medium"),
    utmCampaign: get("utm_campaign"),
    utmTerm: get("utm_term"),
    utmContent: get("utm_content"),
  };
}

export interface ClickInput {
  linkId: number;
  campaignId: number | null;
  hostname: string;
  path: string;
  redirectType: RedirectType;
  userAgent: string | null;
  referer: string | null;
  country: string | null;
  region: string | null;
  utm: Utm;
}

/** Build the anonymous click row. Pure, so the "no PII" guarantee is testable. */
export function buildClickRecord(input: ClickInput): NewClick {
  return {
    linkId: input.linkId,
    campaignId: input.campaignId,
    hostname: input.hostname,
    path: input.path,
    country: input.country,
    region: input.region,
    deviceCategory: deviceCategory(input.userAgent),
    browserFamily: browserFamily(input.userAgent),
    refererOrigin: refererOrigin(input.referer),
    utmSource: input.utm.utmSource,
    utmMedium: input.utm.utmMedium,
    utmCampaign: input.utm.utmCampaign,
    utmTerm: input.utm.utmTerm,
    utmContent: input.utm.utmContent,
    redirectType: input.redirectType,
  };
}
