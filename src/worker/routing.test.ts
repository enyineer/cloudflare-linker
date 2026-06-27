import { describe, expect, test } from "bun:test";
import { isAdminHost } from "./routing.ts";

describe("isAdminHost", () => {
  test("localhost is admin", () => expect(isAdminHost("localhost", "")).toBe(true));
  test("127.0.0.1 is admin", () => expect(isAdminHost("127.0.0.1", "")).toBe(true));
  test("*.workers.dev is admin", () => expect(isAdminHost("my-app.foo.workers.dev", "")).toBe(true));
  test("configured admin hostname matches (case-insensitive)", () =>
    expect(isAdminHost("Admin.Example.com", "admin.example.com")).toBe(true));
  test("a redirect host is not admin", () => expect(isAdminHost("go.example.com", "admin.example.com")).toBe(false));
  test("blank admin var falls back to platform detection only", () =>
    expect(isAdminHost("go.example.com", "")).toBe(false));
});
