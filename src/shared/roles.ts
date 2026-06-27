import type { Role } from "./types.ts";

/** Role hierarchy + capability checks, shared so the SPA can hide controls the
 *  Worker would reject anyway. The Worker is always the real enforcement point. */

export const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

export type Capability =
  | "read"
  | "writeLinks"
  | "writeCampaigns"
  | "writeDomains"
  | "manageUsers";

// Minimum role required for each capability (matches the spec: viewer read-only;
// editor manages links + campaigns; admin manages domains + users + everything).
const REQUIRED: Record<Capability, Role> = {
  read: "viewer",
  writeLinks: "editor",
  writeCampaigns: "editor",
  writeDomains: "admin",
  manageUsers: "admin",
};

export function atLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export function can(role: Role, capability: Capability): boolean {
  return atLeast(role, REQUIRED[capability]);
}
