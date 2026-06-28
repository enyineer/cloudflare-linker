import { describe, expect, test } from "bun:test";
import { isUniqueViolation } from "./sql-errors.ts";

describe("isUniqueViolation", () => {
  test("detects a top-level unique-constraint error", () => {
    const err = new Error("UNIQUE constraint failed: links.domain_id, links.path: SQLITE_CONSTRAINT");
    expect(isUniqueViolation(err)).toBe(true);
  });

  test("detects it through drizzle's DrizzleQueryError wrapper (.cause)", () => {
    // drizzle-orm throws `Failed query: ...` and nests the real D1 error in cause.
    const cause = new Error("UNIQUE constraint failed: links.domain_id, links.path: SQLITE_CONSTRAINT_UNIQUE");
    const wrapper = new Error("Failed query: insert into links ...\nparams: 1,/");
    wrapper.cause = cause;
    expect(isUniqueViolation(wrapper)).toBe(true);
  });

  test("detects it when nested two levels deep", () => {
    const inner = new Error("UNIQUE constraint failed: campaigns.slug");
    const mid = new Error("driver error");
    mid.cause = inner;
    const outer = new Error("Failed query");
    outer.cause = mid;
    expect(isUniqueViolation(outer)).toBe(true);
  });

  test("is false for unrelated errors", () => {
    expect(isUniqueViolation(new Error("NOT NULL constraint failed: links.target_url"))).toBe(false);
    expect(isUniqueViolation(new Error("Failed query: select ..."))).toBe(false);
    expect(isUniqueViolation("some string")).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  test("does not infinite-loop on a self-referential cause", () => {
    const err = new Error("boom");
    err.cause = err;
    expect(isUniqueViolation(err)).toBe(false);
  });
});
