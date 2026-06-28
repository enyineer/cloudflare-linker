import { describe, expect, test } from "bun:test";
import { browserFamily, buildClickRecord, deviceCategory, extractUtm, refererOrigin } from "./click.ts";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/604.1";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

describe("deviceCategory", () => {
  test("null UA is unknown", () => expect(deviceCategory(null)).toBe("unknown"));
  // deviceCategory is form-factor only now; bot is set from is_bot in buildClickRecord.
  test("a bot UA is classified by form factor (desktop)", () => expect(deviceCategory(GOOGLEBOT)).toBe("desktop"));
  test("iPad is tablet", () => expect(deviceCategory(IPAD)).toBe("tablet"));
  test("iPhone is mobile", () => expect(deviceCategory(IPHONE)).toBe("mobile"));
  test("desktop Chrome is desktop", () => expect(deviceCategory(CHROME)).toBe("desktop"));
});

describe("browserFamily", () => {
  test("null UA is null", () => expect(browserFamily(null)).toBeNull());
  test("Chrome", () => expect(browserFamily(CHROME)).toBe("Chrome"));
  test("Safari (iPhone)", () => expect(browserFamily(IPHONE)).toBe("Safari"));
  test("Edge before Chrome", () =>
    expect(browserFamily("...Chrome/120.0 ... Edg/120.0")).toBe("Edge"));
});

describe("refererOrigin", () => {
  test("null is null", () => expect(refererOrigin(null)).toBeNull());
  test("reduces to origin, dropping path/query", () =>
    expect(refererOrigin("https://news.example.com/a/b?x=1#h")).toBe("https://news.example.com"));
  test("invalid is null", () => expect(refererOrigin("nonsense")).toBeNull());
});

describe("extractUtm", () => {
  test("keeps only the five standard utm_* keys", () => {
    const utm = extractUtm(new URLSearchParams("utm_source=tw&utm_medium=social&fbclid=abc&ref=x&email=a@b.com"));
    expect(utm).toEqual({
      utmSource: "tw",
      utmMedium: "social",
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
    });
  });

  test("blank or absent values become null", () => {
    expect(extractUtm(new URLSearchParams("utm_source=")).utmSource).toBeNull();
    expect(extractUtm(new URLSearchParams("")).utmCampaign).toBeNull();
  });
});

describe("buildClickRecord (GDPR guarantees)", () => {
  const record = buildClickRecord({
    linkId: 7,
    campaignId: 3,
    hostname: "go.example.com",
    path: "/promo",
    redirectType: 302,
    userAgent: IPHONE,
    referer: "https://news.example.com/article?utm=1",
    country: "DE",
    region: "Bavaria",
    utm: { utmSource: "newsletter", utmMedium: "email", utmCampaign: "spring", utmTerm: null, utmContent: null },
    isBot: false,
  });

  test("derives coarse, anonymous fields", () => {
    expect(record).toMatchObject({
      linkId: 7,
      campaignId: 3,
      hostname: "go.example.com",
      path: "/promo",
      country: "DE",
      region: "Bavaria",
      deviceCategory: "mobile",
      browserFamily: "Safari",
      refererOrigin: "https://news.example.com",
      utmSource: "newsletter",
      utmMedium: "email",
      utmCampaign: "spring",
      redirectType: 302,
      isBot: false,
    });
  });

  test("device category is 'bot' when is_bot is set, regardless of UA", () => {
    const botRecord = buildClickRecord({
      linkId: 1,
      campaignId: null,
      hostname: "go.example.com",
      path: "/x",
      redirectType: 301,
      userAgent: CHROME, // a spoofed browser UA
      referer: null,
      country: null,
      region: null,
      utm: { utmSource: null, utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null },
      isBot: true,
    });
    expect(botRecord.deviceCategory).toBe("bot");
    expect(botRecord.isBot).toBe(true);
  });

  test("stores no IP, no full user-agent, no cookies", () => {
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("iPhone"); // no raw UA fragments
    expect(serialized).not.toContain("AppleWebKit");
    expect(serialized).not.toContain("/article"); // referer path dropped
    expect(Object.keys(record)).not.toContain("ip");
    expect(Object.keys(record)).not.toContain("userAgent");
  });
});
