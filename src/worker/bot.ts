import { DATACENTER_ASNS } from "./datacenter-asns.generated.ts";

/**
 * Bot / scanner heuristics (pure, unit-testable).
 *
 * Cloudflare gives a FREE-plan Worker no reliable bot verdict: request.cf.botManagement
 * (score, verifiedBot, JA3/JA4) is an Enterprise Bot Management feature and is absent
 * (or a meaningless placeholder) on free. So we classify from the User-Agent + request
 * signals. The CF bot score is used only when an admin confirms Bot Management is on,
 * and only as a POSITIVE signal (never to declare a request "human").
 *
 * Bias: prefer false-negatives (let a bot slip) over false-positives (drop a human),
 * so analytics stays honest.
 */

// Automated-client / crawler / scanner User-Agent markers. Short, collision-prone
// tokens (bot, perl, ruby) are anchored with a delimiter/end lookahead so real
// device/product names that merely contain them (e.g. Android "CUBOT") don't match.
const BOT_UA_RE =
  /bot(?=[\s/);.,\-]|$)|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|monitor|curl|wget|python-requests|python-urllib|go-http-client|okhttp|axios|node-fetch|libwww|java\/|jakarta|perl(?=[\s/);.,\-]|$)|ruby(?=[\s/);.,\-]|$)|scrapy|masscan|zgrab|nikto|nmap|censys|wpscan|sqlmap|nuclei|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|gptbot|claudebot|ccbot|dataforseo|httrack|harvest/i;

// Mainstream browser engine markers - used (with an Accept-Language header) to tell a
// real human browser apart from datacenter automation that spoofs a browser UA.
const BROWSER_UA_RE = /mozilla\/.*(chrome|crios|safari|firefox|fxios|edg|opr|samsungbrowser|gecko)/i;

// Malicious probe paths + crawler noise that should never be a real short link.
const SCANNER_NAME_RE =
  /(^|\/)(wp-login\.php|wp-admin|wp-includes|wp-content|xmlrpc\.php|administrator|admin\.php|phpmyadmin|pma|mysql|cgi-bin|vendor|owa|autodiscover|boaform|hnap1|eval-stdin\.php|config\.json|credentials)(\/|$|\.)/i;
const SCANNER_EXT_RE = /\.(env|git|sql|bak|old|backup|swp|tar|gz|tgz|zip|rar|ini|conf|cfg|pem|key|log|dump|asp|aspx|jsp)(\.[a-z0-9]+)?$/i;
const NOISE_PATH_RE = /^\/(favicon\.ico|robots\.txt|sitemap\.xml|ads\.txt|security\.txt|browserconfig\.xml|apple-touch-icon[\w-]*\.png)$/i;

/**
 * Does this path look like a vulnerability scan or non-content crawler noise rather
 * than a real short link? Used ONLY to suppress the host catch-all for unconfigured
 * paths - an explicitly created link at any path always still works (and is not
 * flagged; see how the worker only treats this as a bot signal for catch-all hits).
 */
export function isScannerPath(path: string): boolean {
  const p = path.toLowerCase();
  if (p === "/") return false;
  if (p.startsWith("/.well-known/acme-challenge/")) return false; // TLS cert validation only
  // Everything else under /.well-known (security.txt, etc.) on a redirect host is a
  // scanner probe, and is caught by the dotfile rule below.
  if (/\/\.[a-z0-9]/.test(p)) return true; // dotfile segments: /.env, /.git/config, /.well-known/*
  return SCANNER_NAME_RE.test(p) || SCANNER_EXT_RE.test(p) || NOISE_PATH_RE.test(p);
}

/** Is this a known hosting/cloud/colo ASN (from the maintained, vendored list)? */
export function isHostingAsn(asn: number): boolean {
  return DATACENTER_ASNS.has(asn);
}

/** A real browser sends both a browser-engine UA and an Accept-Language header.
 *  Datacenter automation that spoofs a browser UA usually omits Accept-Language. */
export function looksLikeBrowser(userAgent: string | null, acceptLanguage: string | null): boolean {
  if (!acceptLanguage || !userAgent) return false;
  return BROWSER_UA_RE.test(userAgent);
}

export interface BotSignals {
  userAgent: string | null;
  /** request.cf.botManagement - present only with paid Bot Management; absent on free. */
  botManagement?: { score?: number; verifiedBot?: boolean } | null;
  /** request.cf.asn - the network's Autonomous System Number. */
  asn?: number | null;
  /** Whether the request looks like a real human browser (see looksLikeBrowser). */
  browserLike?: boolean;
  /** Whether the requested path matched isScannerPath() AND was unconfigured (catch-all). */
  scannerProbe?: boolean;
}

export interface BotOptions {
  /** Cloudflare bot score (1 = bot ... 99 = human) at/below which a click counts as a bot. */
  botScoreThreshold: number;
  /** Treat known hosting/datacenter ASNs as bots (off by default; corroborated below). */
  flagDatacenterTraffic: boolean;
  /** Trust request.cf.botManagement (admin confirms a paid Bot Management plan). */
  botManagementEnabled: boolean;
}

/** Decide whether a click is from a bot. Positive signals only - we never use
 *  Cloudflare's score to assert "human", since on free it may be a placeholder. */
export function classifyBot(signals: BotSignals, opts: BotOptions): boolean {
  // Only trust Cloudflare's verdict when the admin has confirmed Bot Management,
  // so a free-plan placeholder score can never misclassify everyone.
  if (opts.botManagementEnabled) {
    const bm = signals.botManagement;
    if (bm?.verifiedBot === true) return true;
    if (typeof bm?.score === "number" && bm.score <= opts.botScoreThreshold) return true;
  }

  const ua = signals.userAgent?.trim();
  if (!ua) return true; // missing UA is almost always automated
  if (BOT_UA_RE.test(ua)) return true;
  if (signals.scannerProbe) return true;

  // Datacenter ASN: a positive signal ONLY when the request does not look like a real
  // browser. This keeps humans on VPNs / Cloudflare WARP / iCloud Private Relay /
  // corporate egress (clean browser UA + Accept-Language) out of the bot bucket.
  if (
    opts.flagDatacenterTraffic &&
    !signals.browserLike &&
    typeof signals.asn === "number" &&
    isHostingAsn(signals.asn)
  ) {
    return true;
  }
  return false;
}
