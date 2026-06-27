import { describe, expect, test } from "bun:test";
import { makeIdempotent, splitStatements } from "./migrations-parse.ts";

describe("makeIdempotent", () => {
  test("rewrites CREATE TABLE", () => {
    expect(makeIdempotent("CREATE TABLE `x` (a)")).toBe("CREATE TABLE IF NOT EXISTS `x` (a)");
  });

  test("rewrites CREATE UNIQUE INDEX", () => {
    expect(makeIdempotent("CREATE UNIQUE INDEX `i` ON `x` (`a`)")).toBe(
      "CREATE UNIQUE INDEX IF NOT EXISTS `i` ON `x` (`a`)",
    );
  });

  test("rewrites CREATE INDEX", () => {
    expect(makeIdempotent("CREATE INDEX `i` ON `x` (`a`)")).toBe(
      "CREATE INDEX IF NOT EXISTS `i` ON `x` (`a`)",
    );
  });

  test("leaves INSERT statements untouched", () => {
    expect(makeIdempotent("INSERT INTO x VALUES (1)")).toBe("INSERT INTO x VALUES (1)");
  });

  test("does not double-add IF NOT EXISTS", () => {
    expect(makeIdempotent("CREATE TABLE IF NOT EXISTS `x` (a)")).toBe(
      "CREATE TABLE IF NOT EXISTS `x` (a)",
    );
  });
});

describe("splitStatements", () => {
  test("splits on the breakpoint marker, trims, and makes statements idempotent", () => {
    const sql = "CREATE TABLE `a` (x);\n--> statement-breakpoint\nCREATE INDEX `i` ON `a` (`x`);";
    expect(splitStatements(sql)).toEqual([
      "CREATE TABLE IF NOT EXISTS `a` (x);",
      "CREATE INDEX IF NOT EXISTS `i` ON `a` (`x`);",
    ]);
  });

  test("drops empty trailing segments", () => {
    expect(splitStatements("CREATE TABLE `a` (x);\n--> statement-breakpoint\n")).toEqual([
      "CREATE TABLE IF NOT EXISTS `a` (x);",
    ]);
  });
});
