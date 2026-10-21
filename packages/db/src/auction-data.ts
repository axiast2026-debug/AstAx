import {
  AgencyFilterCriteriaSchema,
  effectiveRequirements,
  PackageRequirementsSchema,
  WeeklyHoursSchema,
  type AgencyCandidate,
  type AuctionSettings,
  type FilterableRequest,
  type PackageRequirements,
  type WorkingCalendar,
} from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import {
  requireSettingAt,
  type SettingKey,
  type SettingValue,
  type SettingVersion,
} from "@astax/shared/settings";
import type { DbTransaction } from "./client.js";
import type { QuoteRequest } from "./generated/prisma/client.js";

/**
 * What the API (preview in the verification card) and the worker (opening,
 * top-up, reopening) read to apply the auction rules of the domain. Callers
 * run these in a transaction whose context may read the agencies' rows: the
 * system, or AstAx staff.
 */

/** Parameter values in force at `at` (CLAUDE.md rule 7). */
export async function settingsAt<const K extends SettingKey>(
  tx: DbTransaction,
  keys: readonly K[],
  at: Date,
): Promise<{ [P in K]: SettingValue<P> }> {
  const rows = await tx.setting.findMany({ where: { key: { in: [...keys] } } });
  const versions = rows as unknown as SettingVersion[];
  const result = {} as { [P in K]: SettingValue<P> };
  for (const key of keys) result[key] = requireSettingAt(versions, key, at);
  return result;
}

/** The parameters an auction copies at its opening (ASTA-09). */
export const AUCTION_SETTING_KEYS = [
  "calendar.workingHours",
  "auction.durationsWorkingHours",
  "auction.closingReminderMinutes",
  "auction.desertedReopen.enabled",
  "auction.desertedReopen.workingHours",
  "auction.desertedReopen.maxAttempts",
  "invitations.max",
  "invitations.topUp.checkAtFraction",
  "invitations.topUp.minOffers",
  "invitations.topUp.extra",
  "invitations.backOfficeWindowFraction",
  "invitations.minReceptionOverlapWorkingHours",
  "guarantee.reminderDaysBefore",
  "guarantee.reminderTime",
  "reconfirmation.workingHours",
] as const;
export type AuctionSettingsSnapshot = {
  [K in (typeof AUCTION_SETTING_KEYS)[number]]: SettingValue<K>;
} & {
  /** ASTA-09: the national holidays in force at the opening, copied with the parameters. */
  "calendar.holidays"?: string[];
};

export function auctionSettingsAt(tx: DbTransaction, at: Date): Promise<AuctionSettingsSnapshot> {
  return settingsAt(tx, AUCTION_SETTING_KEYS, at);
}

export function auctionSettings(snapshot: AuctionSettingsSnapshot): AuctionSettings {
  return {
    closingReminderMinutes: snapshot["auction.closingReminderMinutes"],
    topUpCheckAtFraction: snapshot["invitations.topUp.checkAtFraction"],
    topUpMinOffers: snapshot["invitations.topUp.minOffers"],
    topUpExtra: snapshot["invitations.topUp.extra"],
    backOfficeWindowFraction: snapshot["invitations.backOfficeWindowFraction"],
    invitationsMax: snapshot["invitations.max"],
    minReceptionOverlapWorkingHours: snapshot["invitations.minReceptionOverlapWorkingHours"],
  };
}

/**
 * The working calendar: hours from the parameters (a snapshot of an open
 * auction, or the values in force) and the national holidays (ASTA-02).
 */
export async function loadWorkingCalendar(
  tx: DbTransaction,
  hours: SettingValue<"calendar.workingHours">,
  snapshot?: { "calendar.holidays"?: string[] },
): Promise<WorkingCalendar> {
  // An open auction keeps the holidays of its opening (ASTA-09).
  if (snapshot?.["calendar.holidays"]) {
    return { hours, holidays: new Set(snapshot["calendar.holidays"]) };
  }
  const holidays = await tx.holiday.findMany({ select: { date: true } });
  return {
    hours,
    holidays: new Set(holidays.map((h) => h.date.toISOString().slice(0, 10))),
  };
}

/** The derived columns of a submitted request, as the filters see them. */
export function filterableRequest(request: QuoteRequest, openedAt: Date): FilterableRequest | null {
  if (
    !request.vehicleType ||
    !request.province ||
    request.claimsLast5y === null ||
    request.youngestDriverAge === null ||
    !request.packageCode ||
    !request.startDate ||
    request.minValidityDays === null
  ) {
    return null;
  }
  const today = new Date(`${romeCalendarDate(openedAt)}T00:00:00.000Z`);
  return {
    vehicleType: request.vehicleType,
    province: request.province,
    cuClass: request.cuClass,
    claimsLast5y: request.claimsLast5y,
    youngestDriverAge: request.youngestDriverAge,
    packageCode: request.packageCode,
    // Question 1: a start set by the payment is as soon as possible.
    startInDays:
      request.startMode === "DATE"
        ? Math.round((request.startDate.getTime() - today.getTime()) / 86_400_000)
        : 0,
    minValidityDays: request.minValidityDays,
  };
}

/**
 * Every agency with what ASTA-05 looks at. `day` is the Rome calendar date of
 * the opening, for the daily capacity; a malformed filter counts as no filter.
 */
export async function loadAgencyCandidates(
  tx: DbTransaction,
  day: Date,
): Promise<AgencyCandidate[]> {
  // EMI-06, decision 30: an agency suspended (and not revoked) is out of the invitations.
  const suspended = await tx.agencySuspension.findMany({
    where: { revokedAt: null },
    select: { organizationId: true },
  });
  const agencies = await tx.organization.findMany({
    where: { type: "AGENCY", id: { notIn: suspended.map((x) => x.organizationId) } },
    orderBy: { id: "asc" },
  });
  const ids = agencies.map((a) => a.id);
  const [filters, capacities, mandates, memberships, invitations] = await Promise.all([
    tx.agencyFilter.findMany({ where: { organizationId: { in: ids } } }),
    tx.agencyCapacity.findMany({ where: { organizationId: { in: ids } } }),
    tx.agencyMandate.findMany({
      where: { organizationId: { in: ids }, verifiedAt: { not: null } },
      include: { company: true },
    }),
    tx.membership.findMany({ where: { organizationId: { in: ids }, status: "ACTIVE" } }),
    tx.invitation.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: ids } },
      _max: { invitedAt: true },
    }),
  ]);
  const dayStart = new Date(`${romeCalendarDate(day)}T00:00:00.000Z`);
  const today = await tx.$queryRaw<{ organizationId: string; count: bigint }[]>`
    SELECT "organizationId", count(*) AS count FROM "Invitation"
    WHERE (("invitedAt" AT TIME ZONE 'Europe/Rome')::date) = ${dayStart}::date
    GROUP BY "organizationId"`;
  const memberFilters = await tx.memberFilter.findMany({
    where: { membershipId: { in: memberships.map((m) => m.id) } },
  });

  return agencies.map((a) => {
    const filter = filters.find((f) => f.organizationId === a.id);
    const criteria = filter ? AgencyFilterCriteriaSchema.safeParse(filter.criteria) : null;
    const capacity = capacities.find((c) => c.organizationId === a.id);
    const reception = capacity ? WeeklyHoursSchema.safeParse(capacity.receptionHours) : null;
    const memberIds = new Set(
      memberships.filter((m) => m.organizationId === a.id).map((m) => m.id),
    );
    return {
      organizationId: a.id,
      active: a.status === "ACTIVE",
      criteria: criteria?.success ? criteria.data : null,
      distribution: capacity?.distribution ?? "ALL_USERS",
      memberCriteria: memberFilters
        .filter((f) => memberIds.has(f.membershipId))
        .flatMap((f) => {
          const parsed = AgencyFilterCriteriaSchema.safeParse(f.criteria);
          return parsed.success ? [parsed.data] : [];
        }),
      pausedUntil: capacity?.pausedUntil ?? null,
      dailyMax: capacity?.dailyMax ?? null,
      invitationsToday: Number(today.find((t) => t.organizationId === a.id)?.count ?? 0),
      receptionHours: reception?.success ? reception.data : null,
      mandatedCompanies: mandates
        .filter((m) => m.organizationId === a.id && m.company.active)
        .map((m) => m.companyId),
      lastInvitedAt: invitations.find((i) => i.organizationId === a.id)?._max.invitedAt ?? null,
    };
  });
}

/**
 * EMI-01, question 1: the calendar of the issuance deadline, the issuance
 * hours (issuance.workingHours, Monday to Friday 9-19) with the holidays.
 */
export async function loadIssuanceCalendar(tx: DbTransaction, at: Date): Promise<WorkingCalendar> {
  const { "issuance.workingHours": hours } = await settingsAt(tx, ["issuance.workingHours"], at);
  return loadWorkingCalendar(tx, hours);
}

/**
 * OFF-06: the requirements an offer must meet for a request, from the version
 * of its package in force at `at` (the opening of the auction, ASTA-09; the
 * latest when omitted), with the coverages chosen for «CUSTOM». Null when the
 * request has no package or the version is not readable.
 */
export async function requestRequirements(
  tx: DbTransaction,
  request: { packageCode: string | null; chosenCoverages: string[] },
  at?: Date,
): Promise<PackageRequirements | null> {
  if (!request.packageCode) return null;
  const version = await tx.coveragePackageVersion.findFirst({
    where: { packageCode: request.packageCode, ...(at ? { validFrom: { lte: at } } : {}) },
    orderBy: { version: "desc" },
  });
  const parsed = PackageRequirementsSchema.safeParse(version?.requirements);
  if (!parsed.success) return null;
  return effectiveRequirements(request.packageCode, parsed.data, request.chosenCoverages);
}
