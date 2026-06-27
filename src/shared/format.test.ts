import { describe, expect, test } from "bun:test";
import { isHttpUrl, normalizeHostname, normalizePath, slugify } from "./format.ts";

describe("normalizeHostname", () => {
  test("lowercases and strips a trailing dot", () => {
    expect(normalizeHostname("Go.Example.COM.")).toBe("go.example.com");
  });
});

describe("normalizePath", () => {
  test("keeps root", () => expect(normalizePath("/")).toBe("/"));
  test("empty becomes root", () => expect(normalizePath("")).toBe("/"));
  test("drops a trailing slash", () => expect(normalizePath("/auto/")).toBe("/auto"));
  test("drops repeated trailing slashes", () => expect(normalizePath("/a/b///")).toBe("/a/b"));
  test("adds a leading slash", () => expect(normalizePath("auto")).toBe("/auto"));
});

describe("slugify", () => {
  test("lowercases and dashes", () => expect(slugify("Spring Promo 2026!")).toBe("spring-promo-2026"));
  test("collapses and trims", () => expect(slugify("  --Hello__World--  ")).toBe("hello-world"));
});

describe("isHttpUrl", () => {
  test("accepts http(s)", () => {
    expect(isHttpUrl("https://example.com/a")).toBe(true);
    expect(isHttpUrl("http://example.com")).toBe(true);
  });
  test("rejects other schemes and junk", () => {
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("not a url")).toBe(false);
  });
});
