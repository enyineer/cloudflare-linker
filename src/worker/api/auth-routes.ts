import { eq, isNotNull } from "drizzle-orm";
import { getDb } from "../../db/client.ts";
import { ensureMigrated } from "../../db/migrate.ts";
import { users } from "../../db/schema.ts";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { EMAIL_RE } from "../../shared/format.ts";
import { recordAudit } from "../audit.ts";
import { hashPassword, verifyPassword } from "../password.ts";
import { issueSession, readSession, sessionClearCookie, sessionSetCookie } from "../session.ts";
import { authenticationOptions, registrationOptions, verifyAuthentication, verifyRegistration } from "../webauthn.ts";

/** Self-hosted auth endpoints (cookie-setting, so plain Worker routes rather than
 *  oRPC). Returns null for non-auth paths so the caller falls through to oRPC. */
export async function handleAuthRoutes(request: Request, url: URL, env: Env): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/auth/")) return null;
  await ensureMigrated(env.DB);

  const route = `${request.method} ${url.pathname}`;
  switch (route) {
    case "GET /api/auth/status":
      return status(env);
    case "POST /api/auth/login":
      return login(request, env);
    case "POST /api/auth/logout":
      return ok({ ok: true }, sessionClearCookie());
    case "POST /api/auth/set-password":
      return setPassword(request, env);
    case "POST /api/auth/change-password":
      return changePassword(request, env);
    case "POST /api/auth/passkey/register/options":
      return passkeyRegisterOptions(request, env);
    case "POST /api/auth/passkey/register":
      return passkeyRegister(request, env);
    case "POST /api/auth/passkey/login/options":
      return passkeyAuthOptions(request, env, "login");
    case "POST /api/auth/passkey/login":
      return passkeyLogin(request, env);
    case "POST /api/auth/passkey/reset/options":
      return passkeyAuthOptions(request, env, "reset");
    case "POST /api/auth/passkey/reset":
      return passkeyReset(request, env);
    default:
      return jsonError(404, "Not found");
  }
}

const MIN_PASSWORD = 12;

async function status(env: Env): Promise<Response> {
  const bootstrapEmail = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || null;
  const hasDeployPassword = Boolean(env.BOOTSTRAP_ADMIN_PASSWORD);
  const needsSetup = !(await hasAnyPassword(env)) && !hasDeployPassword;
  // Prefill the email when it's preconfigured; otherwise the wizard asks for it.
  return Response.json({ needsSetup, bootstrapEmail: needsSetup ? bootstrapEmail : null });
}

async function login(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) return jsonError(400, "Enter your email and password.");
  if (await isRateLimited(env, email)) {
    return jsonError(429, "Too many attempts. Please wait a few minutes and try again.");
  }

  const db = getDb(env);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  let authed = false;
  if (user?.passwordHash) {
    authed = await verifyPassword(password, user.passwordHash);
  } else {
    // First login via the deploy-time bootstrap password: seed + hash into D1.
    const be = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const bp = env.BOOTSTRAP_ADMIN_PASSWORD;
    if (be && bp && email === be && password === bp) {
      authed = true;
      const hash = await hashPassword(password);
      await db
        .insert(users)
        .values({ email, role: "admin", passwordHash: hash, passwordSetAt: new Date() })
        .onConflictDoUpdate({ target: users.email, set: { passwordHash: hash, passwordSetAt: new Date(), role: "admin" } });
    }
  }

  if (!authed) {
    await recordFailure(env, email);
    return jsonError(401, "Invalid email or password.");
  }
  await clearRateLimit(env, email);
  await recordAudit(env, email, "auth.login", "Signed in");
  return ok({ ok: true }, sessionSetCookie(await issueSession(env, email)));
}

async function setPassword(request: Request, env: Env): Promise<Response> {
  if (env.BOOTSTRAP_ADMIN_PASSWORD) return jsonError(400, "An admin password was set at deploy - sign in with it instead.");
  if (await hasAnyPassword(env)) return jsonError(409, "Setup is already complete. Please sign in.");

  const body = await readJson(request);
  const password = String(body.password ?? "");
  if (password.length < MIN_PASSWORD) return jsonError(400, `Use at least ${MIN_PASSWORD} characters.`);

  // Use the preconfigured email if set; otherwise take it from the form.
  let email = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || "";
  if (!email) {
    email = String(body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return jsonError(400, "Enter a valid email address.");
  }

  const hash = await hashPassword(password);
  await getDb(env)
    .insert(users)
    .values({ email, role: "admin", passwordHash: hash, passwordSetAt: new Date() })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash: hash, passwordSetAt: new Date(), role: "admin" } });
  await recordAudit(env, email, "auth.set_password", "Created the first admin account");
  return ok({ ok: true }, sessionSetCookie(await issueSession(env, email)));
}

async function changePassword(request: Request, env: Env): Promise<Response> {
  const email = await readSession(env, request);
  if (!email) return jsonError(401, "Please sign in.");

  const body = await readJson(request);
  const oldPassword = String(body.oldPassword ?? "");
  const newPassword = String(body.newPassword ?? "");
  if (newPassword.length < MIN_PASSWORD) return jsonError(400, `Use at least ${MIN_PASSWORD} characters.`);

  const db = getDb(env);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return jsonError(401, "Please sign in.");
  if (user.passwordHash && !(await verifyPassword(oldPassword, user.passwordHash))) {
    return jsonError(400, "Your current password is incorrect.");
  }
  const hash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash: hash, passwordSetAt: new Date() }).where(eq(users.email, email));
  await recordAudit(env, email, "auth.change_password", "Changed password");
  return Response.json({ ok: true });
}

// ── passkeys (WebAuthn) ─────────────────────────────────────────────────────────

async function passkeyRegisterOptions(request: Request, env: Env): Promise<Response> {
  const email = await readSession(env, request);
  if (!email) return jsonError(401, "Please sign in.");
  return Response.json(await registrationOptions(env, request, email));
}

async function passkeyRegister(request: Request, env: Env): Promise<Response> {
  const email = await readSession(env, request);
  if (!email) return jsonError(401, "Please sign in.");
  const body = await readJson(request);
  // External boundary: the browser's attestation JSON; the library validates it.
  const ok = await verifyRegistration(env, request, email, body.response as RegistrationResponseJSON);
  if (!ok) return jsonError(400, "Could not register that passkey. Please try again.");
  await recordAudit(env, email, "passkey.register", "Added a passkey");
  return Response.json({ ok: true });
}

async function passkeyAuthOptions(request: Request, env: Env, purpose: "login" | "reset"): Promise<Response> {
  const body = await readJson(request);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) return jsonError(400, "Enter your email.");
  const options = await authenticationOptions(env, request, email, purpose);
  if (!options) return jsonError(404, "No passkey is registered for that email.");
  return Response.json(options);
}

async function passkeyLogin(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) return jsonError(400, "Enter your email.");
  if (await isRateLimited(env, email)) return jsonError(429, "Too many attempts. Please wait a few minutes.");
  const verified = await verifyAuthentication(env, request, email, body.response as AuthenticationResponseJSON, "login");
  if (!verified) {
    await recordFailure(env, email);
    return jsonError(401, "Passkey sign-in failed.");
  }
  await clearRateLimit(env, email);
  await recordAudit(env, email, "passkey.login", "Signed in with a passkey");
  return ok({ ok: true }, sessionSetCookie(await issueSession(env, email)));
}

async function passkeyReset(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const email = String(body.email ?? "").trim().toLowerCase();
  const newPassword = String(body.newPassword ?? "");
  if (!email) return jsonError(400, "Enter your email.");
  if (newPassword.length < MIN_PASSWORD) return jsonError(400, `Use at least ${MIN_PASSWORD} characters.`);
  const verified = await verifyAuthentication(env, request, email, body.response as AuthenticationResponseJSON, "reset");
  if (!verified) return jsonError(401, "Passkey check failed. Please try again.");
  const hash = await hashPassword(newPassword);
  await getDb(env).update(users).set({ passwordHash: hash, passwordSetAt: new Date() }).where(eq(users.email, email));
  await recordAudit(env, email, "passkey.reset", "Reset password using a passkey");
  return ok({ ok: true }, sessionSetCookie(await issueSession(env, email)));
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function hasAnyPassword(env: Env): Promise<boolean> {
  const rows = await getDb(env).select({ email: users.email }).from(users).where(isNotNull(users.passwordHash)).limit(1);
  return rows.length > 0;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function ok(body: unknown, setCookie: string): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", "set-cookie": setCookie },
  });
}

function jsonError(statusCode: number, message: string): Response {
  return Response.json({ error: message }, { status: statusCode });
}

// Per-email login throttle in KV (email, not IP, to avoid storing IPs - GDPR).
const FAIL_LIMIT = 10;
const FAIL_WINDOW = 900; // seconds

function failKey(email: string): string {
  return `login-fail:${email}`;
}
async function isRateLimited(env: Env, email: string): Promise<boolean> {
  return (Number(await env.SECRETS_KV.get(failKey(email))) || 0) >= FAIL_LIMIT;
}
async function recordFailure(env: Env, email: string): Promise<void> {
  const next = (Number(await env.SECRETS_KV.get(failKey(email))) || 0) + 1;
  await env.SECRETS_KV.put(failKey(email), String(next), { expirationTtl: FAIL_WINDOW });
}
async function clearRateLimit(env: Env, email: string): Promise<void> {
  await env.SECRETS_KV.delete(failKey(email));
}
