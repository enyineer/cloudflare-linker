/**
 * Cloudflare Linker - Worker entry point.
 *
 * `assets.run_worker_first` is true, so this Worker runs first on every request
 * and owns all routing. It is hostname-aware:
 *   - Admin host (configured admin domain / *.workers.dev / localhost):
 *       /api/* -> JSON API; everything else -> the React SPA via ASSETS.
 *   - Any other host: treated as a redirect host -> looked up in D1, with a
 *       non-blocking GDPR-safe click logged via ctx.waitUntil.
 */
import { getDb } from "../db/client.ts";
import { ensureMigrated } from "../db/migrate.ts";
import { campaigns, clicks, domains, links } from "../db/schema.ts";
import { RPCHandler } from "@orpc/server/fetch";
import { normalizeHostname, normalizePath } from "../shared/format.ts";
import { handleAuthRoutes } from "./api/auth-routes.ts";
import { router } from "./api/router.ts";
import { classifyBot, isScannerPath, looksLikeBrowser } from "./bot.ts";
import { buildClickRecord, extractUtm } from "./click.ts";
import { insertClick } from "./click-log.ts";
import { buildTarget, paramsFromSearch } from "./redirect.ts";
import { resolveRedirect } from "./resolve.ts";
import { purgeOldBotClicks } from "./retention.ts";
import { isAdminHost } from "./routing.ts";
import { getSettings } from "./settings.ts";

const rpcHandler = new RPCHandler(router);

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const hostname = normalizeHostname(url.hostname);

    if (isAdminHost(hostname, env.ADMIN_HOSTNAME)) {
      if (url.pathname.startsWith("/api/")) {
        return handleApi(request, url, env);
      }
      return env.ASSETS.fetch(request);
    }

    return handleRedirect(request, url, hostname, env, ctx);
  },

  // Daily cron: prune bot clicks past the retention window (see wrangler.jsonc triggers).
  async scheduled(_controller, env, _ctx): Promise<void> {
    try {
      await ensureMigrated(env.DB);
      await purgeOldBotClicks(env);
    } catch (err) {
      console.error("scheduled purge error:", err instanceof Error ? err.message : err);
    }
  },
} satisfies ExportedHandler<Env>;

// ── Redirect host ─────────────────────────────────────────────────────────────

async function handleRedirect(
  request: Request,
  url: URL,
  hostname: string,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  try {
    await ensureMigrated(env.DB);
    const path = normalizePath(url.pathname);
    const settings = await getSettings(env);
    const scannerProbe = isScannerPath(path);

    const resolved = await resolveRedirect(env, hostname, path, scannerProbe && settings.blockScannerPaths);
    if (!resolved) return notFound();

    let target: string;
    if (resolved.kind === "fallback") {
      target = resolved.url;
    } else {
      const incoming = resolved.forwardQuery ? paramsFromSearch(url.searchParams) : [];
      const built = buildTarget(resolved.targetUrl, resolved.queryParams, resolved.campaign, incoming);
      if (!built) return notFound();
      target = built;
    }

    const cf = request.cf;
    // cf is the loose CfProperties union here, so narrow each field at runtime
    // (botManagement is absent on the free plan; present only with Bot Management).
    const bm = cf?.botManagement;
    const botManagement =
      bm && typeof bm === "object"
        ? {
            score: "score" in bm && typeof bm.score === "number" ? bm.score : undefined,
            verifiedBot: "verifiedBot" in bm && typeof bm.verifiedBot === "boolean" ? bm.verifiedBot : undefined,
          }
        : null;
    const userAgent = request.headers.get("user-agent");
    const isBot = classifyBot(
      {
        userAgent,
        botManagement,
        asn: typeof cf?.asn === "number" ? cf.asn : null,
        browserLike: looksLikeBrowser(userAgent, request.headers.get("accept-language")),
        // Only treat a scanner-looking path as a bot signal when it fell through to
        // the catch-all; a link the operator explicitly created is never flagged.
        scannerProbe: scannerProbe && resolved.viaCatchAll,
      },
      {
        botScoreThreshold: settings.botScoreThreshold,
        flagDatacenterTraffic: settings.flagDatacenterTraffic,
        botManagementEnabled: settings.botManagementEnabled,
      },
    );
    const record = buildClickRecord({
      linkId: resolved.linkId,
      campaignId: resolved.campaignId,
      hostname,
      path,
      redirectType: resolved.status,
      userAgent,
      referer: request.headers.get("referer"),
      country: typeof cf?.country === "string" ? cf.country : null,
      region: typeof cf?.region === "string" ? cf.region : null,
      utm: extractUtm(url.searchParams),
      isBot,
    });
    // Skip logging when configured to drop bots, or to not log catch-all misses.
    const skipLog = (isBot && settings.dropBotClicks) || (resolved.viaCatchAll && !settings.logUnmatchedPaths);
    if (!skipLog) ctx.waitUntil(insertClick(env, record));

    return Response.redirect(target, resolved.status);
  } catch (err) {
    console.error("redirect error:", err instanceof Error ? err.message : err);
    return notFound();
  }
}

function notFound(): Response {
  return new Response(NOT_FOUND_HTML, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Link not found</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        background: #f6f8fb; color: #0f172a; }
      .box { text-align: center; padding: 32px; }
      h1 { font-size: 1.4rem; margin: 0 0 8px; }
      p { color: #64748b; margin: 0; }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>Link not found</h1>
      <p>This short link is not set up, or it has been turned off.</p>
    </div>
  </body>
</html>`;

// ── Admin host: JSON API ──────────────────────────────────────────────────────

async function handleApi(request: Request, url: URL, env: Env): Promise<Response> {
  // Health is public (liveness/DB check); everything else goes through oRPC.
  if (url.pathname === "/api/health" && request.method === "GET") {
    return handleHealth(env);
  }

  // Auth endpoints set/clear the session cookie, so they're plain routes (not oRPC).
  const authResponse = await handleAuthRoutes(request, url, env);
  if (authResponse) return authResponse;

  await ensureMigrated(env.DB);
  const { matched, response } = await rpcHandler.handle(request, {
    prefix: "/api",
    context: { env, request },
  });
  return matched ? response : Response.json({ error: "Not found" }, { status: 404 });
}

async function handleHealth(env: Env): Promise<Response> {
  const base = { status: "ok", service: "cloudflare-linker", time: new Date().toISOString() };

  try {
    await ensureMigrated(env.DB);
    const db = getDb(env);
    const [domainCount, linkCount, campaignCount, clickCount] = await Promise.all([
      db.$count(domains),
      db.$count(links),
      db.$count(campaigns),
      db.$count(clicks),
    ]);

    return Response.json({
      ...base,
      db: {
        connected: true,
        counts: {
          domains: domainCount,
          links: linkCount,
          campaigns: campaignCount,
          clicks: clickCount,
        },
      },
    });
  } catch (err) {
    return Response.json(
      {
        ...base,
        status: "degraded",
        db: { connected: false, error: err instanceof Error ? err.message : "Unknown error" },
      },
      { status: 503 },
    );
  }
}
