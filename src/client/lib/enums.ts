import { REDIRECT_TYPES, USER_ROLES, type RedirectType, type Role } from "../../shared/types.ts";

/** Narrow a form value to a known enum member without casting. */
export function asRole(value: string): Role {
  return USER_ROLES.find((r) => r === value) ?? "viewer";
}

export function asRedirectType(value: number): RedirectType {
  return REDIRECT_TYPES.find((r) => r === value) ?? 301;
}
