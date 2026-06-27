import { eq } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { secrets } from "../db/schema.ts";
import { decryptString, encryptString, fromBase64, importAesKey, randomKeyBytes, toBase64 } from "./crypto.ts";

/** At-rest storage for the operator-pasted Cloudflare API token: AES-GCM-encrypted
 *  in D1, with the key held in KV so a D1-only leak isn't plaintext. */

const TOKEN_NAME = "cloudflare_api_token";
const KV_KEY = "token-enc-key";

async function getOrCreateKey(env: Env): Promise<CryptoKey> {
  const stored = await env.SECRETS_KV.get(KV_KEY);
  if (stored) return importAesKey(fromBase64(stored));
  const raw = randomKeyBytes();
  await env.SECRETS_KV.put(KV_KEY, toBase64(raw));
  return importAesKey(raw);
}

export async function readStoredToken(env: Env): Promise<string | null> {
  const [row] = await getDb(env).select().from(secrets).where(eq(secrets.name, TOKEN_NAME)).limit(1);
  if (!row) return null;
  try {
    const key = await getOrCreateKey(env);
    return await decryptString(key, row.ciphertext, row.iv);
  } catch {
    return null; // unreadable (e.g. key rotated/lost) -> treat as no token
  }
}

export async function writeStoredToken(env: Env, token: string): Promise<void> {
  const key = await getOrCreateKey(env);
  const { ciphertext, iv } = await encryptString(key, token);
  await getDb(env)
    .insert(secrets)
    .values({ name: TOKEN_NAME, ciphertext, iv })
    .onConflictDoUpdate({ target: secrets.name, set: { ciphertext, iv } });
}

export async function clearStoredToken(env: Env): Promise<void> {
  await getDb(env).delete(secrets).where(eq(secrets.name, TOKEN_NAME));
}
