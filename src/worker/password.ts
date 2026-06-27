import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/** Password hashing with scrypt (node:crypto). WebCrypto PBKDF2 is capped at
 *  100k iterations on Workers, below OWASP guidance, so we use scrypt instead. */

const KEYLEN = 32;
const PARAMS = { N: 16384, r: 8, p: 1 } as const; // ~16MB memory, sound for interactive auth

function derive(password: string, salt: Buffer, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEYLEN, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, dk) => {
      if (err) reject(err);
      else resolve(dk as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const dk = await derive(password, salt, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${dk.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!N || !r || !p) return false;
  const salt = Buffer.from(parts[4] ?? "", "base64");
  const expected = Buffer.from(parts[5] ?? "", "base64");
  let dk: Buffer;
  try {
    dk = await derive(password, salt, { N, r, p });
  } catch {
    return false;
  }
  if (dk.length !== expected.length) return false;
  return timingSafeEqual(dk, expected);
}

// Unambiguous alphabet (no 0/O/1/l) for operator-readable temporary passwords.
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function generateTempPassword(length = 14): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += TEMP_ALPHABET[(bytes[i] ?? 0) % TEMP_ALPHABET.length];
  return out;
}
