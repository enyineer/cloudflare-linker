// Optional deploy-time secret declared here (not in wrangler.jsonc) so the
// zero-config 1-click deploy keeps working. Merges into the generated global Env.
interface Env {
  // All optional - NOT declared in wrangler.jsonc so the Deploy button doesn't
  // force them, and read defensively at runtime. Set any later in the dashboard
  // (Settings -> Variables) or .dev.vars.
  ADMIN_HOSTNAME?: string; // blank -> auto-detect *.workers.dev / localhost
  BOOTSTRAP_ADMIN_EMAIL?: string; // blank -> the first-run screen asks for it
  CLOUDFLARE_ACCOUNT_ID?: string; // blank -> derived from the token / chosen on Setup
  CLOUDFLARE_WORKER_NAME?: string; // blank -> auto-detected via the API + cached in D1
  // A Cloudflare API token set as a deploy-time secret. Highest-precedence token
  // source (otherwise the token pasted into the Setup page, stored in D1, is used).
  CLOUDFLARE_API_TOKEN?: string;
  // Optional deploy-time initial admin password. If set, the first login as
  // BOOTSTRAP_ADMIN_EMAIL uses it (then it's hashed into D1). If unset, the app
  // shows a one-time "create admin account" screen instead.
  BOOTSTRAP_ADMIN_PASSWORD?: string;
}
