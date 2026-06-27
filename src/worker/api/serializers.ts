import type { Campaign, Domain, Link, User } from "../../db/schema.ts";
import type { CampaignDto, DomainDto, LinkDto, UserDto } from "../../shared/contract.ts";

/** Pure row -> wire DTO mappers (Date -> ISO string). Testable, no IO. */

export function toDomainDto(row: Domain): DomainDto {
  return {
    id: row.id,
    hostname: row.hostname,
    kind: row.kind,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toLinkDto(row: Link): LinkDto {
  return {
    id: row.id,
    domainId: row.domainId,
    path: row.path,
    targetUrl: row.targetUrl,
    redirectType: row.redirectType,
    queryParams: row.queryParams,
    campaignId: row.campaignId,
    enabled: row.enabled,
    fallbackUrl: row.fallbackUrl,
    forwardQuery: row.forwardQuery,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCampaignDto(row: Campaign): CampaignDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    utmSource: row.utmSource,
    utmMedium: row.utmMedium,
    utmCampaign: row.utmCampaign,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toUserDto(row: User): UserDto {
  return {
    email: row.email,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}
