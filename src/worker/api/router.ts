import { ORPCError } from "@orpc/server";
import { and, eq, type SQL } from "drizzle-orm";
import { getDb } from "../../db/client.ts";
import { campaigns, clicks, domains, links, users } from "../../db/schema.ts";
import { SLUG_RE, slugify } from "../../shared/format.ts";
import { can } from "../../shared/roles.ts";
import { getCampaignStats, getDomainStats, getLinkStats, getOverview } from "../analytics.ts";
import { resolveRange } from "../analytics-range.ts";
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
import { toCampaignDto, toDomainDto, toLinkDto, toUserDto } from "./serializers.ts";

const serverError = () => new ORPCError("INTERNAL_SERVER_ERROR");

async function assertDomainExists(env: Env, domainId: number): Promise<void> {
  const [row] = await getDb(env).select({ id: domains.id }).from(domains).where(eq(domains.id, domainId)).limit(1);
  if (!row) badRequestError("That web address could not be found.");
}

async function assertCampaignExists(env: Env, campaignId: number): Promise<void> {
  const [row] = await getDb(env).select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!row) badRequestError("That campaign could not be found.");
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
      try {
        const [row] = await getDb(context.env).update(links).set(set).where(eq(links.id, id)).returning();
        if (!row) notFoundError("That link could not be found.");
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
      try {
        const [row] = await getDb(context.env).insert(users).values({ email: input.email, role: input.role }).returning();
        if (!row) throw serverError();
        return toUserDto(row);
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
  },

  analytics: {
    overview: authed.analytics.overview.handler(async ({ input, context }) => {
      const range = resolveRange(input.from, input.to, new Date());
      return getOverview(context.env, range);
    }),
    link: authed.analytics.link.handler(async ({ input, context }) => {
      const range = resolveRange(input.from, input.to, new Date());
      return getLinkStats(context.env, range, input.id);
    }),
    campaign: authed.analytics.campaign.handler(async ({ input, context }) => {
      const range = resolveRange(input.from, input.to, new Date());
      return getCampaignStats(context.env, range, input.id);
    }),
    domain: authed.analytics.domain.handler(async ({ input, context }) => {
      const range = resolveRange(input.from, input.to, new Date());
      return getDomainStats(context.env, range, input.id);
    }),
  },
});
