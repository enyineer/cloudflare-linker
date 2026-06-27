import { describe, expect, test } from "bun:test";
import { resolveRange } from "./analytics-range.ts";

const NOW = new Date("2026-06-27T12:00:00.000Z");

describe("resolveRange", () => {
  test("defaults to the last 30 days ending today (UTC, inclusive)", () => {
    const r = resolveRange(undefined, undefined, NOW);
    expect(r.to).toBe("2026-06-27");
    expect(r.from).toBe("2026-05-29");
    expect(r.fromDate.toISOString()).toBe("2026-05-29T00:00:00.000Z");
    expect(r.toDate.toISOString()).toBe("2026-06-27T23:59:59.999Z");
  });

  test("honors an explicit from/to", () => {
    const r = resolveRange("2026-01-01", "2026-01-31", NOW);
    expect(r.from).toBe("2026-01-01");
    expect(r.to).toBe("2026-01-31");
    expect(r.fromDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(r.toDate.toISOString()).toBe("2026-01-31T23:59:59.999Z");
  });
});
