import { describe, expect, test } from "bun:test";
import { cloudflareTokenUrl, MANAGE_TOKEN_PERMS, registrableDomain } from "./cloudflare-link.ts";

describe("registrableDomain", () => {
  test("returns the apex for subdomains and apex inputs", () => {
    expect(registrableDomain("example.com")).toBe("example.com");
    expect(registrableDomain("go.example.com")).toBe("example.com");
    expect(registrableDomain("a.b.example.com")).toBe("example.com");
    expect(registrableDomain("*.example.com")).toBe("example.com");
  });
  test("handles multi-part country TLDs", () => {
    expect(registrableDomain("go.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("example.co.uk")).toBe("example.co.uk");
  });
});

describe("cloudflareTokenUrl", () => {
  const url = cloudflareTokenUrl(MANAGE_TOKEN_PERMS, "Cloudflare Linker");

  test("points at the create-token page", () => {
    expect(url.startsWith("https://dash.cloudflare.com/profile/api-tokens?")).toBe(true);
  });

  test("encodes the scopes, account, zone, and name", () => {
    const parsed = new URL(url);
    expect(JSON.parse(parsed.searchParams.get("permissionGroupKeys") ?? "[]")).toEqual(MANAGE_TOKEN_PERMS);
    expect(parsed.searchParams.get("accountId")).toBe("*");
    expect(parsed.searchParams.get("zoneId")).toBe("all");
    expect(parsed.searchParams.get("name")).toBe("Cloudflare Linker");
  });

  test("requests edit on dns and workers_routes", () => {
    const byKey = Object.fromEntries(MANAGE_TOKEN_PERMS.map((p) => [p.key, p.type]));
    expect(byKey.dns).toBe("edit");
    expect(byKey.workers_routes).toBe("edit");
    expect(byKey.zone).toBe("read");
  });
});
