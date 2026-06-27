import { implement, ORPCError } from "@orpc/server";
import { contract } from "../../shared/contract.ts";
import { authenticate } from "../auth.ts";

/** oRPC server foundation: implements the shared contract, injects per-request
 *  context, and authenticates via Cloudflare Access (mapping email -> role). */

export interface InitialContext {
  env: Env;
  request: Request;
}

export const base = implement(contract).$context<InitialContext>();

// Verify identity (Access JWT in prod / bootstrap email in dev) and attach the
// user (email + role) to context for every authenticated procedure.
const requireAuth = base.middleware(async ({ context, next }) => {
  const auth = await authenticate(context.request, context.env);
  if (!auth.ok) {
    throw new ORPCError(auth.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED", { message: auth.message });
  }
  return next({ context: { user: { email: auth.email, role: auth.role } } });
});

export const authed = base.use(requireAuth);

// ── error + util helpers ──────────────────────────────────────────────────────

export function forbid(message: string): never {
  throw new ORPCError("FORBIDDEN", { message });
}
export function notFoundError(message: string): never {
  throw new ORPCError("NOT_FOUND", { message });
}
export function conflictError(message: string): never {
  throw new ORPCError("CONFLICT", { message });
}
export function badRequestError(message: string): never {
  throw new ORPCError("BAD_REQUEST", { message });
}

/** SQLite/D1 unique-constraint violation detector. */
export function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /UNIQUE constraint failed/i.test(message);
}

/** Drop undefined values so a partial update only sets the fields that were sent. */
export function definedOnly<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}
