// Optional deploy-time secret declared here (not in wrangler.jsonc) so the
// zero-config 1-click deploy keeps working. Merges into the generated global Env.
interface Env {
  // A Cloudflare API token set as a deploy-time secret. Highest-precedence token
  // source (otherwise the token pasted into the Setup page, stored in D1, is used).
  CLOUDFLARE_API_TOKEN?: string;
}
