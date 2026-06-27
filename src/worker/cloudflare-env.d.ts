// Optional deploy-time secret declared here (not in wrangler.jsonc) so the
// zero-config 1-click deploy keeps working. Merges into the generated global Env.
interface Env {
  // A Cloudflare API token set as a deploy-time secret. Highest-precedence token
  // source (otherwise the token pasted into the Setup page, stored in D1, is used).
  CLOUDFLARE_API_TOKEN?: string;
  // Optional deploy-time initial admin password. If set, the first login as
  // BOOTSTRAP_ADMIN_EMAIL uses it (then it's hashed into D1). If unset, the app
  // shows a one-time "create admin password" screen instead.
  BOOTSTRAP_ADMIN_PASSWORD?: string;
}
