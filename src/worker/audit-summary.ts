/** Pure: build a human audit summary for a mutating procedure (null for reads).
 *  Centralized so we control exactly what's stored - never tokens or passwords.
 *  No IO here, so it's unit-testable without the worker `Env`. */

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export function auditSummary(path: readonly string[], input: Record<string, unknown>): string | null {
  switch (path.join(".")) {
    case "domains.create":
      return `Added web address ${str(input.hostname)}`;
    case "domains.update":
      return `Set web address #${str(input.id)} to ${str(input.status)}`;
    case "domains.delete":
      return `Removed web address #${str(input.id)}`;
    case "links.create":
      return `Created link ${str(input.path)} -> ${str(input.targetUrl)}`;
    case "links.update":
      return `Updated link #${str(input.id)}`;
    case "links.delete":
      return `Deleted link #${str(input.id)}`;
    case "campaigns.create":
      return `Created campaign ${str(input.name)}`;
    case "campaigns.update":
      return `Updated campaign #${str(input.id)}`;
    case "campaigns.delete":
      return `Deleted campaign #${str(input.id)}`;
    case "users.create":
      return `Added team member ${str(input.email)} (${str(input.role)})`;
    case "users.update":
      return `Changed ${str(input.email)} role to ${str(input.role)}`;
    case "users.delete":
      return `Removed team member ${str(input.email)}`;
    case "users.resetPassword":
      return `Reset the password for ${str(input.email)}`;
    case "setup.saveToken":
      return "Connected a Cloudflare API token"; // never logs the token
    case "setup.selectAccount":
      return `Selected Cloudflare account ${str(input.accountId)}`;
    case "setup.setupHostname":
      return `Set up ${str(input.hostname)} on Cloudflare`;
    case "passkeys.delete":
      return "Removed a passkey";
    default:
      return null;
  }
}
