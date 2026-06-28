import { describe, expect, test } from "bun:test";
import { buildTarget, decideRedirect, paramsFromSearch } from "./redirect.ts";

interface L {
  path: string;
  enabled: boolean;
  fallbackUrl: string | null;
}
const link = (path: string, enabled = true, fallbackUrl: string | null = null): L => ({
  path,
  enabled,
  fallbackUrl,
});

describe("decideRedirect", () => {
  test("exact enabled link redirects to itself", () => {
    const exact = link("/promo");
    expect(decideRedirect("/promo", exact, link("/"))).toEqual({ action: "redirect", link: exact, viaCatchAll: false });
  });

  test("disabled exact link with fallback uses the fallback", () => {
    const exact = link("/promo", false, "https://example.com/closed");
    expect(decideRedirect("/promo", exact, link("/"))).toEqual({
      action: "fallback",
      link: exact,
      url: "https://example.com/closed",
    });
  });

  test("disabled exact link without fallback falls through to the / catch-all", () => {
    const root = link("/");
    expect(decideRedirect("/promo", link("/promo", false), root)).toEqual({
      action: "redirect",
      link: root,
      viaCatchAll: true,
    });
  });

  test("unknown path uses the / catch-all", () => {
    const root = link("/");
    expect(decideRedirect("/unknown", undefined, root)).toEqual({ action: "redirect", link: root, viaCatchAll: true });
  });

  test("blockCatchAll suppresses the catch-all (scanner probe -> not found)", () => {
    const root = link("/");
    expect(decideRedirect("/.env", undefined, root, true)).toEqual({ action: "notfound" });
  });

  test("blockCatchAll never blocks an explicit exact link", () => {
    const exact = link("/.env");
    expect(decideRedirect("/.env", exact, link("/"), true)).toEqual({ action: "redirect", link: exact, viaCatchAll: false });
  });

  test("unknown path with no / link is not found", () => {
    expect(decideRedirect("/unknown", undefined, undefined)).toEqual({ action: "notfound" });
  });

  test("disabled root link does not catch itself", () => {
    expect(decideRedirect("/", link("/", false), link("/", false))).toEqual({ action: "notfound" });
  });

  test("a disabled / catch-all is not used for an unknown path", () => {
    expect(decideRedirect("/x", undefined, link("/", false))).toEqual({ action: "notfound" });
  });
});

describe("buildTarget", () => {
  const campaign = { utmSource: "newsletter", utmMedium: "email", utmCampaign: "spring" };

  test("applies campaign UTM defaults", () => {
    const out = buildTarget("https://example.com/p", [], campaign);
    const u = new URL(out!);
    expect(u.searchParams.get("utm_source")).toBe("newsletter");
    expect(u.searchParams.get("utm_medium")).toBe("email");
    expect(u.searchParams.get("utm_campaign")).toBe("spring");
  });

  test("link params override campaign defaults (link wins)", () => {
    const out = buildTarget("https://example.com/p", [{ key: "utm_source", value: "flyer" }], campaign);
    expect(new URL(out!).searchParams.get("utm_source")).toBe("flyer");
  });

  test("preserves existing target query and overrides matching keys", () => {
    const out = buildTarget("https://example.com/p?a=1&utm_source=old", [], campaign);
    const u = new URL(out!);
    expect(u.searchParams.get("a")).toBe("1");
    expect(u.searchParams.get("utm_source")).toBe("newsletter");
  });

  test("skips params with an empty key", () => {
    const out = buildTarget("https://example.com/p", [{ key: "", value: "x" }], null);
    expect(new URL(out!).search).toBe("");
  });

  test("returns null for an invalid target URL", () => {
    expect(buildTarget("not a url", [], null)).toBeNull();
  });
});

describe("buildTarget (forwarding precedence)", () => {
  test("forwards incoming params, but configured link params win on conflict", () => {
    const incoming = [
      { key: "utm_source", value: "twitter" },
      { key: "gclid", value: "xyz" },
    ];
    const out = buildTarget("https://example.com/p", [{ key: "utm_source", value: "newsletter" }], null, incoming);
    const u = new URL(out!);
    expect(u.searchParams.get("utm_source")).toBe("newsletter"); // configured wins
    expect(u.searchParams.get("gclid")).toBe("xyz"); // forwarded (no conflict)
  });

  test("campaign UTMs win over incoming", () => {
    const out = buildTarget(
      "https://example.com/p",
      [],
      { utmSource: "newsletter", utmMedium: null, utmCampaign: null },
      [{ key: "utm_source", value: "twitter" }],
    );
    expect(new URL(out!).searchParams.get("utm_source")).toBe("newsletter");
  });

  test("no incoming params are added when forwarding is off (default)", () => {
    expect(new URL(buildTarget("https://example.com/p", [], null)!).search).toBe("");
  });
});

describe("paramsFromSearch", () => {
  test("flattens a query string into key/value pairs", () => {
    expect(paramsFromSearch(new URLSearchParams("a=1&b=two"))).toEqual([
      { key: "a", value: "1" },
      { key: "b", value: "two" },
    ]);
  });
});
