import { describe, expect, test } from "bun:test";
import {
  campaignCreateSchema,
  domainCreateSchema,
  linkCreateSchema,
  linkUpdateSchema,
  userCreateSchema,
} from "./contract.ts";

describe("domainCreateSchema", () => {
  test("normalizes host + defaults kind to subdomain", () => {
    const r = domainCreateSchema.safeParse({ hostname: "Go.Example.COM" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ hostname: "go.example.com", kind: "subdomain" });
  });
  test("custom kind is kept", () => {
    const r = domainCreateSchema.safeParse({ hostname: "go.example.com", kind: "custom" });
    expect(r.success && r.data.kind).toBe("custom");
  });
  test("empty hostname -> friendly message", () => {
    const r = domainCreateSchema.safeParse({ hostname: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Please enter a web address.");
  });
  test("rejects a non-hostname", () => {
    expect(domainCreateSchema.safeParse({ hostname: "not a host" }).success).toBe(false);
  });
});

describe("linkCreateSchema", () => {
  test("normalizes path, filters empty query keys, applies defaults", () => {
    const r = linkCreateSchema.safeParse({
      domainId: 1,
      path: "/promo/",
      targetUrl: "https://example.com/x",
      queryParams: [
        { key: "", value: "skip" },
        { key: " ref ", value: "flyer" },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.path).toBe("/promo");
      expect(r.data.redirectType).toBe(301);
      expect(r.data.enabled).toBe(true);
      expect(r.data.queryParams).toEqual([{ key: "ref", value: "flyer" }]);
    }
  });
  test("missing domainId -> friendly message", () => {
    const r = linkCreateSchema.safeParse({ path: "/", targetUrl: "https://example.com" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "domainId")).toBe(true);
  });
  test("rejects a non-http target", () => {
    const r = linkCreateSchema.safeParse({ domainId: 1, path: "/", targetUrl: "ftp://x.com" });
    expect(r.success).toBe(false);
  });
  test("rejects an invalid redirect type", () => {
    const r = linkCreateSchema.safeParse({ domainId: 1, path: "/", targetUrl: "https://x.com", redirectType: 999 });
    expect(r.success).toBe(false);
  });
});

describe("linkUpdateSchema", () => {
  test("partial update keeps only provided fields", () => {
    const r = linkUpdateSchema.safeParse({ id: 5, path: "/new" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(Object.keys(r.data).sort()).toEqual(["id", "path"]);
      expect(r.data.targetUrl).toBeUndefined();
    }
  });
});

describe("campaignCreateSchema", () => {
  test("name only leaves slug for the server to derive", () => {
    const r = campaignCreateSchema.safeParse({ name: "Spring Promo" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe("Spring Promo");
      expect(r.data.slug).toBeUndefined();
    }
  });
  test("blank utm becomes null", () => {
    const r = campaignCreateSchema.safeParse({ name: "X", utmSource: "  " });
    expect(r.success && r.data.utmSource).toBeNull();
  });
});

describe("userCreateSchema", () => {
  test("lowercases email", () => {
    const r = userCreateSchema.safeParse({ email: "Boss@Example.com", role: "admin" });
    expect(r.success && r.data.email).toBe("boss@example.com");
  });
  test("rejects bad email + bad role", () => {
    expect(userCreateSchema.safeParse({ email: "nope", role: "admin" }).success).toBe(false);
    expect(userCreateSchema.safeParse({ email: "a@b.com", role: "boss" }).success).toBe(false);
  });
});
