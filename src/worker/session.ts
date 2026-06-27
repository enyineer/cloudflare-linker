import { SignJWT, jwtVerify } from "jose";
import { fromBase64, randomKeyBytes, toBase64 } from "./crypto.ts";

/** Signed session cookie (HS256 via jose). The signing key is auto-generated and
 *  kept in KV - not D1 - so a D1 leak (which holds password hashes) can't forge
 *  sessions. */

const ALG = "HS256";
export const SESSION_COOKIE = "cl_session";
const TTL_DAYS = 30;
const KV_KEY = "session-signing-key";

async function signingKey(env: Env): Promise<Uint8Array> {
  const existing = await env.SECRETS_KV.get(KV_KEY);
  if (existing) return fromBase64(existing);
  const raw = randomKeyBytes();
  await env.SECRETS_KV.put(KV_KEY, toBase64(raw));
  return raw;
}

export async function issueSession(env: Env, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${TTL_DAYS}d`)
    .sign(await signingKey(env));
}

export async function readSession(env: Env, request: Request): Promise<string | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await signingKey(env), { algorithms: [ALG] });
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export function sessionSetCookie(token: string): string {
  const maxAge = TTL_DAYS * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function sessionClearCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
