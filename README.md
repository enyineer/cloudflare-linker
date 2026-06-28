# Cloudflare Linker

A self-service link redirect and click-analytics tool that runs **entirely on Cloudflare** (Workers + D1). Create short links that redirect to any web address, group them into campaigns, and see click charts in a simple dashboard. No external database, no third-party analytics, no separate server.

- **Redirects**: any `(hostname, path)` to any target, with `301/302/307/308`, query-param appending, and per-link fallback.
- **Campaigns**: group links and auto-fill UTM tags.
- **Analytics**: clicks over time, top links/campaigns/sources/countries/devices/referrers, with per-link, per-campaign and per-web-address drill-downs, a date-range filter, and **multi-field filtering** - tap any value (e.g. a country) to narrow everything, combine several fields, or add one from the "Add filter" picker.
- **GDPR-first logging**: anonymous aggregate clicks only. No IP, no full user-agent, no cookies (see [Privacy](#privacy--gdpr)).
- **Built-in sign-in**: email + password, with optional passkeys (Touch ID / Windows Hello / phone). No external identity provider, no credit card.
- **Hostname setup, automated**: connect a Cloudflare token and the app creates the DNS record + Worker route for a web address for you (with a confirm-first preview).
- **Audit log**: every admin change and sign-in is recorded for abuse review (admins only).
- **Simple admin UI**: plain language, role-based access, first-run guide.

---

## Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/enyineer/cloudflare-linker)

What the button does:

1. Clones the repo into your Cloudflare account and builds it.
2. **Auto-provisions the D1 database and the `SECRETS_KV` namespace** - `wrangler.jsonc` deliberately omits both the `database_id` and the KV `id`, so Cloudflare creates them for you (requires Wrangler 4.45+, which this project pins). `nodejs_compat` (needed for password hashing) is enabled in `wrangler.jsonc` and applied automatically.
3. Deploys the Worker, which serves both the admin app and the redirects.

The deploy asks for **nothing** - there are no required fields. On your first visit you create the admin account (email + password) right in the app; sign-in is built in, with no Cloudflare Access and no credit card. Database migrations apply themselves on the first request, so you never run a migration command.

Prefer the CLI? `bun install && bun run deploy`.

---

## Updating to a new version

The Deploy button **copies** this project into a new repo in your account (it isn't a GitHub fork), so your deployed repo starts with an **unrelated git history** - a plain `git pull` would refuse to merge. Adopt this repo's history **once**, and every update afterward is trivial:

```bash
# in a clone of YOUR deployed repo
git remote add upstream https://github.com/enyineer/cloudflare-linker.git
git fetch upstream
git reset --hard upstream/main      # only if you've made no local changes
git push --force origin main        # pushing triggers a redeploy (Workers Builds)
```

After that one-time step your repo shares history with upstream, so future updates are just:

```bash
git pull upstream main && git push  # fast-forward; auto-deploys on push
```

If you've customized your copy, cherry-pick or rebase your changes onto `upstream/main` instead of resetting. Either way there's no database step - migrations apply themselves on the next request.

---

## Optional configuration

Nothing is required - a fresh deploy works with no configuration. To preconfigure or override, set these in the dashboard under **Workers & Pages -> your Worker -> Settings -> Variables and Secrets** (or in `.dev.vars` for local dev). They are intentionally **not** declared in `wrangler.jsonc`, so the Deploy button doesn't turn them into mandatory fields.

| Variable | Type | What it is |
| --- | --- | --- |
| `BOOTSTRAP_ADMIN_EMAIL` | var | The first **admin**'s email. Blank -> the first-run screen asks for it. **Required if you set `BOOTSTRAP_ADMIN_PASSWORD`.** |
| `BOOTSTRAP_ADMIN_PASSWORD` | secret | An initial admin password. If set, your first sign-in uses `BOOTSTRAP_ADMIN_EMAIL` + this (then it's hashed into D1). If unset, the app shows the one-time "create your admin account" screen. |
| `ADMIN_HOSTNAME` | var | The admin app's hostname. Blank -> auto-detect `*.workers.dev` and `localhost`. Set it if you serve the admin on a custom domain. |

See [Admin sign-in](#admin-sign-in) below for how the first admin is created and how passwords are recovered.

### Optional: connect Cloudflare (Setup page)

Connect a Cloudflare API token and the admin **Setup** page can both **check** your configuration (token valid, which zones route to this Worker, and each web address's Cloudflare status - on the account, routed, proxied) **and set up redirect hostnames for you** - creating the DNS record + Worker route so a web address starts working, with no dashboard digging. It's optional; the app works without it (you can wire routes by hand). Setup is always visible to admins - before a token is connected it shows a "Connect Cloudflare" prompt.

**Connecting takes a paste - no CLI required.** On the Setup page:

1. Click **Create a Cloudflare token** - it opens Cloudflare's token form with the needed scopes pre-selected: `Zone:Read`, `Workers Routes:Edit`, `DNS:Edit`, `Account Workers Scripts:Read`. (Edit on Routes + DNS so the app can create them for you.) Create it and copy it.
2. **Paste it** into the Setup page and Save. The app verifies it, then stores it **AES-GCM-encrypted in D1** (the key lives in the auto-provisioned `SECRETS_KV` namespace, so a database-only leak isn't plaintext). No redeploy; rotating is just another paste. The account is read from the token (you pick one if it sees several); your zones are listed automatically.

**Setting up a web address.** Add a web address (or press **Set up** on one) and the app shows a **plan and asks you to confirm** before changing anything, then picks the approach automatically:

- **Whole address** - a hostname with no existing website gets a proxied placeholder DNS record + a `host/*` route (every path goes to your links).
- **Specific links** - a hostname that already serves a website gets a route **per link path**, so the rest of the site is untouched; routes are added/removed automatically as you add/remove links.
- **All subdomains (advanced)** - on the Setup page, "Catch-all subdomains" wires `*.zone` with one wildcard route (warned: it captures existing names like `www`/`mail` too).

If the domain isn't on your Cloudflare account yet, the dialog links you to Cloudflare's **Add a site** wizard and tells you which apex to enter. Deleting a web address removes only the routes + placeholder DNS the app created - never your real records.

> Security note: this token can edit DNS records and Worker routes on the zones you choose, and is stored in the app's (encrypted) database, so the app's code can read it. Scope it to the zone(s) you use and rotate it if exposed. For maximum isolation, set a deploy-time secret `wrangler secret put CLOUDFLARE_API_TOKEN`, which takes precedence over the pasted one. (A read-only token still powers the diagnostics but disables the in-app setup actions.)

Optional overrides:

| Variable | Type | What it is |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | var (optional) | Override the account. Derived from the token, or chosen on Setup when the token sees several. |
| `CLOUDFLARE_WORKER_NAME` | var (optional) | This Worker's script name. Leave blank - the app auto-detects it from the Cloudflare API (a Worker can't read its own name at runtime) and caches it in D1, so it survives redeploys. Only set this to override the detection. |
| `CLOUDFLARE_API_TOKEN` | secret (optional) | Set the token at deploy instead of pasting it. Takes precedence over the saved one. |

---

## Admin sign-in

Sign-in is built in: email + password, plus optional **passkeys** (Touch ID / Windows Hello / phone) as an additional method. Handled entirely by the Worker - passwords hashed with scrypt (`node:crypto`) in D1, passkeys (WebAuthn) public keys in D1, sessions as signed cookies (`jose` HS256) whose key lives in KV. The admin is protected while redirects stay public. No Cloudflare Access, no credit card.

**First admin (one of two ways):**
- Set a `BOOTSTRAP_ADMIN_PASSWORD` secret at deploy -> sign in with `BOOTSTRAP_ADMIN_EMAIL` + that password (most secure; it's then hashed into D1).
- Or leave it unset -> the app shows a one-time "create admin account" screen. If `BOOTSTRAP_ADMIN_EMAIL` is set it uses that; if not, you enter the admin email there too. Do this right after deploying.

**Adding people:** on the **Team** page an admin adds someone by email and gets a one-time temporary password to hand over; they sign in and change it under **Account**. Each person can register their own passkeys under **Account**. Roles are admin -> editor -> viewer.

**Forgot a password (no email is sent):**
1. **Reset it with a passkey** - on the sign-in page choose "Forgot your password?", confirm with a registered passkey, and set a new one.
2. Or another admin resets it on the **Team** page (one-time temporary password).
3. Last resort: the account owner clears the hash in Cloudflare's D1 console -
   `UPDATE users SET password_hash = NULL WHERE email = 'you@example.com';`. The "create your admin account" screen reappears only when **no** user still has a password and no `BOOTSTRAP_ADMIN_PASSWORD` is set; the account you recover this way is made an admin.

Roles: **admin** (everything + team management), **editor** (manage links + campaigns), **viewer** (read-only).

---

## Adding redirect hostnames

In the admin, go to **Web addresses -> Add web address** and type any hostname - a subdomain (`go.example.com`) or a root domain (`example.com`). There's no type to choose; how it gets wired depends on whether Cloudflare is connected.

**With Cloudflare connected** (a token saved on the Setup page): adding the address - or pressing **Set up** on it - provisions it for you (a proxied DNS record + a Worker route), after a confirm-first preview. A hostname that already serves a website is set up in "specific links" mode so the existing site keeps working; everything else routes the whole host. The Setup page can also catch **all** subdomains of a zone at once. See [connect Cloudflare](#optional-connect-cloudflare-setup-page).

**Without a Cloudflare connection**: the address is saved, but you wire it on Cloudflare yourself - add a Worker route (and a proxied DNS record) for the hostname in the dashboard under **Workers & Pages -> your Worker -> Settings -> Domains & Routes**. A zone-wide wildcard route (`*.your-zone/*`) makes every subdomain work with no per-address steps.

Either way, once a hostname routes to the Worker its links resolve immediately - adding a link is then just a database write.

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

On first run the app shows a "create your admin account" screen (prefilled with `BOOTSTRAP_ADMIN_EMAIL` if set); after that you sign in with email + password. To exercise a redirect locally, send a `Host` header:

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
| `bun run db:studio` | Open Drizzle Studio against the local D1. |
| `bun run preview` | Preview the production build locally. |
| `bun run cf-typegen` | Regenerate `worker-configuration.d.ts` after binding/var changes. |
| `bun run gen:datacenter-asns` | Refresh the vendored hosting-ASN list (`src/worker/datacenter-asns.generated.ts`). |

---

## How it works

A single Worker runs first on every request (`assets.run_worker_first`) and is hostname-aware:

- **Admin host** (`ADMIN_HOSTNAME` / `*.workers.dev` / `localhost`): `/api/*` is the oRPC API (behind the session login); everything else serves the React SPA.
- **Any other host**: looked up as a redirect host in D1. On a match it returns the redirect and logs one anonymous click via `ctx.waitUntil` (non-blocking); otherwise a clean 404.

### Migrations

Migrations are generated by `drizzle-kit` into `drizzle/` and apply **automatically on the first request after deploy**, tracked in Wrangler's `d1_migrations` table - so a non-technical operator never runs a CLI. Developers can still apply them explicitly with `bun run db:migrate`; both paths share the same tracking table and are safe in either order.

---

## Reducing bot traffic

Public redirect addresses attract bots and vulnerability scanners (probes for `/.env`, `/.git/config`, `/wp-login.php`, and the like). Two layers keep that noise out of your numbers.

**In the app (on by default).** Bot and scanner clicks are detected from the user-agent and request patterns, flagged, and **kept out of the analytics** - a per-dashboard "Include bots" toggle shows them when you want, and the dashboard notes how many were hidden. Crucially, **only clicks on links you actually created are counted by default** - the host catch-all still redirects unknown paths, but those hits aren't logged, so the endless stream of bot/scanner paths (`/security.txt`, `/.env`, `/wp-login.php`, ...) never enters your stats. Those probe paths also get a clean 404 instead of a redirect. Admins tune all of this under **Setup -> Analytics filtering**: hide bots, block scanner paths, count (or not) unconfigured paths, treat datacenter traffic as bots, trust Cloudflare's bot score (only if you have paid Bot Management), or stop storing bot clicks entirely. Bot clicks are pruned automatically after a retention window (a daily cron). The bias is deliberately toward *not* flagging real people: the datacenter check (on by default) matches a maintained hosting-ASN list (`bun run gen:datacenter-asns` refreshes it) but spares clean browser traffic (VPNs, Cloudflare WARP, iCloud Private Relay), and an explicitly created link is never treated as a scanner path. Note: on Cloudflare's free plan a Worker gets no per-request bot verdict (`request.cf.botManagement` is an Enterprise Bot Management feature), so detection is heuristic - good enough to de-noise reporting, not a security control.

**At the edge (free, optional, recommended).** To stop bots before they reach the app at all, enable Cloudflare's free protections in your dashboard - these run ahead of the Worker, so blocked requests never cost a Worker request:

- **Bot Fight Mode**: your domain -> **Security -> Bots** -> enable **Bot Fight Mode** (one toggle, no API token needed).
- **A WAF custom rule** (Free allows 5): **Security -> WAF -> Custom rules** -> **Block** when the URI path matches scanner patterns, e.g. `(http.request.uri.path contains "/.") or (http.request.uri.path contains "/wp-")`.

---

## Privacy & GDPR

Click logging is designed to be **anonymous aggregate** data:

- **Never stored**: IP addresses, full user-agent strings, cookies, or any single-person identifier.
- **Stored**: country and a coarse region (from `request.cf`), a coarse device category and browser family (derived from the user-agent, which is then discarded), the referer's origin only, and the five standard `utm_*` tags. Any other incoming query parameters are forwarded to the destination if a link opts in, but are **not stored**.

This keeps the data set low-risk, but it does not by itself make you compliant. Depending on how you use it, you may still need a privacy notice and sign-off from your operator / Data Protection Officer. **That is your responsibility** - this project makes no legal guarantees.

---

## Tech stack

Bun, React 19 + Wouter, Vite + `@cloudflare/vite-plugin`, Cloudflare Workers + D1 + KV, Drizzle ORM (+ drizzle-kit), oRPC (contract-first, end-to-end typed), zod, Radix UI, Recharts, `jose` for session cookies, `node:crypto` scrypt for password hashing, and `@simplewebauthn` for passkeys.

A few decisions worth knowing:

- **Drizzle stable, not beta**: the `drizzle-orm` 1.0 beta line is an active development branch; this project uses the current stable release, which fully supports D1.
- **Dev runs through `vite`, not `wrangler dev`**: the Cloudflare Vite plugin runs the Worker in real `workerd` with the local D1 and ASSETS bindings plus HMR.
- **`run_worker_first: true`** (boolean): the Worker must see every path on redirect hostnames, so it owns all routing and delegates admin asset requests to `env.ASSETS.fetch`.

### Project structure

```
src/
  shared/     contract (oRPC + zod), roles, types, formatting, Cloudflare token-link builder - imported by both sides
  worker/     redirect engine, click logging, analytics; auth (passwords + sessions + passkeys);
              audit log; Cloudflare setup (DNS/routes) + token encryption; oRPC API (worker/api/)
  db/         Drizzle schema, client, runtime migrator, seed
  client/     React SPA (pages, components, lib)
drizzle/      generated SQL migrations
```

---

## License

[MIT](LICENSE) (c) Nico Enking.
