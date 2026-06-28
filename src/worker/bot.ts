/**
 * Bot / scanner heuristics (pure, unit-testable).
 *
 * Cloudflare gives a FREE-plan Worker no reliable bot verdict: request.cf.botManagement
 * (score, verifiedBot, JA3/JA4) is an Enterprise Bot Management feature and is absent
 * (or a meaningless placeholder) on free. So we classify from the User-Agent + request
 * signals, and treat cf.botManagement only as an extra POSITIVE signal when present -
 * never to declare a request "human" (a placeholder score must not suppress detection).
 */

// Common automated-client / crawler / scanner User-Agent markers.
const BOT_UA_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|monitor|curl|wget|python-requests|python-urllib|go-http-client|okhttp|axios|node-fetch|libwww|java\/|jakarta|perl|ruby|scrapy|masscan|zgrab|nikto|nmap|censys|wpscan|sqlmap|nuclei|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|gptbot|claudebot|ccbot|dataforseo|httrack|harvest/i;

// Hosting / datacenter org markers (opt-in; VPNs + corporate proxies false-positive).
const DATACENTER_RE =
  /amazon|aws|google|cloud|azure|microsoft|ovh|hetzner|digitalocean|linode|vultr|leaseweb|contabo|scaleway|alibaba|tencent|oracle|hostinger|namecheap|godaddy|choopa|m247|colocrossing/i;

// Malicious probe paths + crawler noise that should never be a real short link.
const SCANNER_NAME_RE =
  /(^|\/)(wp-login\.php|wp-admin|wp-includes|wp-content|xmlrpc\.php|administrator|admin\.php|phpmyadmin|pma|mysql|cgi-bin|vendor|owa|autodiscover|boaform|hnap1|eval-stdin\.php|config\.json|credentials)(\/|$|\.)/i;
const SCANNER_EXT_RE = /\.(env|git|sql|bak|old|backup|swp|tar|gz|tgz|zip|rar|ini|conf|cfg|pem|key|log|dump|asp|aspx|jsp)(\.[a-z0-9]+)?$/i;
const NOISE_PATH_RE = /^\/(favicon\.ico|robots\.txt|sitemap\.xml|ads\.txt|browserconfig\.xml|apple-touch-icon[\w-]*\.png)$/i;

/**
 * Does this path look like a vulnerability scan or non-content crawler noise rather
 * than a real short link? Used ONLY to suppress the host catch-all for unconfigured
 * paths - an explicitly created link at any path always still works.
 */
export function isScannerPath(path: string): boolean {
  const p = path.toLowerCase();
  if (p === "/") return false;
  if (p.startsWith("/.well-known")) return false; // ACME challenges, security.txt, etc. are legit
  if (/\/\.[a-z0-9]/.test(p)) return true; // any dotfile segment: /.env, /.git/config, /x/.aws
  return SCANNER_NAME_RE.test(p) || SCANNER_EXT_RE.test(p) || NOISE_PATH_RE.test(p);
}

export interface BotSignals {
  userAgent: string | null;
  /** request.cf.botManagement - present only with paid Bot Management; absent on free. */
  botManagement?: { score?: number; verifiedBot?: boolean } | null;
  /** request.cf.asOrganization - the network operator, used only when datacenter flagging is on. */
  asOrganization?: string | null;
  /** Whether the requested path matched isScannerPath(). */
  scannerProbe?: boolean;
}

export interface BotOptions {
  /** Cloudflare bot score (1 = bot ... 99 = human) at/below which it counts as a bot. */
  botScoreThreshold: number;
  /** Treat hosting/datacenter ASNs as bots (off by default; false-positive prone). */
  flagDatacenterTraffic: boolean;
}

/** Decide whether a click is from a bot. Positive signals only - we never use
 *  Cloudflare's score to assert "human", since on free it may be a constant placeholder. */
export function classifyBot(signals: BotSignals, opts: BotOptions): boolean {
  const bm = signals.botManagement;
  if (bm?.verifiedBot === true) return true;
  if (typeof bm?.score === "number" && bm.score <= opts.botScoreThreshold) return true;

  const ua = signals.userAgent?.trim();
  if (!ua) return true; // missing UA is almost always automated
  if (BOT_UA_RE.test(ua)) return true;
  if (signals.scannerProbe) return true;
  if (opts.flagDatacenterTraffic && signals.asOrganization && DATACENTER_RE.test(signals.asOrganization)) return true;
  return false;
}
