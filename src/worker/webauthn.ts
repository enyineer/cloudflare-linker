import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { passkeys } from "../db/schema.ts";
import { fromBase64, toBase64 } from "./crypto.ts";

/** Passkeys (WebAuthn) - an additional login method. Public keys live in D1;
 *  short-lived challenges in KV. rpID/origin are derived from the request host. */

const RP_NAME = "Cloudflare Linker";
const CHALLENGE_TTL = 300; // seconds

type Purpose = "register" | "login" | "reset";

function rp(request: Request): { rpID: string; origin: string } {
  const url = new URL(request.url);
  return { rpID: url.hostname, origin: url.origin };
}

function challengeKey(purpose: Purpose, email: string): string {
  return `pk-chal:${purpose}:${email}`;
}
async function putChallenge(env: Env, purpose: Purpose, email: string, challenge: string): Promise<void> {
  await env.SECRETS_KV.put(challengeKey(purpose, email), challenge, { expirationTtl: CHALLENGE_TTL });
}
async function takeChallenge(env: Env, purpose: Purpose, email: string): Promise<string | null> {
  const key = challengeKey(purpose, email);
  const value = await env.SECRETS_KV.get(key);
  if (value) await env.SECRETS_KV.delete(key); // single-use
  return value;
}

function transportsOf(stored: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!stored) return undefined;
  try {
    return JSON.parse(stored) as AuthenticatorTransportFuture[];
  } catch {
    return undefined;
  }
}

async function credentialsFor(env: Env, email: string) {
  return getDb(env).select().from(passkeys).where(eq(passkeys.userEmail, email));
}

export async function registrationOptions(
  env: Env,
  request: Request,
  email: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpID } = rp(request);
  const existing = await credentialsFor(env, email);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: email,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: transportsOf(c.transports) })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  await putChallenge(env, "register", email, options.challenge);
  return options;
}

export async function verifyRegistration(
  env: Env,
  request: Request,
  email: string,
  response: RegistrationResponseJSON,
): Promise<boolean> {
  const { rpID, origin } = rp(request);
  const expectedChallenge = await takeChallenge(env, "register", email);
  if (!expectedChallenge) return false;
  let result: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    result = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID });
  } catch {
    return false;
  }
  if (!result.verified || !result.registrationInfo) return false;
  const cred = result.registrationInfo.credential;
  await getDb(env)
    .insert(passkeys)
    .values({
      id: cred.id,
      userEmail: email,
      publicKey: toBase64(cred.publicKey),
      counter: cred.counter,
      transports: cred.transports ? JSON.stringify(cred.transports) : null,
    })
    .onConflictDoUpdate({ target: passkeys.id, set: { publicKey: toBase64(cred.publicKey), counter: cred.counter } });
  return true;
}

/** Returns options, or null if the email has no passkeys. */
export async function authenticationOptions(
  env: Env,
  request: Request,
  email: string,
  purpose: "login" | "reset",
): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
  const { rpID } = rp(request);
  const creds = await credentialsFor(env, email);
  if (creds.length === 0) return null;
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.map((c) => ({ id: c.id, transports: transportsOf(c.transports) })),
    userVerification: "preferred",
  });
  await putChallenge(env, purpose, email, options.challenge);
  return options;
}

export async function verifyAuthentication(
  env: Env,
  request: Request,
  email: string,
  response: AuthenticationResponseJSON,
  purpose: "login" | "reset",
): Promise<boolean> {
  const { rpID, origin } = rp(request);
  const expectedChallenge = await takeChallenge(env, purpose, email);
  if (!expectedChallenge) return false;
  const db = getDb(env);
  const [cred] = await db.select().from(passkeys).where(eq(passkeys.id, response.id)).limit(1);
  if (!cred || cred.userEmail !== email) return false;
  let result: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.id,
        publicKey: fromBase64(cred.publicKey),
        counter: cred.counter,
        transports: transportsOf(cred.transports),
      },
    });
  } catch {
    return false;
  }
  if (!result.verified) return false;
  await db.update(passkeys).set({ counter: result.authenticationInfo.newCounter }).where(eq(passkeys.id, cred.id));
  return true;
}

export async function listPasskeys(env: Env, email: string) {
  return credentialsFor(env, email);
}

export async function deletePasskey(env: Env, email: string, id: string): Promise<boolean> {
  const rows = await getDb(env)
    .delete(passkeys)
    .where(and(eq(passkeys.id, id), eq(passkeys.userEmail, email)))
    .returning();
  return rows.length > 0;
}
