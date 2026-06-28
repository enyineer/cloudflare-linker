import { describe, expect, test } from "bun:test";
import {
  analyzeRoutes,
  analyzeWebAddress,
  classifyHostname,
  findRouteByPattern,
  findSubdomainRoute,
  hostnameRoutePattern,
  linkRoutePattern,
  isApexHost,
  isWildcardHost,
  isWildcard,
  subdomainRoutePattern,
  zoneForHostname,
  type CfZone,
} from "./cloudflare-checks.ts";

const ZONES = [
  { id: "z1", name: "example.com", status: "active" },
  { id: "z2", name: "acme.co.uk", status: "active" },
];

describe("zoneForHostname", () => {
  test("matches the longest zone suffix (handles multi-label TLDs)", () => {
    expect(zoneForHostname("links.acme.co.uk", ZONES)?.id).toBe("z2");
    expect(zoneForHostname("go.example.com", ZONES)?.id).toBe("z1");
  });
  test("returns null when no zone owns the host", () => {
    expect(zoneForHostname("links.other.com", ZONES)).toBeNull();
  });
});

describe("isWildcard", () => {
  test("detects a wildcard pattern", () => {
    expect(isWildcard("*.go.example.com/*")).toBe(true);
    expect(isWildcard("go.example.com/*")).toBe(false);
  });
});

describe("analyzeRoutes", () => {
  test("ok when a wildcard route points to our worker", () => {
    const r = analyzeRoutes([{ pattern: "*.go.example.com/*", script: "cloudflare-linker" }], "cloudflare-linker");
    expect(r.ok).toBe(true);
    expect(r.routes).toContain("*.go.example.com/*");
  });
  test("not ok when routes exist but none is a wildcard", () => {
    expect(analyzeRoutes([{ pattern: "go.example.com/*", script: "cloudflare-linker" }], "cloudflare-linker").ok).toBe(false);
  });
  test("not ok when no route targets our worker", () => {
    expect(analyzeRoutes([{ pattern: "*.x.com/*", script: "other-worker" }], "cloudflare-linker").ok).toBe(false);
  });
});

describe("findSubdomainRoute", () => {
  test("builds the wildcard pattern for a zone", () => {
    expect(subdomainRoutePattern("example.com")).toBe("*.example.com/*");
  });
  test("matches the exact wildcard route regardless of script", () => {
    const routes = [
      { pattern: "go.example.com/*", script: "cloudflare-linker" },
      { pattern: "*.example.com/*", script: "other-worker" },
    ];
    expect(findSubdomainRoute(routes, "example.com")?.script).toBe("other-worker");
  });
  test("returns undefined when no wildcard route exists for the zone", () => {
    expect(findSubdomainRoute([{ pattern: "go.example.com/*", script: "x" }], "example.com")).toBeUndefined();
  });
});

describe("hostname helpers", () => {
  test("route pattern, apex and wildcard detection", () => {
    expect(hostnameRoutePattern("go.example.com")).toBe("go.example.com/*");
    expect(subdomainRoutePattern("example.com")).toBe("*.example.com/*");
    expect(isApexHost("example.com", "example.com")).toBe(true);
    expect(isApexHost("go.example.com", "example.com")).toBe(false);
    expect(isWildcardHost("*.example.com")).toBe(true);
    expect(isWildcardHost("go.example.com")).toBe(false);
  });

  test("findRouteByPattern matches the exact pattern", () => {
    const routes = [{ pattern: "go.example.com/*", script: "cloudflare-linker" }];
    expect(findRouteByPattern(routes, "go.example.com/*")?.script).toBe("cloudflare-linker");
    expect(findRouteByPattern(routes, "x.example.com/*")).toBeUndefined();
  });

  test("linkRoutePattern targets a single path (and the apex root)", () => {
    expect(linkRoutePattern("example.com", "/promo")).toBe("example.com/promo");
    expect(linkRoutePattern("example.com", "/")).toBe("example.com/");
    expect(linkRoutePattern("example.com", "promo")).toBe("example.com/promo");
  });
});

describe("classifyHostname", () => {
  const w = "cloudflare-linker";
  test("connected when its own route targets our worker", () => {
    const routes = [{ pattern: "go.example.com/*", script: w }];
    expect(classifyHostname("go.example.com", "example.com", routes, w)).toBe("connected");
  });
  test("a plain subdomain is covered by the zone wildcard", () => {
    const routes = [{ pattern: "*.example.com/*", script: w }];
    expect(classifyHostname("go.example.com", "example.com", routes, w)).toBe("covered");
  });
  test("the apex is NOT covered by the wildcard", () => {
    const routes = [{ pattern: "*.example.com/*", script: w }];
    expect(classifyHostname("example.com", "example.com", routes, w)).toBe("needs_setup");
  });
  test("needs setup when nothing matches", () => {
    expect(classifyHostname("go.example.com", "example.com", [], w)).toBe("needs_setup");
  });
});

describe("analyzeWebAddress", () => {
  const zone: CfZone = { id: "z1", name: "example.com", status: "active" };
  const w = "cloudflare-linker";

  test("whole-host route + proxied -> routed (regardless of script name)", () => {
    const routes = [{ pattern: "go.example.com/*", script: "some-other-worker-name" }];
    const r = analyzeWebAddress("go.example.com", "whole", zone, routes, true);
    expect(r).toMatchObject({ zoneOnAccount: true, routed: true, proxied: true });
  });

  test("apex whole-host route -> routed", () => {
    const apexZone: CfZone = { id: "z9", name: "hd-versicherung.de", status: "active" };
    const routes = [{ pattern: "hd-versicherung.de/*", script: w }];
    const r = analyzeWebAddress("hd-versicherung.de", "whole", apexZone, routes, true);
    expect(r.routed).toBe(true);
  });

  test("zone wildcard covers a subdomain -> routed", () => {
    const routes = [{ pattern: "*.example.com/*", script: w }];
    const r = analyzeWebAddress("go.example.com", "whole", zone, routes, true);
    expect(r.routed).toBe(true);
  });

  test("paths mode: a per-link route counts as routed (no proxied DNS expected)", () => {
    const routes = [{ pattern: "shop.example.com/promo", script: w }];
    const r = analyzeWebAddress("shop.example.com", "paths", zone, routes, false);
    expect(r.routed).toBe(true);
    expect(r.message).toContain("Routed");
  });

  test("our routingMode is trusted even when the live route fetch is empty", () => {
    const r = analyzeWebAddress("go.example.com", "whole", zone, [], true);
    expect(r.routed).toBe(true);
  });

  test("zone present, never set up, no route -> not routed", () => {
    const r = analyzeWebAddress("go.example.com", "none", zone, [], false);
    expect(r).toMatchObject({ zoneOnAccount: true, routed: false });
  });

  test("zone not on account", () => {
    const r = analyzeWebAddress("go.other.com", "none", null, [], false);
    expect(r.zoneOnAccount).toBe(false);
    expect(r.routed).toBe(false);
  });

  test("routed whole-host but missing proxied DNS -> flagged in message", () => {
    const routes = [{ pattern: "go.example.com/*", script: w }];
    const r = analyzeWebAddress("go.example.com", "whole", zone, routes, false);
    expect(r.message).toContain("proxied DNS record is missing");
  });
});
