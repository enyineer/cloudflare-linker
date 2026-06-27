import { describe, expect, test } from "bun:test";
import { atLeast, can } from "./roles.ts";

describe("atLeast", () => {
  test("admin outranks editor and viewer", () => {
    expect(atLeast("admin", "editor")).toBe(true);
    expect(atLeast("editor", "admin")).toBe(false);
    expect(atLeast("viewer", "viewer")).toBe(true);
  });
});

describe("can", () => {
  test("viewer can read but not write", () => {
    expect(can("viewer", "read")).toBe(true);
    expect(can("viewer", "writeLinks")).toBe(false);
    expect(can("viewer", "writeCampaigns")).toBe(false);
    expect(can("viewer", "writeDomains")).toBe(false);
    expect(can("viewer", "manageUsers")).toBe(false);
  });

  test("editor manages links + campaigns only", () => {
    expect(can("editor", "writeLinks")).toBe(true);
    expect(can("editor", "writeCampaigns")).toBe(true);
    expect(can("editor", "writeDomains")).toBe(false);
    expect(can("editor", "manageUsers")).toBe(false);
  });

  test("admin can do everything", () => {
    expect(can("admin", "writeDomains")).toBe(true);
    expect(can("admin", "manageUsers")).toBe(true);
    expect(can("admin", "writeLinks")).toBe(true);
  });
});
