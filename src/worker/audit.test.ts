import { describe, expect, test } from "bun:test";
import { auditSummary } from "./audit-summary.ts";

describe("auditSummary", () => {
  test("summarizes mutations with safe details", () => {
    expect(auditSummary(["links", "create"], { path: "/promo", targetUrl: "https://x.test" })).toBe(
      "Created link /promo -> https://x.test",
    );
    expect(auditSummary(["domains", "create"], { hostname: "go.example.com" })).toBe("Added web address go.example.com");
    expect(auditSummary(["users", "update"], { email: "a@b.c", role: "editor" })).toBe("Changed a@b.c role to editor");
  });

  test("never includes the token for saveToken", () => {
    const summary = auditSummary(["setup", "saveToken"], { token: "super-secret-token-value" });
    expect(summary).toBe("Connected a Cloudflare API token");
    expect(summary).not.toContain("super-secret-token-value");
  });

  test("returns null for reads (not audited)", () => {
    expect(auditSummary(["links", "list"], {})).toBeNull();
    expect(auditSummary(["analytics", "overview"], {})).toBeNull();
    expect(auditSummary(["me"], {})).toBeNull();
  });
});
