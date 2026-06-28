import { ORPCError } from "@orpc/server";
import { and, eq, or, type SQL } from "drizzle-orm";
import { getDb } from "../../db/client.ts";
import { campaigns, clicks, domains, links, users } from "../../db/schema.ts";
import { generateTempPassword, hashPassword } from "../password.ts";
import { SLUG_RE, slugify } from "../../shared/format.ts";
import { can } from "../../shared/roles.ts";
import { getCampaignStats, getDomainStats, getLinkStats, getOverview } from "../analytics.ts";
import { listAudit } from "../audit.ts";
import { resolveRange } from "../analytics-range.ts";
import {
  getDiagnostics,
  previewHostname,
  saveToken,
  selectAccount,
  setupHostname,
  syncLinkRoute,
  teardownHostname,
} from "../cloudflare.ts";
import { getSettings, updateSettings } from "../settings.ts";
import { deletePasskey, listPasskeys } from "../webauthn.ts";
import {
  authed,
  badRequestError,
  base,
  conflictError,
  definedOnly,
  forbid,
  isUniqueViolation,
  notFoundError,
} from "./orpc.ts";
import { toAuditDto, toCampaignDto, toDomainDto, toLinkDto, toPasskeyDto, toUserDto } from "./serializers.ts";

const serverError = () => new ORPCError("INTERNAL_SERVER_ERROR");

async function assertDomainExists(env: Env, domainId: number): Promise<void> {
  const [row] = await getDb(env).select({ id: domains.id }).from(domains).where(eq(domains.id, domainId)).limit(1);
  if (!row) badRequestError("That web address could not be found.");
}

async function assertCampaignExists(env: Env, campaignId: number): Promise<void> {
  const [row] = await getDb(env).select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!row) badRequestError("That campaign could not be found.");
}

/** When a link's web address is in "paths" mode, keep its Cloudflare route in
 *  sync. Best-effort: never blocks the link operation. */
async function manageLinkRoute(env: Env, domainId: number, path: string, action: "add" | "remove"): Promise<void> {
  try {
    const [d] = await getDb(env)
      .select({ hostname: domains.hostname, routingMode: domains.routingMode })
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);
    if (d?.routingMode === "paths") await syncLinkRoute(env, d.hostname, path, action);
  } catch {
    /* best-effort - a routing hiccup must not fail the link change */
  }
}

export const router = base.router({
  me: authed.me.handler(({ context }) => ({ email: context.user.email, role: context.user.role })),

  domains: {
    list: authed.domains.list.handler(async ({ context }) => {
      const rows = await getDb(context.env).select().from(domains).orderBy(domains.hostname);
      return rows.map(toDomainDto);
    }),
    create: authed.domains.create.handler(async ({ input, context }) => {
      if (!can(context.user.role, "writeDomains")) forbid("Only administrators can add web addresses.");
      const status = input.kind === "custom" ? "pending" : "active";
      try {
        const [row] = await getDb(context.env)
          .insert(domains)
          .values({ hostname: input.hostname, kind: input.kind, status })
          .returning();
        if (!row) throw serverError();
        return toDomainDto(row);
      } catch (err) {
        if (isUniqueViolation(err)) conflictError("That web address is already set up.");
        throw err;
      }
    }),
    update: authed.domains.update.handler(async ({ input, context }) => {
      if (!can(context.user.role, "writeDomains")) forbid("Only administrators can change web addresses.");
      const [row] = await getDb(context.env)
        .update(domains)
        .set({ status: input.status })
        .where(eq(domains.id, input.id))
        .returning();
      if (!row) notFoundError("That web address could not be found.");
      return toDomainDto(row);
    }),
    delete: authed.domains.delete.handler(async ({ input, context }) => {
      if (!can(context.user.role, "writeDomains")) forbid("Only administrators can remove web addresses.");
      const [row] = await getDb(context.env).delete(domains).where(eq(domains.id, input.id)).returning();
      if (!row) notFoundError("That web address could not be found.");
      // Best-effort: remove the Cloudflare routes + placeholder DNS we created for it.
      await teardownHostname(context.env, row.hostname).catch(() => {});
    }),
    clearClicks: authed.domains.clearClicks.handler(async ({ input, context }) => {
      if (!can(context.user.role, "writeDomains")) forbid("Only administrators can clear a web address's history.");
      const db = getDb(context.env);
      const [domain] = await db.select({ hostname: domains.hostname }).from(domains).where(eq(domains.id, input.id)).limit(1);
      if (!domain) notFoundError("That web address could not be found.");
      // Delete ALL clicks for this hostname - every path, every link, including
      // catch-all/scanner hits and orphaned rows that belong to no current link.
      const deleted = await db.$count(clicks, eq(clicks.hostname, domain.hostname));
      await db.delete(clicks).where(eq(clicks.hostname, domain.hostname));
      return { deleted };
    }),
  },

  links: {
    list: authed.links.list.handler(async ({ input, context }) => {
      const conditions: SQL[] = [];
      if (input.domainId !== undefined) conditions.push(eq(links.domainId, input.domainId));
      if (input.campaignId !== undefined) conditions.push(eq(links.campaignId, input.campaignId));
      const rows = await getDb(context.env)
        .select()
        .from(links)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(links.domainId, links.path);
      return rows.map(toLinkDto);
    }),
    create: authed.links.create.handler(async ({ input, context }) => {
      if (!can(context.user.role, "writeLinks")) forbid("You do not have permission to manage links.");
      await assertDomainExists(context.env, input.domainId);
      if (input.campaignId != null) await assertCampaignExists(context.env, input.campaignId);
      try {
        const [row] = await getDb(context.env)
          .insert(links)
          .values({
            domainId: input.domainId,
            path: input.path,
            targetUrl: input.targetUrl,
            redirectType: input.redirectType,
            queryParams: input.queryParams,
            campaignId: input.campaignId ?? null,
            enabled: input.enabled,
            fallbackUrl: input.fallbackUrl ?? null,
            forwardQuery: input.forwardQuery,
          })
          .returning();
        if (!row) throw serverError();
        await manageLinkRoute(context.env, row.domainId, row.path, "add");
        return toLinkDto(row);
      } catch (err) {
        if (isUniqueViolation(err)) conflictError("There is already a link for that path on this web address.");
        throw err;
      }
    }),
    update: authed.links.update.handler(async ({ input, context }) => {
      if (!can(context.user.role, "writeLinks")) forbid("You do not have permission to manage links.");
      const { id, ...rest } = input;
      if (rest.campaignId != null) await assertCampaignExists(context.env, rest.campaignId);
      const set = definedOnly(rest);
      if (Object.keys(set).length === 0) badRequestError("There is nothing to update.");
      const [before] = await getDb(context.env)
        .select({ domainId: links.domainId, path: links.path })
        .from(links)
        .where(eq(links.id, id))
        .limit(1);
      try {
        const [row] = await getDb(context.env).update(links).set(set).where(eq(links.id, id)).returning();
        if (!row) notFoundError("That link could not be found.");
        if (before && before.path !== row.path) {
          await manageLinkRoute(context.env, before.domainId, before.path, "remove");
          await manageLinkRoute(context.env, row.domainId, row.path, "add");
        }
        return toLinkDto(row);
      } catch (err) {
        if (isUniqueViolation(err)) conflictError("There is already a link for that path on this web address.");
        throw err;
      }
    }),
    delete: authed.links.delete.handler(async ({ input, context }) => {
      if (!can(context.user.role, "writeLinks")) forbid("You do not have permission to manage links.");
      const [row] = await getDb(context.env).delete(links).where(eq(links.id, input.id)).returning();
      if (!row) notFoundError("That link could not be found.");
      await manageLinkRoute(context.env, row.domainId, row.path, "remove");
    }),
    clearClicks: authed.links.clearClicks.handler(async ({ input, context }) => {
      if (!can(context.user.role, "writeLinks")) forbid("You do not have permission to manage links.");
      const db = getDb(context.env);
      const [link] = await db
        .select({ path: links.path, domainId: links.domainId })
        .from(links)
        .where(eq(links.id, input.id))
        .limit(1);
      if (!link) notFoundError("That link could not be found.");
      const [dom] = await db
        .select({ hostname: domains.hostname })
        .from(domains)
        .where(eq(domains.id, link.domainId))
        .limit(1);
      // Delete clicks attributed to this link by id, AND any clicks recorded for the
      // same hostname+path - which can be orphaned (link_id NULL) from an earlier
      // link that was deleted/recreated, and which is how the dashboard's "Top links"
      // groups them. Without this the link detail (by id) shows 0 while the homepage
      // still counts the orphaned rows.
      const byId = eq(clicks.linkId, input.id);
      const where = dom
        ? or(byId, and(eq(clicks.hostname, dom.hostname), eq(clicks.path, link.path)))
        : byId;
      if (!where) throw serverError();
      const deleted = await db.$count(clicks, where);
      await db.delete(clicks).where(where);
      return { deleted };
    }),
  },

  campaigns: {
    list: authed.campaigns.list.handler(async ({ context }) => {
      const rows = await getDb(context.env).select().from(campaigns).orderBy(campaigns.name);
      return rows.map(toCampaignDto);
    }),
    create: authed.campaigns.create.handler(async ({ input, context }) => {
      if (!can(context.user.role, "writeCampaigns")) forbid("You do not have permission to manage campaigns.");
      const slug = input.slug ?? slugify(input.name);
      if (!SLUG_RE.test(slug)) badRequestError("Please provide a short label (letters, numbers, dashes).");
      try {
        const [row] = await getDb(context.env)
          .insert(campaigns)
          .values({
            name: input.name,
            slug,
            utmSource: input.utmSource ?? null,
            utmMedium: input.utmMedium ?? null,
            utmCampaign: input.utmCampaign ?? slug,
            notes: input.notes ?? null,
          })
          .returning();
        if (!row) throw serverError();
        return toCampaignDto(row);
      } catch (err) {
        if (isUniqueViolation(err)) conflictError("That short label is already used by another campaign.");
        throw err;
      }
    }),
    update: authed.campaigns.update.handler(async ({ input, context }) => {
      if (!can(context.user.role, "writeCampaigns")) forbid("You do not have permission to manage campaigns.");
      const { id, ...rest } = input;
      const set = definedOnly(rest);
      if (Object.keys(set).length === 0) badRequestError("There is nothing to update.");
      try {
        const [row] = await getDb(context.env).update(campaigns).set(set).where(eq(campaigns.id, id)).returning();
        if (!row) notFoundError("That campaign could not be found.");
        return toCampaignDto(row);
      } catch (err) {
        if (isUniqueViolation(err)) conflictError("That short label is already used by another campaign.");
        throw err;
      }
    }),
    delete: authed.campaigns.delete.handler(async ({ input, context }) => {
      if (!can(context.user.role, "writeCampaigns")) forbid("You do not have permission to manage campaigns.");
      const db = getDb(context.env);
      const [existing] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, input.id)).limit(1);
      if (!existing) notFoundError("That campaign could not be found.");
      // Detach references explicitly (correct regardless of D1 FK enforcement).
      await db.batch([
        db.update(links).set({ campaignId: null }).where(eq(links.campaignId, input.id)),
        db.update(clicks).set({ campaignId: null }).where(eq(clicks.campaignId, input.id)),
        db.delete(campaigns).where(eq(campaigns.id, input.id)),
      ]);
    }),
  },

  users: {
    list: authed.users.list.handler(async ({ context }) => {
      if (!can(context.user.role, "manageUsers")) forbid("Only administrators can manage team members.");
      const rows = await getDb(context.env).select().from(users).orderBy(users.email);
      return rows.map(toUserDto);
    }),
    create: authed.users.create.handler(async ({ input, context }) => {
      if (!can(context.user.role, "manageUsers")) forbid("Only administrators can manage team members.");
      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);
      try {
        const [row] = await getDb(context.env)
          .insert(users)
          .values({ email: input.email, role: input.role, passwordHash, passwordSetAt: new Date() })
          .returning();
        if (!row) throw serverError();
        return { ...toUserDto(row), tempPassword };
      } catch (err) {
        if (isUniqueViolation(err)) conflictError("That person already has access. Edit their role instead.");
        throw err;
      }
    }),
    update: authed.users.update.handler(async ({ input, context }) => {
      if (!can(context.user.role, "manageUsers")) forbid("Only administrators can manage team members.");
      if (input.email === context.user.email) badRequestError("You cannot change your own role.");
      const [row] = await getDb(context.env)
        .update(users)
        .set({ role: input.role })
        .where(eq(users.email, input.email))
        .returning();
      if (!row) notFoundError("That team member could not be found.");
      return toUserDto(row);
    }),
    delete: authed.users.delete.handler(async ({ input, context }) => {
      if (!can(context.user.role, "manageUsers")) forbid("Only administrators can manage team members.");
      if (input.email === context.user.email) badRequestError("You cannot remove your own account.");
      const [row] = await getDb(context.env).delete(users).where(eq(users.email, input.email)).returning();
      if (!row) notFoundError("That team member could not be found.");
    }),
    resetPassword: authed.users.resetPassword.handler(async ({ input, context }) => {
      if (!can(context.user.role, "manageUsers")) forbid("Only administrators can manage team members.");
      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);
      const [row] = await getDb(context.env)
        .update(users)
        .set({ passwordHash, passwordSetAt: new Date() })
        .where(eq(users.email, input.email))
        .returning();
      if (!row) notFoundError("That team member could not be found.");
      return { tempPassword };
    }),
  },

  passkeys: {
    list: authed.passkeys.list.handler(async ({ context }) => {
      const rows = await listPasskeys(context.env, context.user.email);
      return rows.map(toPasskeyDto);
    }),
    delete: authed.passkeys.delete.handler(async ({ input, context }) => {
      const ok = await deletePasskey(context.env, context.user.email, input.id);
      if (!ok) notFoundError("That passkey could not be found.");
    }),
  },

  audit: {
    list: authed.audit.list.handler(async ({ input, context }) => {
      if (!can(context.user.role, "manageUsers")) forbid("Only administrators can view the audit log.");
      const rows = await listAudit(context.env, { limit: input.limit ?? 100, before: input.before });
      return rows.map(toAuditDto);
    }),
  },

  analytics: {
    overview: authed.analytics.overview.handler(async ({ input, context }) => {
      const range = resolveRange(input.from, input.to, new Date());
      const includeBots = input.includeBots ?? !(await getSettings(context.env)).analyticsExcludeBots;
      return getOverview(context.env, range, includeBots);
    }),
    link: authed.analytics.link.handler(async ({ input, context }) => {
      const range = resolveRange(input.from, input.to, new Date());
      const includeBots = input.includeBots ?? !(await getSettings(context.env)).analyticsExcludeBots;
      return getLinkStats(context.env, range, input.id, includeBots);
    }),
    campaign: authed.analytics.campaign.handler(async ({ input, context }) => {
      const range = resolveRange(input.from, input.to, new Date());
      const includeBots = input.includeBots ?? !(await getSettings(context.env)).analyticsExcludeBots;
      return getCampaignStats(context.env, range, input.id, includeBots);
    }),
    domain: authed.analytics.domain.handler(async ({ input, context }) => {
      const range = resolveRange(input.from, input.to, new Date());
      const includeBots = input.includeBots ?? !(await getSettings(context.env)).analyticsExcludeBots;
      return getDomainStats(context.env, range, input.id, includeBots);
    }),
  },

  settings: {
    get: authed.settings.get.handler(async ({ context }) => getSettings(context.env, true)),
    update: authed.settings.update.handler(async ({ input, context }) => {
      if (!can(context.user.role, "manageUsers")) forbid("Only administrators can change analytics settings.");
      return updateSettings(context.env, input);
    }),
  },

  setup: {
    diagnostics: authed.setup.diagnostics.handler(async ({ context }) => {
      if (!can(context.user.role, "manageUsers")) forbid("Only administrators can view setup diagnostics.");
      const rows = await getDb(context.env)
        .select({ hostname: domains.hostname, routingMode: domains.routingMode })
        .from(domains)
        .orderBy(domains.hostname);
      return getDiagnostics(context.env, rows);
    }),
    saveToken: authed.setup.saveToken.handler(async ({ input, context }) => {
      if (!can(context.user.role, "manageUsers")) forbid("Only administrators can manage the Cloudflare connection.");
      return saveToken(context.env, input.token);
    }),
    selectAccount: authed.setup.selectAccount.handler(async ({ input, context }) => {
      if (!can(context.user.role, "manageUsers")) forbid("Only administrators can manage the Cloudflare connection.");
      return selectAccount(context.env, input.accountId);
    }),
    previewHostname: authed.setup.previewHostname.handler(async ({ input, context }) => {
      if (!can(context.user.role, "writeDomains")) forbid("You do not have permission to set up web addresses.");
      return previewHostname(context.env, input.hostname);
    }),
    setupHostname: authed.setup.setupHostname.handler(async ({ input, context }) => {
      if (!can(context.user.role, "writeDomains")) forbid("You do not have permission to set up web addresses.");
      const result = await setupHostname(context.env, input.hostname);
      if (result.ok && result.mode) {
        await getDb(context.env)
          .update(domains)
          .set({ routingMode: result.mode })
          .where(eq(domains.hostname, input.hostname));
      }
      return result;
    }),
  },
});
