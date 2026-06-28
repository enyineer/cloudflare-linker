import { describe, expect, test } from "bun:test";
import { classifyBot, isHostingAsn, isScannerPath, looksLikeBrowser, type BotOptions } from "./bot.ts";

const OPTS: BotOptions = { botScoreThreshold: 30, flagDatacenterTraffic: false, botManagementEnabled: false };
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

describe("isScannerPath", () => {
  test("flags dotfile probes", () => {
    expect(isScannerPath("/.env")).toBe(true);
    expect(isScannerPath("/.env.backup")).toBe(true);
    expect(isScannerPath("/.git/config")).toBe(true);
    expect(isScannerPath("/wp-includes/.aws")).toBe(true);
  });

  test("flags known attack + admin paths", () => {
    expect(isScannerPath("/wp-login.php")).toBe(true);
    expect(isScannerPath("/xmlrpc.php")).toBe(true);
    expect(isScannerPath("/phpmyadmin")).toBe(true);
    expect(isScannerPath("/vendor/phpunit")).toBe(true);
  });

  test("flags risky extensions + crawler noise + security.txt probes", () => {
    expect(isScannerPath("/backup.sql")).toBe(true);
    expect(isScannerPath("/site.tar.gz")).toBe(true);
    expect(isScannerPath("/favicon.ico")).toBe(true);
    expect(isScannerPath("/robots.txt")).toBe(true);
    expect(isScannerPath("/security.txt")).toBe(true);
    expect(isScannerPath("/.well-known/security.txt")).toBe(true);
  });

  test("allows real links, the root, and ACME challenges", () => {
    expect(isScannerPath("/")).toBe(false);
    expect(isScannerPath("/offer")).toBe(false);
    expect(isScannerPath("/auto-ankauf-2026")).toBe(false);
    expect(isScannerPath("/.well-known/acme-challenge/abc123")).toBe(false);
  });
});

describe("classifyBot", () => {
  test("missing or empty UA is a bot", () => {
    expect(classifyBot({ userAgent: null }, OPTS)).toBe(true);
    expect(classifyBot({ userAgent: "   " }, OPTS)).toBe(true);
  });

  test("automated-client UAs are bots", () => {
    expect(classifyBot({ userAgent: "curl/8.4.0" }, OPTS)).toBe(true);
    expect(classifyBot({ userAgent: "python-requests/2.31" }, OPTS)).toBe(true);
    expect(classifyBot({ userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)" }, OPTS)).toBe(true);
  });

  test("a real browser UA is not a bot", () => {
    expect(classifyBot({ userAgent: CHROME }, OPTS)).toBe(false);
  });

  test("real device names that merely contain 'bot' are not bots (e.g. Cubot)", () => {
    expect(classifyBot({ userAgent: "Mozilla/5.0 (Linux; Android 12; CUBOT_X30) AppleWebKit/537.36 Chrome/120 Mobile" }, OPTS)).toBe(false);
  });

  test("scanner-path hits are bots even with a browser UA", () => {
    expect(classifyBot({ userAgent: CHROME, scannerProbe: true }, OPTS)).toBe(true);
  });

  test("cf.botManagement is used only when Bot Management is enabled", () => {
    // Off (free-plan default): a low/placeholder score is ignored entirely.
    expect(classifyBot({ userAgent: CHROME, botManagement: { score: 5 } }, OPTS)).toBe(false);
    expect(classifyBot({ userAgent: CHROME, botManagement: { score: 99 } }, OPTS)).toBe(false);
    // On: low score or verifiedBot flags; a high (human) score does not.
    const on: BotOptions = { ...OPTS, botManagementEnabled: true };
    expect(classifyBot({ userAgent: CHROME, botManagement: { score: 5 } }, on)).toBe(true);
    expect(classifyBot({ userAgent: CHROME, botManagement: { verifiedBot: true } }, on)).toBe(true);
    expect(classifyBot({ userAgent: CHROME, botManagement: { score: 99 } }, on)).toBe(false);
  });

  test("datacenter ASN flagging is opt-in and corroborated (clean browsers are spared)", () => {
    const dc = 16509; // Amazon AWS - in the hosting list
    const on: BotOptions = { ...OPTS, flagDatacenterTraffic: true };
    // off by default -> not flagged
    expect(classifyBot({ userAgent: CHROME, asn: dc, browserLike: true }, OPTS)).toBe(false);
    // on, but a real browser (VPN/WARP/Private Relay human) -> NOT flagged
    expect(classifyBot({ userAgent: CHROME, asn: dc, browserLike: true }, on)).toBe(false);
    // on, non-browser request from a hosting ASN -> flagged
    expect(classifyBot({ userAgent: CHROME, asn: dc, browserLike: false }, on)).toBe(true);
    // on, but a residential/unknown ASN -> not flagged even without browserLike
    expect(classifyBot({ userAgent: CHROME, asn: 64500, browserLike: false }, on)).toBe(false);
  });
});

describe("isHostingAsn", () => {
  test("knows a hosting ASN and rejects a non-hosting one", () => {
    expect(isHostingAsn(16509)).toBe(true); // Amazon AWS
    expect(isHostingAsn(64500)).toBe(false); // private-use ASN, never in the list
  });
});

describe("looksLikeBrowser", () => {
  test("true only for a browser UA with an Accept-Language header", () => {
    expect(looksLikeBrowser(CHROME, "en-US,en;q=0.9")).toBe(true);
    expect(looksLikeBrowser(CHROME, null)).toBe(false); // no Accept-Language -> not corroborated
    expect(looksLikeBrowser("curl/8.4.0", "en-US")).toBe(false);
    expect(looksLikeBrowser(null, "en-US")).toBe(false);
  });
});
