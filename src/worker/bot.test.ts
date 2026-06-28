import { describe, expect, test } from "bun:test";
import { classifyBot, isScannerPath, type BotOptions } from "./bot.ts";

const OPTS: BotOptions = { botScoreThreshold: 30, flagDatacenterTraffic: false };

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

  test("flags risky extensions + crawler noise", () => {
    expect(isScannerPath("/backup.sql")).toBe(true);
    expect(isScannerPath("/site.tar.gz")).toBe(true);
    expect(isScannerPath("/favicon.ico")).toBe(true);
    expect(isScannerPath("/robots.txt")).toBe(true);
  });

  test("allows real links, the root, and /.well-known", () => {
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
    const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
    expect(classifyBot({ userAgent: chrome }, OPTS)).toBe(false);
  });

  test("scanner-path hits are bots even with a browser UA", () => {
    const chrome = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
    expect(classifyBot({ userAgent: chrome, scannerProbe: true }, OPTS)).toBe(true);
  });

  test("uses cf.botManagement as a positive signal when present", () => {
    const chrome = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120 Safari/537.36";
    expect(classifyBot({ userAgent: chrome, botManagement: { score: 5 } }, OPTS)).toBe(true);
    expect(classifyBot({ userAgent: chrome, botManagement: { verifiedBot: true } }, OPTS)).toBe(true);
  });

  test("a placeholder high score does not suppress UA detection (free-plan safety)", () => {
    // On free, botManagement may be a constant placeholder (score 99 = 'human').
    const chrome = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120 Safari/537.36";
    expect(classifyBot({ userAgent: chrome, botManagement: { score: 99 } }, OPTS)).toBe(false);
    expect(classifyBot({ userAgent: "curl/8", botManagement: { score: 99 } }, OPTS)).toBe(true);
  });

  test("datacenter flagging is opt-in", () => {
    const chrome = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36";
    const aws = { userAgent: chrome, asOrganization: "Amazon.com, Inc." };
    expect(classifyBot(aws, OPTS)).toBe(false);
    expect(classifyBot(aws, { botScoreThreshold: 30, flagDatacenterTraffic: true })).toBe(true);
  });
});
