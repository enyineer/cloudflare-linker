import { eq } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { domains, links } from "../db/schema.ts";
import type { CfDiagnosticsDto, EnableResultDto, SetupPlanDto } from "../shared/contract.ts";
import type { RoutingMode } from "../shared/types.ts";
import {
  analyzeRoutes,
  analyzeWebAddress,
  findRouteByPattern,
  findSubdomainRoute,
  hostnameRoutePattern,
  isApexHost,
  isWildcardHost,
  linkRoutePattern,
  zoneForHostname,
  type CfRoute,
  type CfZone,
} from "./cloudflare-checks.ts";
import { getSelectedAccount, setSelectedAccount } from "./setup-config.ts";
import { readStoredToken, writeStoredToken } from "./token-store.ts";

const ZONE_CAP = 25; // most accounts have few zones; cap the per-zone route checks

const API_BASE = "https://api.cloudflare.com/client/v4";

interface Envelope<T> {
  success: boolean;
  result: T | null;
  errors?: { code?: number; message?: string }[];
  result_info?: { page: number; total_pages: number };
}

/** Status-aware request (HTTP status + parsed envelope) for write paths that
 *  branch on 403 (permission) / 409 (duplicate). */
async function cfSend<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // External boundary: Cloudflare always returns the v4 envelope; read defensively below.
  return { status: res.status, body: (await res.json()) as Envelope<T> };
}

const cfRequest = async <T>(token: string, method: string, path: string, body?: unknown): Promise<Envelope<T>> =>
  (await cfSend<T>(token, method, path, body)).body;
const cfGet = <T>(token: string, path: string): Promise<Envelope<T>> => cfRequest<T>(token, "GET", path);

type TokenSource = "secret" | "saved" | "none";

/** Token precedence: deploy-time secret > token saved (encrypted) in D1 > none. */
async function resolveToken(env: Env): Promise<{ token: string | null; source: TokenSource }> {
  const secret = env.CLOUDFLARE_API_TOKEN?.trim();
  if (secret) return { token: secret, source: "secret" };
  try {
    const saved = (await readStoredToken(env))?.trim();
    if (saved) return { token: saved, source: "saved" };
  } catch {
    /* D1/KV unavailable */
  }
  return { token: null, source: "none" };
}

/** The Setup page can always save into D1 as long as the KV key store is bound. */
function canSaveToken(env: Env): boolean {
  return Boolean(env.SECRETS_KV);
}

function workerNameOf(env: Env): string {
  return env.CLOUDFLARE_WORKER_NAME?.trim() || "cloudflare-linker";
}

function baseDiagnostics(env: Env, source: TokenSource): CfDiagnosticsDto {
  return {
    configured: false,
    canSaveToken: canSaveToken(env),
    tokenSource: source,
    workerName: workerNameOf(env),
    token: { ok: false, message: "Cloudflare API is not connected." },
    account: { id: null, name: null, needsSelection: false, options: [], message: "" },
    routing: { checked: false, message: "Connect the Cloudflare API to check routing.", truncated: false, zones: [] },
    webAddresses: [],
  };
}

/** Resolve which account to use: explicit var > saved choice > the only one. */
async function resolveAccount(
  env: Env,
  token: string,
): Promise<CfDiagnosticsDto["account"]> {
  const accounts = await fetchAccounts(token);
  const fromVar = env.CLOUDFLARE_ACCOUNT_ID?.trim() || "";
  let id = fromVar;
  if (!id) {
    const saved = await getSelectedAccount(env);
    if (saved && accounts.some((a) => a.id === saved)) id = saved;
    else if (accounts.length === 1) id = accounts[0]?.id ?? "";
  }
  const needsSelection = !id && accounts.length > 1;
  const name = accounts.find((a) => a.id === id)?.name ?? null;
  const message = id
    ? ""
    : needsSelection
      ? "This token can see more than one account. Choose which to use."
      : "Could not determine your Cloudflare account. Check the token's account access.";
  return { id: id || null, name, needsSelection, options: accounts, message };
}

/** Read-only setup checks. Never throws - failures fold into the diagnostics. */
export async function getDiagnostics(
  env: Env,
  webAddresses: { hostname: string; routingMode: RoutingMode }[],
): Promise<CfDiagnosticsDto> {
  const { token, source } = await resolveToken(env);
  const workerName = workerNameOf(env);
  if (!token) return baseDiagnostics(env, source);

  let tokenOk = false;
  let tokenMessage: string;
  try {
    const verify = await cfGet<{ status?: string }>(token, "/user/tokens/verify");
    tokenOk = verify.success && verify.result?.status === "active";
    tokenMessage = tokenOk
      ? "Token is valid and active."
      : "Token is invalid or inactive. Check its permissions.";
  } catch {
    tokenMessage = "Could not reach the Cloudflare API.";
  }
  if (!tokenOk) {
    return { ...baseDiagnostics(env, source), configured: true, token: { ok: false, message: tokenMessage } };
  }

  const account = await resolveAccount(env, token);
  const connected = {
    configured: true,
    canSaveToken: canSaveToken(env),
    tokenSource: source,
    workerName,
    token: { ok: true, message: tokenMessage },
    account,
  };

  if (!account.id) {
    return {
      ...connected,
      routing: { checked: false, message: account.message || "Select an account to check routing.", truncated: false, zones: [] },
      webAddresses: [],
    };
  }

  const zones = await fetchAccountZones(token, account.id);
  const toCheck = zones.slice(0, ZONE_CAP);
  const routesByZone = new Map<string, CfRoute[]>();
  const zoneResults = await Promise.all(
    toCheck.map(async (z) => {
      let routes: CfRoute[] = [];
      try {
        const resp = await cfGet<CfRoute[]>(token, `/zones/${z.id}/workers/routes`);
        routes = resp.result ?? [];
      } catch {
        /* leave empty -> "no routes" */
      }
      routesByZone.set(z.id, routes);
      const analysis = analyzeRoutes(routes, workerName);
      return { id: z.id, zone: z.name, ok: analysis.ok, routes: analysis.routes, message: analysis.message };
    }),
  );
  const routed = zoneResults.filter((z) => z.ok).length;
  const routingMessage =
    zones.length === 0
      ? "No zones found on this account."
      : routed > 0
        ? `${routed} of ${zoneResults.length} zone(s) route subdomains to this app.`
        : "No zone routes subdomains to this app yet. Add a wildcard route like *.<your-zone>/* on the zone you use.";
  const routing = {
    checked: zones.length > 0,
    message: routingMessage,
    truncated: zones.length > ZONE_CAP,
    zones: zoneResults,
  };

  const webAddressStatus = await Promise.all(
    webAddresses.map(async (wa) => {
      const zone = zoneForHostname(wa.hostname, zones);
      const routes = zone ? routesByZone.get(zone.id) ?? [] : [];
      const proxied = zone ? await isProxiedHost(token, zone.id, wa.hostname) : false;
      return analyzeWebAddress(wa.hostname, wa.routingMode, zone, routes, proxied, workerName);
    }),
  );

  return { ...connected, routing, webAddresses: webAddressStatus };
}

/** Is there a proxied DNS record for this exact hostname? */
async function isProxiedHost(token: string, zoneId: string, hostname: string): Promise<boolean> {
  try {
    const query = new URLSearchParams({ "name.exact": hostname });
    const list = await cfGet<DnsRecord[]>(token, `/zones/${zoneId}/dns_records?${query.toString()}`);
    return (list.result ?? []).some((r) => r.proxied === true);
  } catch {
    return false;
  }
}

/** Persist the operator's account choice (validated against the token's accounts). */
export async function selectAccount(env: Env, accountId: string): Promise<{ ok: boolean; message: string }> {
  const { token } = await resolveToken(env);
  if (!token) return { ok: false, message: "Connect a token first." };
  const accounts = await fetchAccounts(token);
  if (!accounts.some((a) => a.id === accountId)) {
    return { ok: false, message: "That account is not available to this token." };
  }
  try {
    await setSelectedAccount(env, accountId);
    return { ok: true, message: "Account selected." };
  } catch {
    return { ok: false, message: "Could not save the selection. Please try again." };
  }
}

interface DnsRecord {
  id: string;
  type: string;
  content: string;
  proxied?: boolean;
}
interface CfRouteFull {
  id: string;
  pattern: string;
  script: string | null;
}

const NO_PERMISSION_MESSAGE =
  "The connected Cloudflare token is not allowed to make these changes. Create a new token with the button above (it needs DNS and Workers Routes edit access) and save it, then try again.";

function isNoPermission(status: number, body: Envelope<unknown>): boolean {
  if (status === 403) return true;
  return (body.errors ?? []).some((e) => e.code === 9109 || e.code === 10000);
}

function isPlaceholder(r: DnsRecord): boolean {
  return r.type === "AAAA" && r.content === "100::";
}

function tlsNoteFor(zone: string): string {
  return `Addresses one level deep (like go.${zone}) get a security certificate automatically. Deeper ones such as a.b.${zone} need Cloudflare's Advanced Certificate Manager.`;
}

type StepCode = "no_permission" | "api_error" | "route_conflict";

/** Ensure a proxied placeholder record exists for a name (create or flip to proxied). */
async function ensureProxiedRecord(
  token: string,
  zoneId: string,
  recordName: string,
): Promise<{ ok: boolean; state?: "created" | "updated" | "exists"; code?: StepCode }> {
  try {
    const query = new URLSearchParams({ "name.exact": recordName });
    const list = await cfGet<DnsRecord[]>(token, `/zones/${zoneId}/dns_records?${query.toString()}`);
    const placeholder = (list.result ?? []).find(isPlaceholder);
    if (placeholder) {
      if (placeholder.proxied) return { ok: true, state: "exists" };
      const patched = await cfSend(token, "PATCH", `/zones/${zoneId}/dns_records/${placeholder.id}`, { proxied: true });
      if (!patched.body.success) return { ok: false, code: isNoPermission(patched.status, patched.body) ? "no_permission" : "api_error" };
      return { ok: true, state: "updated" };
    }
    const created = await cfSend(token, "POST", `/zones/${zoneId}/dns_records`, {
      type: "AAAA",
      name: recordName,
      content: "100::",
      proxied: true,
      ttl: 1,
    });
    if (!created.body.success) return { ok: false, code: isNoPermission(created.status, created.body) ? "no_permission" : "api_error" };
    return { ok: true, state: "created" };
  } catch {
    return { ok: false, code: "api_error" };
  }
}

/** Ensure a route for `pattern` points at our Worker (idempotent). */
async function ensureRoute(
  token: string,
  zoneId: string,
  pattern: string,
  workerName: string,
): Promise<{ ok: boolean; state?: "created" | "exists" | "conflict"; code?: StepCode; detail?: string }> {
  try {
    const routes = (await cfGet<CfRoute[]>(token, `/zones/${zoneId}/workers/routes`)).result ?? [];
    const existing = findRouteByPattern(routes, pattern);
    if (existing) {
      return existing.script === workerName ? { ok: true, state: "exists" } : { ok: false, state: "conflict", code: "route_conflict" };
    }
    const created = await cfSend<CfRoute>(token, "POST", `/zones/${zoneId}/workers/routes`, { pattern, script: workerName });
    if (created.body.success) return { ok: true, state: "created" };
    const codes = (created.body.errors ?? []).map((e) => e.code);
    if (created.status === 409 || codes.includes(10020)) {
      const now = findRouteByPattern((await cfGet<CfRoute[]>(token, `/zones/${zoneId}/workers/routes`)).result ?? [], pattern);
      if (now?.script === workerName) return { ok: true, state: "exists" };
      return { ok: false, state: "conflict", code: "route_conflict" };
    }
    if (isNoPermission(created.status, created.body)) return { ok: false, code: "no_permission" };
    return { ok: false, code: "api_error", detail: created.body.errors?.[0]?.message };
  } catch {
    return { ok: false, code: "api_error" };
  }
}

async function deleteRoute(token: string, zoneId: string, pattern: string): Promise<boolean> {
  try {
    const routes = (await cfGet<CfRouteFull[]>(token, `/zones/${zoneId}/workers/routes`)).result ?? [];
    const existing = routes.find((r) => r.pattern === pattern);
    if (!existing) return true;
    const del = await cfSend(token, "DELETE", `/zones/${zoneId}/workers/routes/${existing.id}`);
    return del.body.success;
  } catch {
    return false;
  }
}

/** Does this hostname already serve web content (an A/AAAA/CNAME that isn't our placeholder)? */
async function hasExistingSite(token: string, zoneId: string, hostname: string): Promise<boolean> {
  try {
    const query = new URLSearchParams({ "name.exact": hostname });
    const list = await cfGet<DnsRecord[]>(token, `/zones/${zoneId}/dns_records?${query.toString()}`);
    return (list.result ?? []).some((r) => ["A", "AAAA", "CNAME"].includes(r.type) && !isPlaceholder(r));
  } catch {
    return false;
  }
}

async function linkPathsFor(env: Env, hostname: string): Promise<string[]> {
  try {
    const rows = await getDb(env)
      .select({ path: links.path })
      .from(links)
      .innerJoin(domains, eq(links.domainId, domains.id))
      .where(eq(domains.hostname, hostname));
    return rows.map((r) => r.path);
  } catch {
    return [];
  }
}

function setupMessage(hostname: string, zoneName: string): string {
  return isWildcardHost(hostname)
    ? `Subdomains of ${zoneName} are now set up. New addresses like go.${zoneName} will work within a minute.`
    : `${hostname} is now set up. Your links on it will work within a minute.`;
}

function routeErrorMessage(detail?: string): string {
  if (detail && /does not exist/i.test(detail)) {
    return "This app's Worker is not deployed on your Cloudflare account yet, so a web route cannot point to it. Deploy the app first, then set this up. (Running it locally? Routing only works once the app is deployed.)";
  }
  return `Could not create the route${detail ? `: ${detail}` : ""}. Please try again.`;
}

/** Read-only: compute exactly what setupHostname would change, for confirmation.
 *  Makes no changes. */
export async function previewHostname(env: Env, hostname: string): Promise<SetupPlanDto> {
  const plan = (extra: Partial<SetupPlanDto>): SetupPlanDto => ({
    ok: true,
    code: "ok",
    hostname,
    mode: null,
    alreadyDone: false,
    steps: [],
    warning: "",
    message: "",
    ...extra,
  });
  const fail = (code: SetupPlanDto["code"], message: string): SetupPlanDto => plan({ ok: false, code, message });

  const { token } = await resolveToken(env);
  if (!token) return fail("no_token", "Connect Cloudflare first, then try again.");
  const account = await resolveAccount(env, token);
  if (!account.id) return fail("zone_not_found", account.message || "Could not determine your Cloudflare account.");
  const zones = await fetchAccountZones(token, account.id);
  const zone = zoneForHostname(hostname, zones);
  if (!zone) return fail("zone_not_found", `We could not find a Cloudflare domain for ${hostname}. Add its zone to this account first.`);
  if (zone.status !== "active") return fail("zone_inactive", `${zone.name} is not active on Cloudflare yet.`);

  let routes: CfRoute[];
  try {
    routes = (await cfGet<CfRoute[]>(token, `/zones/${zone.id}/workers/routes`)).result ?? [];
  } catch {
    return fail("api_error", "Could not reach Cloudflare just now. Please try again in a moment.");
  }
  const workerName = workerNameOf(env);

  const own = findRouteByPattern(routes, hostnameRoutePattern(hostname));
  if (own) {
    if (own.script !== workerName) return fail("route_conflict", `Another app already handles ${hostname}.`);
    return plan({ mode: "whole", alreadyDone: true, message: `${hostname} is already set up - nothing to change.` });
  }
  if (!isApexHost(hostname, zone.name) && !isWildcardHost(hostname)) {
    const wildcard = findSubdomainRoute(routes, zone.name);
    if (wildcard?.script === workerName) {
      return plan({ mode: "whole", alreadyDone: true, message: `${hostname} already works through your ${zone.name} subdomain setup - nothing to change.` });
    }
  }

  if (await hasExistingSite(token, zone.id, hostname)) {
    const paths = await linkPathsFor(env, hostname);
    const text =
      paths.length > 0
        ? `Add a web route for each of your ${paths.length} link${paths.length === 1 ? "" : "s"} on ${hostname}`
        : `Add a web route for each link you create on ${hostname}`;
    return plan({
      mode: "paths",
      steps: [{ icon: "route", text }],
      message: `${hostname} already has a website, so we'll only set up your specific link paths - the rest of ${hostname} stays untouched.`,
    });
  }

  return plan({
    mode: "whole",
    warning: isWildcardHost(hostname)
      ? `This sends ALL subdomains of ${zone.name} - including existing ones like www or mail - to this app.`
      : "",
    steps: [
      { icon: "dns", text: `Point ${hostname} at Cloudflare (a proxied DNS entry)` },
      { icon: "route", text: `Send ${hostname} traffic to this app` },
    ],
    message: isWildcardHost(hostname) ? `Catch every subdomain of ${zone.name} for your links.` : "",
  });
}

/** Wire a single hostname to this Worker. Picks the strategy automatically:
 *  a hostname with an existing website -> per-link path routes (coexist);
 *  otherwise -> whole-host catch-all + proxied placeholder. Idempotent. */
export async function setupHostname(env: Env, hostname: string): Promise<EnableResultDto> {
  const out = (
    ok: boolean,
    code: EnableResultDto["code"],
    message: string,
    extra: Partial<EnableResultDto> = {},
  ): EnableResultDto => ({ ok, code, message, dns: null, route: null, mode: null, tlsNote: "", ...extra });

  const { token } = await resolveToken(env);
  if (!token) return out(false, "no_token", "Connect Cloudflare first, then try again.");
  const account = await resolveAccount(env, token);
  if (!account.id) return out(false, "zone_not_found", account.message || "Could not determine your Cloudflare account.");
  const zones = await fetchAccountZones(token, account.id);
  const zone = zoneForHostname(hostname, zones);
  if (!zone) return out(false, "zone_not_found", `We could not find a Cloudflare domain for ${hostname}. Add its zone to this account first.`);
  if (zone.status !== "active") {
    return out(false, "zone_inactive", `${zone.name} is not finished connecting to Cloudflare yet. Make sure it shows as Active in Cloudflare, then try again.`);
  }

  const workerName = workerNameOf(env);
  const tlsNote = tlsNoteFor(zone.name);

  let routes: CfRoute[];
  try {
    routes = (await cfGet<CfRoute[]>(token, `/zones/${zone.id}/workers/routes`)).result ?? [];
  } catch {
    return out(false, "api_error", "Could not reach Cloudflare just now. Please try again in a moment.");
  }

  const conflictMsg = `Another app already handles ${hostname}. Remove that route in Cloudflare first - we will not overwrite it.`;

  // Already wired for the whole host? Make sure the DNS placeholder exists too.
  const own = findRouteByPattern(routes, hostnameRoutePattern(hostname));
  if (own) {
    if (own.script !== workerName) return out(false, "route_conflict", conflictMsg, { mode: "whole" });
    const rec = await ensureProxiedRecord(token, zone.id, hostname);
    return out(true, "ok", setupMessage(hostname, zone.name), { dns: rec.ok ? (rec.state ?? null) : null, route: "exists", mode: "whole", tlsNote });
  }
  // A plain subdomain already covered by the zone-wide wildcard?
  if (!isApexHost(hostname, zone.name) && !isWildcardHost(hostname)) {
    const wildcard = findSubdomainRoute(routes, zone.name);
    if (wildcard?.script === workerName) {
      return out(true, "covered", `${hostname} already works through your ${zone.name} subdomain setup. Nothing to do.`, { mode: "whole", tlsNote });
    }
  }

  // Existing website on this host -> coexist via per-link path routes (no DNS change).
  if (await hasExistingSite(token, zone.id, hostname)) {
    const paths = await linkPathsFor(env, hostname);
    for (const path of paths) {
      const r = await ensureRoute(token, zone.id, linkRoutePattern(hostname, path), workerName);
      if (r.code === "no_permission") return out(false, "no_permission", NO_PERMISSION_MESSAGE, { mode: "paths" });
      if (r.code === "api_error") return out(false, "api_error", routeErrorMessage(r.detail), { mode: "paths", tlsNote });
    }
    const msg =
      paths.length > 0
        ? `${hostname} already has a website, so we set up only your ${paths.length} specific link${paths.length === 1 ? "" : "s"} there. The rest of ${hostname} is untouched.`
        : `${hostname} already has a website, so we will add a route only for each link you create on it. The rest of ${hostname} stays as it is.`;
    return out(true, "ok", msg, { mode: "paths", route: paths.length > 0 ? "created" : null, tlsNote });
  }

  // Dedicated host -> whole-host catch-all. Create the ROUTE FIRST so a failure
  // (e.g. the Worker is not deployed yet) does not leave an orphan DNS record.
  const route = await ensureRoute(token, zone.id, hostnameRoutePattern(hostname), workerName);
  if (!route.ok) {
    if (route.code === "route_conflict") return out(false, "route_conflict", conflictMsg, { mode: "whole", tlsNote });
    if (route.code === "no_permission") return out(false, "no_permission", NO_PERMISSION_MESSAGE, { mode: "whole" });
    return out(false, "api_error", routeErrorMessage(route.detail), { mode: "whole", tlsNote });
  }
  const rec = await ensureProxiedRecord(token, zone.id, hostname);
  if (!rec.ok) {
    return out(false, rec.code ?? "api_error", rec.code === "no_permission" ? NO_PERMISSION_MESSAGE : "Could not set up the DNS entry. Please try again.", { route: route.state, mode: "whole", tlsNote });
  }
  return out(true, "ok", setupMessage(hostname, zone.name), { dns: rec.state, route: route.state, mode: "whole", tlsNote });
}

/** Add or remove the route for one link path on a hostname (paths mode). Best-effort. */
export async function syncLinkRoute(env: Env, hostname: string, path: string, action: "add" | "remove"): Promise<boolean> {
  const { token } = await resolveToken(env);
  if (!token) return false;
  const account = await resolveAccount(env, token);
  if (!account.id) return false;
  const zones = await fetchAccountZones(token, account.id);
  const zone = zoneForHostname(hostname, zones);
  if (!zone || zone.status !== "active") return false;
  const pattern = linkRoutePattern(hostname, path);
  if (action === "add") return (await ensureRoute(token, zone.id, pattern, workerNameOf(env))).ok;
  return deleteRoute(token, zone.id, pattern);
}

/** Remove the Cloudflare resources we created for a hostname (our routes for it +
 *  our placeholder DNS record). Only touches our own routes and the 100::
 *  placeholder - never the operator's real records. Best-effort, never throws. */
export async function teardownHostname(env: Env, hostname: string): Promise<void> {
  const { token } = await resolveToken(env);
  if (!token) return;
  const account = await resolveAccount(env, token);
  if (!account.id) return;
  const zones = await fetchAccountZones(token, account.id);
  const zone = zoneForHostname(hostname, zones);
  if (!zone) return;
  const workerName = workerNameOf(env);
  try {
    const routes = (await cfGet<CfRouteFull[]>(token, `/zones/${zone.id}/workers/routes`)).result ?? [];
    for (const r of routes) {
      if (r.script !== workerName) continue;
      if (r.pattern === hostnameRoutePattern(hostname) || r.pattern.startsWith(`${hostname}/`)) {
        await cfSend(token, "DELETE", `/zones/${zone.id}/workers/routes/${r.id}`);
      }
    }
  } catch {
    /* best-effort */
  }
  try {
    const query = new URLSearchParams({ "name.exact": hostname });
    const recs = (await cfGet<DnsRecord[]>(token, `/zones/${zone.id}/dns_records?${query.toString()}`)).result ?? [];
    for (const rec of recs) {
      if (isPlaceholder(rec)) await cfSend(token, "DELETE", `/zones/${zone.id}/dns_records/${rec.id}`);
    }
  } catch {
    /* best-effort */
  }
}

/** Verify an operator-pasted token with Cloudflare, then store it encrypted in D1. */
export async function saveToken(env: Env, token: string): Promise<{ ok: boolean; message: string }> {
  if (!canSaveToken(env)) {
    return { ok: false, message: "Token storage is not available. Set CLOUDFLARE_API_TOKEN as a secret instead." };
  }
  const pasted = token.trim();
  if (!pasted) return { ok: false, message: "Please paste a token." };

  try {
    const verify = await cfGet<{ status?: string }>(pasted, "/user/tokens/verify");
    if (!(verify.success && verify.result?.status === "active")) {
      return { ok: false, message: "That token is invalid or inactive." };
    }
  } catch {
    return { ok: false, message: "Could not verify the token with Cloudflare." };
  }

  try {
    await writeStoredToken(env, pasted);
    return { ok: true, message: "Token saved." };
  } catch {
    return { ok: false, message: "Could not save the token. Please try again." };
  }
}

async function fetchAccounts(token: string): Promise<{ id: string; name: string }[]> {
  try {
    const resp = await cfGet<{ id: string; name: string }[]>(token, "/accounts?per_page=50");
    return resp.success && resp.result ? resp.result : [];
  } catch {
    return [];
  }
}

async function fetchAccountZones(token: string, accountId: string): Promise<CfZone[]> {
  const zones: CfZone[] = [];
  for (let page = 1; page <= 5; page++) {
    let resp: Envelope<CfZone[]>;
    try {
      resp = await cfGet<CfZone[]>(token, `/zones?account.id=${encodeURIComponent(accountId)}&per_page=50&page=${page}`);
    } catch {
      break;
    }
    if (!resp.success || !resp.result) break;
    zones.push(...resp.result);
    if (!resp.result_info || resp.result_info.page >= resp.result_info.total_pages) break;
  }
  return zones;
}
