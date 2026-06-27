# Cloudflare Linker

A self-service link redirect and click-analytics tool that runs **entirely on Cloudflare** (Workers + D1). Create short links that redirect to any web address, group them into campaigns, and see click charts in a simple dashboard. No external database, no third-party analytics, no separate server.

- **Redirects**: any `(hostname, path)` to any target, with `301/302/307/308`, query-param appending, and per-link fallback.
- **Campaigns**: group links and auto-fill UTM tags.
- **Analytics**: clicks over time, top links/campaigns/sources/countries/devices/referrers, with per-link, per-campaign and per-web-address drill-downs and a date-range filter.
- **GDPR-first logging**: anonymous aggregate clicks only. No IP, no full user-agent, no cookies (see [Privacy](#privacy--gdpr)).
- **Simple admin UI**: plain language, role-based access, first-run guide.

---

## Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/enyineer/cloudflare-linker)

What the button does:

1. Clones the repo into your Cloudflare account and builds it.
2. **Auto-provisions the D1 database** - `wrangler.jsonc` deliberately omits `database_id`, so Cloudflare creates it for you (requires Wrangler 4.45+, which this project pins).
3. Deploys the Worker, which serves both the admin app and the redirects.

After the first deploy you still need two things: **configure Cloudflare Access** (so only you can reach the admin) and **set a few variables**. Both are below. Database migrations apply themselves on the first request, so you never run a migration command.

Prefer the CLI? `bun install && bun run deploy`.

---

## Required configuration

These are plain environment variables (not secrets). Set them in the Cloudflare dashboard under **Workers & Pages -> your Worker -> Settings -> Variables and Secrets**, or edit the `vars` block in `wrangler.jsonc` and redeploy.

| Variable | Required | What it is |
| --- | --- | --- |
| `BOOTSTRAP_ADMIN_EMAIL` | Yes | The email that becomes the first **admin** on first sign-in. Also the identity used in local dev. |
| `TEAM_DOMAIN` | Yes (production) | Your Cloudflare Access team URL, e.g. `https://your-team.cloudflareaccess.com` (no trailing slash). |
| `POLICY_AUD` | Yes (production) | The Access application's **Application Audience (AUD) Tag**. |
| `ADMIN_HOSTNAME` | Optional | The admin app's hostname. Leave blank to auto-detect `*.workers.dev` and `localhost`. Set it if you serve the admin on a custom domain. |

**Security note:** if `TEAM_DOMAIN` + `POLICY_AUD` are not set, a **deployed** (non-localhost) admin returns `401` and cannot be used. Cloudflare Access is required in production. The `BOOTSTRAP_ADMIN_EMAIL`-only fallback works for `localhost` development only.

No secrets are required for the core app.

### Optional: Cloudflare connection (Setup page)

If you connect a Cloudflare API token, the admin **Setup** page (admin only) runs read-only checks: is the token valid, which of your zones have a **wildcard route** to this Worker (catches the "wrong wildcard" / "no route" case), and what is each custom domain's status (zone on account / attached / certificate). The account and zones are read from the token - nothing to type. It stays hidden until configured, and the app works fine without it.

**Connecting takes two clicks - no CLI required.** On the Setup page:

1. Click **Create a read-only token** - it opens Cloudflare's token form with the needed scopes (`Zone:Read`, `Workers Routes:Read`, `Account Workers Scripts:Read`) pre-selected. Create it and copy it.
2. **Paste it** into the Setup page and Save. The app verifies it with Cloudflare, then stores it **AES-GCM-encrypted in D1** (the key lives in an auto-provisioned `SECRETS_KV` namespace, so a database-only leak is not plaintext). No redeploy; rotating is just another paste.

> Security note: the token is stored in the app's own (encrypted) database, so the app's code can read it. Use the **narrowest scope** possible (read-only for diagnostics). For maximum isolation you can instead set a deploy-time secret `wrangler secret put CLOUDFLARE_API_TOKEN`, which always takes precedence over the saved one.

There is nothing required - pasting a token is enough. The remaining knobs are all optional overrides:

| Variable | Type | What it is |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | var (optional) | Override the account. Derived from the token, or chosen on the Setup page when the token can see several. |
| `CLOUDFLARE_WORKER_NAME` | var | This Worker's script name (defaults to `cloudflare-linker`). A Worker can't read its own name at runtime, so this is a plain default. |
| `CLOUDFLARE_API_TOKEN` | Secret (optional) | Alternative to pasting: set the token as a deploy-time secret. Takes precedence over the saved one. |

---

## Cloudflare Access setup (admin sign-in)

The Worker verifies the Access JWT server-side (signature against your team's JWKS, `iss`/`aud`/`exp`, RS256 pinned), so the admin is protected even though redirects stay public.

1. Open the **Cloudflare Zero Trust** dashboard -> **Access** -> **Applications** -> **Add an application** -> **Self-hosted**.
2. **Application domain**: your admin hostname (the Worker's `*.workers.dev` URL, or your custom admin domain).
3. Add a **policy** that allows the people who should have access (for example, "Emails ending in @your-company.com", or specific addresses).
4. Save. Open the application's **Configure -> Additional settings** and copy the **Application Audience (AUD) Tag** -> set as `POLICY_AUD`.
5. Your team domain is `https://<your-team-name>.cloudflareaccess.com` -> set as `TEAM_DOMAIN`.
6. Set `BOOTSTRAP_ADMIN_EMAIL` to your own email. Sign in once - you become the first admin and can then add others under **Team** (admin -> editor -> viewer).

Roles: **admin** (everything + team management), **editor** (manage links + campaigns), **viewer** (read-only).

---

## Adding redirect hostnames

### Subdomains (instant, recommended)

If the app is deployed on a Cloudflare zone with a wildcard route, **any subdomain of that zone works with zero provisioning** - adding one is just a database write. In the admin, go to **Web addresses -> Add web address**, choose **Subdomain**, and it works immediately.

### Custom (external) domains (advanced, manual)

Attaching an external root domain to a Worker requires a custom-domain binding on your Cloudflare account, which this app does not automate. When you add a domain of type **Custom**, it is stored as **Awaiting setup**. To finish it:

1. Make sure the domain's zone is on your Cloudflare account.
2. In the Cloudflare dashboard, go to **Workers & Pages -> your Worker -> Settings -> Domains & Routes -> Add -> Custom Domain**, and add the hostname. (Or run `bunx wrangler deployments` workflows / a route as documented by Cloudflare.)
3. Once Cloudflare shows the custom domain as active, set the domain's status to **Active** in the admin.

If you've connected the Cloudflare API (above), the **Setup** page shows each custom domain's live status (zone found, attached, certificate) so you can confirm the steps worked.

---

## Local development

Requires **Bun** and **Node >= 22.15** (the Cloudflare Vite plugin needs `node:module`'s `registerHooks`). The repo pins this via `engines`.

```bash
bun install
cp /dev/null .dev.vars        # then add the line below
echo 'BOOTSTRAP_ADMIN_EMAIL=you@example.com' >> .dev.vars

bun run db:generate           # generate SQL migrations from the schema (only after schema changes)
bun run db:migrate            # apply migrations to the local D1
bun run db:seed               # optional: demo subdomain, campaign, links, and sample clicks

bun run dev                   # http://localhost:5173
```

In dev there is no Cloudflare Access, so the app signs you in as `BOOTSTRAP_ADMIN_EMAIL` (admin). To exercise a redirect locally, send a `Host` header:

```bash
curl -i -H "Host: demo.example.com" --max-redirs 0 http://localhost:5173/promo
```

### Scripts

| Script | Does |
| --- | --- |
| `bun run dev` | Full-stack dev server (SPA HMR + Worker in workerd + local D1). |
| `bun run build` | Build the SPA and Worker. |
| `bun run deploy` | Build, then `wrangler deploy`. |
| `bun run typecheck` | Type-check the client, worker, tooling, and tests. |
| `bun test` | Run unit tests. |
| `bun run db:generate` | Generate Drizzle SQL migrations from `src/db/schema.ts`. |
| `bun run db:migrate` / `db:migrate:remote` | Apply migrations to local / remote D1. |
| `bun run db:seed` | Seed demo data into the local D1. |
| `bun run cf-typegen` | Regenerate `worker-configuration.d.ts` after binding/var changes. |

---

## How it works

A single Worker runs first on every request (`assets.run_worker_first`) and is hostname-aware:

- **Admin host** (`ADMIN_HOSTNAME` / `*.workers.dev` / `localhost`): `/api/*` is the oRPC API (behind Access); everything else serves the React SPA.
- **Any other host**: looked up as a redirect host in D1. On a match it returns the redirect and logs one anonymous click via `ctx.waitUntil` (non-blocking); otherwise a clean 404.

### Migrations

Migrations are generated by `drizzle-kit` into `drizzle/` and apply **automatically on the first request after deploy**, tracked in Wrangler's `d1_migrations` table - so a non-technical operator never runs a CLI. Developers can still apply them explicitly with `bun run db:migrate`; both paths share the same tracking table and are safe in either order.

---

## Privacy & GDPR

Click logging is designed to be **anonymous aggregate** data:

- **Never stored**: IP addresses, full user-agent strings, cookies, or any single-person identifier.
- **Stored**: country and a coarse region (from `request.cf`), a coarse device category and browser family (derived from the user-agent, which is then discarded), the referer's origin only, and the five standard `utm_*` tags. Any other incoming query parameters are forwarded to the destination if a link opts in, but are **not stored**.

This keeps the data set low-risk, but it does not by itself make you compliant. Depending on how you use it, you may still need a privacy notice and sign-off from your operator / Data Protection Officer. **That is your responsibility** - this project makes no legal guarantees.

---

## Tech stack

Bun, React 19 + Wouter, Vite + `@cloudflare/vite-plugin`, Cloudflare Workers + D1, Drizzle ORM (+ drizzle-kit), oRPC (contract-first, end-to-end typed), zod, Radix UI, Recharts, and `jose` for Access JWT verification.

A few decisions worth knowing:

- **Drizzle stable, not beta**: the `drizzle-orm` 1.0 beta line is an active development branch; this project uses the current stable release, which fully supports D1.
- **Dev runs through `vite`, not `wrangler dev`**: the Cloudflare Vite plugin runs the Worker in real `workerd` with the local D1 and ASSETS bindings plus HMR.
- **`run_worker_first: true`** (boolean): the Worker must see every path on redirect hostnames, so it owns all routing and delegates admin asset requests to `env.ASSETS.fetch`.

### Project structure

```
src/
  shared/     contract (oRPC + zod), roles, types, formatting - imported by both sides
  worker/     redirect engine, click logging, auth, analytics, and the oRPC API
  db/         Drizzle schema, client, runtime migrator, seed
  client/     React SPA (pages, components, lib)
drizzle/      generated SQL migrations
```
