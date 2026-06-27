import { eq } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { users } from "../db/schema.ts";
import type { Role } from "../shared/types.ts";
import { readSession } from "./session.ts";

/**
 * Admin authentication: a signed session cookie identifies the user; their role
 * is looked up in the `users` table. Sessions are minted by the password / passkey
 * login routes (see api/auth-routes.ts). No external identity provider.
 */

export type AuthResult =
  | { ok: true; email: string; role: Role }
  | { ok: false; status: 401 | 403; message: string };

export async function authenticate(request: Request, env: Env): Promise<AuthResult> {
  const email = await readSession(env, request);
  if (!email) return { ok: false, status: 401, message: "Please sign in." };

  const role = await resolveRole(env, email);
  if (!role) {
    return {
      ok: false,
      status: 403,
      message: "Your account is recognized but has no access yet. Ask an administrator.",
    };
  }
  return { ok: true, email, role };
}

async function resolveRole(env: Env, email: string): Promise<Role | null> {
  const [u] = await getDb(env).select({ role: users.role }).from(users).where(eq(users.email, email)).limit(1);
  return u?.role ?? null;
}
