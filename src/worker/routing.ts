import { normalizeHostname } from "../shared/format.ts";

/**
 * Is this request for the admin app (SPA + API) rather than a redirect host?
 * True for the configured admin hostname, any *.workers.dev host, and localhost.
 * Everything else is treated as a redirect host looked up in the `domains` table.
 */
export function isAdminHost(hostname: string, adminHostname: string | undefined): boolean {
  const h = normalizeHostname(hostname);
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "0.0.0.0") return true;
  if (h.endsWith(".workers.dev")) return true;
  const admin = adminHostname?.toLowerCase().trim();
  if (admin && h === normalizeHostname(admin)) return true;
  return false;
}
