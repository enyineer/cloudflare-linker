import { eq } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getDb } from "../db/client.ts";
import { users } from "../db/schema.ts";
import type { Role } from "../shared/types.ts";

/**
 * Admin authentication.
 *
 * In production, Cloudflare Access sits in front of the admin host and injects a
 * signed Cf-Access-Jwt-Assertion. We VERIFY that JWT's signature against the
 * team's JWKS (never trust the raw email header) and read the email claim.
 *
 * When Access is not configured (local dev), we fall back to BOOTSTRAP_ADMIN_EMAIL
 * as the identity. The email is then mapped to a role from the `users` table, with
 * BOOTSTRAP_ADMIN_EMAIL auto-provisioned as the first admin.
 */

export type AuthResult =
  | { ok: true; email: string; role: Role }
  | { ok: false; status: 401 | 403; message: string };

// Lazily memoized per issuer (env isn't available at module scope). createRemoteJWKSet
// caches keys in-isolate and re-fetches on rotation by `kid`.
const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(issuer: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksByIssuer.set(issuer, jwks);
  }
  return jwks;
}

function accessConfigured(env: Env): boolean {
  return Boolean(env.TEAM_DOMAIN && env.POLICY_AUD);
}

async function verifyAccessJwt(token: string, env: Env): Promise<string> {
  const issuer = env.TEAM_DOMAIN.replace(/\/$/, "");
  const { payload } = await jwtVerify(token, getJwks(issuer), {
    issuer,
    audience: env.POLICY_AUD,
    algorithms: ["RS256"], // pin to prevent algorithm-confusion attacks
    requiredClaims: ["exp"],
    clockTolerance: "5s",
  });
  const email = typeof payload.email === "string" ? payload.email : null;
  if (!email) throw new Error("Access token has no email claim");
  return email.toLowerCase();
}

async function resolveEmail(
  request: Request,
  env: Env,
): Promise<{ email: string } | { status: 401; message: string }> {
  if (accessConfigured(env)) {
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) return { status: 401, message: "Missing Cloudflare Access credentials." };
    try {
      return { email: await verifyAccessJwt(token, env) };
    } catch {
      return { status: 401, message: "Your session is invalid or has expired. Please sign in again." };
    }
  }

  // Access not configured: only fall back to the bootstrap identity for LOCAL
  // requests. A deployed (non-local) host must use Access, otherwise the admin
  // would be wide open. This is the key production safeguard.
  const dev = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (dev && isLocalRequest(request)) return { email: dev };
  return {
    status: 401,
    message:
      "This dashboard requires Cloudflare Access. Configure TEAM_DOMAIN and POLICY_AUD to sign in (see the README).",
  };
}

function isLocalRequest(request: Request): boolean {
  const host = new URL(request.url).hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "0.0.0.0";
}

async function resolveRole(env: Env, email: string): Promise<Role | null> {
  const db = getDb(env);
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return existing[0].role;

  const bootstrap = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (bootstrap && email === bootstrap) {
    await db.insert(users).values({ email, role: "admin" }).onConflictDoNothing();
    return "admin";
  }
  return null;
}

export async function authenticate(request: Request, env: Env): Promise<AuthResult> {
  const resolved = await resolveEmail(request, env);
  if ("status" in resolved) return { ok: false, status: resolved.status, message: resolved.message };

  const role = await resolveRole(env, resolved.email);
  if (!role) {
    return {
      ok: false,
      status: 403,
      message: "Your account is recognized but has no access yet. Ask an administrator to add you.",
    };
  }
  return { ok: true, email: resolved.email, role };
}
