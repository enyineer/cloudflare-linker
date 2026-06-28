import { oc } from "@orpc/contract";
import { z } from "zod";
import { EMAIL_RE, HOSTNAME_RE, PATH_RE, SLUG_RE, isHttpUrl, normalizePath } from "./format.ts";
import { DOMAIN_KINDS, DOMAIN_STATUSES, REDIRECT_TYPES, ROUTING_MODES, USER_ROLES } from "./types.ts";

/**
 * oRPC contract: the single source of truth for the admin API. Imported by BOTH
 * the Worker (which implements it) and the SPA (which is typed from it). Pure -
 * no Env, no IO, no server deps - so it is safe in the client bundle.
 */

// ── reusable field schemas (input types stay client-friendly: string/number) ──

const id = z.number().int().positive();

const hostnameField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Please enter a web address.")
  .regex(HOSTNAME_RE, "That does not look like a valid web address (for example: go.example.com).");

const pathField = z
  .string()
  .trim()
  .min(1, 'Please enter a path, for example "/" or "/offer".')
  .transform((v) => normalizePath(v))
  .refine((v) => PATH_RE.test(v), "That path contains characters that are not allowed.");

const targetUrlField = z
  .string()
  .trim()
  .min(1, "Please enter where visitors should be sent.")
  .refine(isHttpUrl, "Enter a full web address starting with http:// or https://.");

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Please enter an email address.")
  .regex(EMAIL_RE, "That does not look like a valid email address.");

const redirectTypeField = z.literal(REDIRECT_TYPES, "Choose a redirect type: 301, 302, 307, or 308.");

const queryParamsField = z
  .array(z.object({ key: z.string(), value: z.string() }), "Extra options must be a list of key/value pairs.")
  .transform((arr) => arr.filter((p) => p.key.trim() !== "").map((p) => ({ key: p.key.trim(), value: p.value })));

const campaignIdField = z.number({ error: "That campaign selection is not valid." }).int().positive();

const enabledField = z.boolean({ error: "Use true or false for whether the link is on." });

const fallbackUrlField = z
  .string()
  .trim()
  .refine((v) => v === "" || isHttpUrl(v), "The fallback must be a full web address, or left blank.")
  .transform((v) => (v === "" ? null : v))
  .nullish();

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullish();

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SLUG_RE, "The short label can only use lowercase letters, numbers, and dashes.");

const roleField = z.enum(USER_ROLES, "Choose a role: admin, editor, or viewer.");

// ── input schemas (exported so they can be unit-tested directly) ──────────────

export const domainCreateSchema = z.object({
  hostname: hostnameField,
  kind: z.enum(DOMAIN_KINDS).default("subdomain"),
});
export const domainUpdateSchema = z.object({
  id,
  status: z.enum(["active", "disabled"], "Choose either active or disabled."),
});

export const linkCreateSchema = z.object({
  domainId: z
    .number({ error: "Please choose which web address this link belongs to." })
    .int()
    .positive("Please choose which web address this link belongs to."),
  path: pathField,
  targetUrl: targetUrlField,
  redirectType: redirectTypeField.default(301),
  queryParams: queryParamsField.default([]),
  campaignId: campaignIdField.nullish(),
  enabled: enabledField.default(true),
  fallbackUrl: fallbackUrlField,
  forwardQuery: z.boolean().default(false),
});
export const linkUpdateSchema = z.object({
  id,
  path: pathField.optional(),
  targetUrl: targetUrlField.optional(),
  redirectType: redirectTypeField.optional(),
  queryParams: queryParamsField.optional(),
  campaignId: campaignIdField.nullish(),
  enabled: enabledField.optional(),
  fallbackUrl: fallbackUrlField,
  forwardQuery: z.boolean().optional(),
});

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(1, "Please give this campaign a name."),
  slug: slugField.optional(),
  utmSource: optionalText,
  utmMedium: optionalText,
  utmCampaign: optionalText,
  notes: optionalText,
});
export const campaignUpdateSchema = z.object({
  id,
  name: z.string().trim().min(1, "Please give this campaign a name.").optional(),
  slug: slugField.optional(),
  utmSource: optionalText,
  utmMedium: optionalText,
  utmCampaign: optionalText,
  notes: optionalText,
});

export const userCreateSchema = z.object({ email: emailField, role: roleField });
export const userUpdateSchema = z.object({ email: emailField, role: roleField });
export const linkListSchema = z.object({ domainId: id.optional(), campaignId: id.optional() });

// ── output DTO schemas + inferred types ───────────────────────────────────────

const DomainDtoSchema = z.object({
  id: z.number(),
  hostname: z.string(),
  kind: z.enum(DOMAIN_KINDS),
  status: z.enum(DOMAIN_STATUSES),
  routingMode: z.enum(ROUTING_MODES),
  createdAt: z.string(),
});
const LinkDtoSchema = z.object({
  id: z.number(),
  domainId: z.number(),
  path: z.string(),
  targetUrl: z.string(),
  redirectType: z.literal(REDIRECT_TYPES),
  queryParams: z.array(z.object({ key: z.string(), value: z.string() })),
  campaignId: z.number().nullable(),
  enabled: z.boolean(),
  fallbackUrl: z.string().nullable(),
  forwardQuery: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const CampaignDtoSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  utmSource: z.string().nullable(),
  utmMedium: z.string().nullable(),
  utmCampaign: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
const UserDtoSchema = z.object({ email: z.string(), role: z.enum(USER_ROLES), createdAt: z.string() });
const CreatedUserDtoSchema = UserDtoSchema.extend({ tempPassword: z.string() });
const MeDtoSchema = z.object({ email: z.string(), role: z.enum(USER_ROLES) });
const PasskeyDtoSchema = z.object({ id: z.string(), label: z.string().nullable(), createdAt: z.string() });
export type PasskeyDto = z.infer<typeof PasskeyDtoSchema>;
const AuditEntryDtoSchema = z.object({
  id: z.number(),
  ts: z.string(),
  actor: z.string(),
  action: z.string(),
  summary: z.string(),
});
export type AuditEntryDto = z.infer<typeof AuditEntryDtoSchema>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateField = z.string().regex(DATE_RE, "Use a date like 2026-01-31.").optional();

// Reusable analytics building blocks: a time series and a generic ranked breakdown.
const rangeSchema = z.object({ from: z.string(), to: z.string() });
const seriesSchema = z.array(z.object({ date: z.string(), clicks: z.number() }));
const breakdownSchema = z.array(z.object({ label: z.string(), clicks: z.number() }));

// `includeBots` overrides the global "hide bots" default for a single view.
export const overviewInputSchema = z.object({ from: dateField, to: dateField, includeBots: z.boolean().optional() });
export const statsInputSchema = z.object({ id, from: dateField, to: dateField, includeBots: z.boolean().optional() });

const OverviewDtoSchema = z.object({
  range: rangeSchema,
  totalClicks: z.number(),
  previousClicks: z.number(),
  botClicks: z.number(), // bot clicks in range (regardless of the includeBots filter)
  overTime: seriesSchema,
  byCampaign: breakdownSchema,
  topLinks: breakdownSchema,
  topCountries: breakdownSchema,
  topSources: breakdownSchema,
  byDevice: breakdownSchema,
  topReferrers: breakdownSchema,
});
const LinkStatsDtoSchema = z.object({
  range: rangeSchema,
  totalClicks: z.number(),
  previousClicks: z.number(),
  overTime: seriesSchema,
  topCountries: breakdownSchema,
  topSources: breakdownSchema,
  byDevice: breakdownSchema,
  byBrowser: breakdownSchema,
  topReferrers: breakdownSchema,
});
const CampaignStatsDtoSchema = z.object({
  range: rangeSchema,
  totalClicks: z.number(),
  previousClicks: z.number(),
  overTime: seriesSchema,
  byLink: breakdownSchema,
  topSources: breakdownSchema,
  topCountries: breakdownSchema,
  byDevice: breakdownSchema,
});
const DomainStatsDtoSchema = z.object({
  range: rangeSchema,
  totalClicks: z.number(),
  previousClicks: z.number(),
  overTime: seriesSchema,
  byLink: breakdownSchema,
  topSources: breakdownSchema,
  topCountries: breakdownSchema,
  byDevice: breakdownSchema,
});

export type DomainDto = z.infer<typeof DomainDtoSchema>;
export type LinkDto = z.infer<typeof LinkDtoSchema>;
export type CampaignDto = z.infer<typeof CampaignDtoSchema>;
export type UserDto = z.infer<typeof UserDtoSchema>;
export type MeDto = z.infer<typeof MeDtoSchema>;
export type OverviewDto = z.infer<typeof OverviewDtoSchema>;
export type LinkStatsDto = z.infer<typeof LinkStatsDtoSchema>;
export type CampaignStatsDto = z.infer<typeof CampaignStatsDtoSchema>;
export type DomainStatsDto = z.infer<typeof DomainStatsDtoSchema>;
export type Breakdown = z.infer<typeof breakdownSchema>;

// Analytics filtering + bot handling settings (global, admin-managed).
const SettingsDtoSchema = z.object({
  analyticsExcludeBots: z.boolean(),
  blockScannerPaths: z.boolean(),
  dropBotClicks: z.boolean(),
  flagDatacenterTraffic: z.boolean(),
  botManagementEnabled: z.boolean(),
  logUnmatchedPaths: z.boolean(),
  botScoreThreshold: z.number(),
  botRetentionDays: z.number(),
});
export type SettingsDto = z.infer<typeof SettingsDtoSchema>;
const settingsUpdateSchema = z.object({
  analyticsExcludeBots: z.boolean().optional(),
  blockScannerPaths: z.boolean().optional(),
  dropBotClicks: z.boolean().optional(),
  flagDatacenterTraffic: z.boolean().optional(),
  botManagementEnabled: z.boolean().optional(),
  logUnmatchedPaths: z.boolean().optional(),
  botScoreThreshold: z.number().int().min(1).max(99).optional(),
  botRetentionDays: z.number().int().min(1).max(3650).optional(),
});

const CfDiagnosticsDtoSchema = z.object({
  configured: z.boolean(),
  canSaveToken: z.boolean(),
  tokenSource: z.enum(["secret", "saved", "none"]),
  workerName: z.string(),
  token: z.object({ ok: z.boolean(), message: z.string() }),
  account: z.object({
    id: z.string().nullable(),
    name: z.string().nullable(),
    needsSelection: z.boolean(),
    options: z.array(z.object({ id: z.string(), name: z.string() })),
    message: z.string(),
  }),
  routing: z.object({
    checked: z.boolean(),
    message: z.string(),
    truncated: z.boolean(),
    zones: z.array(
      z.object({ id: z.string(), zone: z.string(), ok: z.boolean(), routes: z.array(z.string()), message: z.string() }),
    ),
  }),
  webAddresses: z.array(
    z.object({
      hostname: z.string(),
      zoneOnAccount: z.boolean(),
      routed: z.boolean(),
      proxied: z.boolean(),
      routingMode: z.enum(ROUTING_MODES),
      message: z.string(),
    }),
  ),
});
export type CfDiagnosticsDto = z.infer<typeof CfDiagnosticsDtoSchema>;

const setupCode = z.enum([
  "ok",
  "covered",
  "zone_inactive",
  "zone_not_found",
  "no_permission",
  "route_conflict",
  "no_token",
  "api_error",
]);
const enableStep = z.enum(["created", "updated", "exists", "conflict"]).nullable();
const EnableResultSchema = z.object({
  ok: z.boolean(),
  code: setupCode,
  message: z.string(),
  mode: z.enum(["whole", "paths"]).nullable(),
  dns: enableStep,
  route: enableStep,
  tlsNote: z.string(),
});
export type EnableResultDto = z.infer<typeof EnableResultSchema>;

// Read-only "what would happen" plan, shown for confirmation before any change.
const SetupPlanSchema = z.object({
  ok: z.boolean(),
  code: setupCode,
  hostname: z.string(),
  mode: z.enum(["whole", "paths"]).nullable(),
  alreadyDone: z.boolean(),
  steps: z.array(z.object({ icon: z.enum(["dns", "route"]), text: z.string() })),
  warning: z.string(),
  message: z.string(),
});
export type SetupPlanDto = z.infer<typeof SetupPlanSchema>;

// ── contract router ───────────────────────────────────────────────────────────

export const contract = {
  me: oc.output(MeDtoSchema),
  domains: {
    list: oc.output(z.array(DomainDtoSchema)),
    create: oc.input(domainCreateSchema).output(DomainDtoSchema),
    update: oc.input(domainUpdateSchema).output(DomainDtoSchema),
    delete: oc.input(z.object({ id })).output(z.void()),
    clearClicks: oc.input(z.object({ id })).output(z.object({ deleted: z.number() })),
  },
  links: {
    list: oc.input(linkListSchema).output(z.array(LinkDtoSchema)),
    create: oc.input(linkCreateSchema).output(LinkDtoSchema),
    update: oc.input(linkUpdateSchema).output(LinkDtoSchema),
    delete: oc.input(z.object({ id })).output(z.void()),
    clearClicks: oc.input(z.object({ id })).output(z.object({ deleted: z.number() })),
  },
  campaigns: {
    list: oc.output(z.array(CampaignDtoSchema)),
    create: oc.input(campaignCreateSchema).output(CampaignDtoSchema),
    update: oc.input(campaignUpdateSchema).output(CampaignDtoSchema),
    delete: oc.input(z.object({ id })).output(z.void()),
  },
  users: {
    list: oc.output(z.array(UserDtoSchema)),
    create: oc.input(userCreateSchema).output(CreatedUserDtoSchema),
    update: oc.input(userUpdateSchema).output(UserDtoSchema),
    delete: oc.input(z.object({ email: emailField })).output(z.void()),
    resetPassword: oc.input(z.object({ email: emailField })).output(z.object({ tempPassword: z.string() })),
  },
  passkeys: {
    list: oc.output(z.array(PasskeyDtoSchema)),
    delete: oc.input(z.object({ id: z.string().min(1) })).output(z.void()),
  },
  audit: {
    list: oc
      .input(z.object({ before: id.optional(), limit: z.number().int().min(1).max(200).optional() }))
      .output(z.array(AuditEntryDtoSchema)),
  },
  settings: {
    get: oc.output(SettingsDtoSchema),
    update: oc.input(settingsUpdateSchema).output(SettingsDtoSchema),
  },
  analytics: {
    overview: oc.input(overviewInputSchema).output(OverviewDtoSchema),
    link: oc.input(statsInputSchema).output(LinkStatsDtoSchema),
    campaign: oc.input(statsInputSchema).output(CampaignStatsDtoSchema),
    domain: oc.input(statsInputSchema).output(DomainStatsDtoSchema),
  },
  setup: {
    diagnostics: oc.output(CfDiagnosticsDtoSchema),
    saveToken: oc
      .input(z.object({ token: z.string().min(1, "Paste your Cloudflare API token.") }))
      .output(z.object({ ok: z.boolean(), message: z.string() })),
    selectAccount: oc
      .input(z.object({ accountId: z.string().min(1) }))
      .output(z.object({ ok: z.boolean(), message: z.string() })),
    previewHostname: oc.input(z.object({ hostname: z.string().min(1) })).output(SetupPlanSchema),
    setupHostname: oc.input(z.object({ hostname: z.string().min(1) })).output(EnableResultSchema),
  },
};
