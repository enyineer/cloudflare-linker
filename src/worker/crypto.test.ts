import { describe, expect, test } from "bun:test";
import { decryptString, encryptString, fromBase64, importAesKey, randomKeyBytes, toBase64 } from "./crypto.ts";

describe("crypto", () => {
  test("encrypts and decrypts back to the original", async () => {
    const key = await importAesKey(randomKeyBytes());
    const { ciphertext, iv } = await encryptString(key, "secret-token-123");
    expect(ciphertext).not.toContain("secret-token");
    expect(await decryptString(key, ciphertext, iv)).toBe("secret-token-123");
  });

  test("base64 round-trips bytes", () => {
    const bytes = randomKeyBytes();
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
  });

  test("a different key cannot decrypt", async () => {
    const k1 = await importAesKey(randomKeyBytes());
    const k2 = await importAesKey(randomKeyBytes());
    const { ciphertext, iv } = await encryptString(k1, "hello");
    await expect(decryptString(k2, ciphertext, iv)).rejects.toThrow();
  });
});
