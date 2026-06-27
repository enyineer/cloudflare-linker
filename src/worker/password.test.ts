import { describe, expect, test } from "bun:test";
import { generateTempPassword, hashPassword, verifyPassword } from "./password.ts";

describe("password", () => {
  test("hash + verify round-trip", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  test("each hash has a unique salt", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  test("malformed stored hash returns false, never throws", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "scrypt$bad")).toBe(false);
  });

  test("temp password length + safe charset", () => {
    const p = generateTempPassword(14);
    expect(p).toHaveLength(14);
    expect(/^[A-Za-z2-9]+$/.test(p)).toBe(true);
  });
});
