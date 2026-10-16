import {
  filterMismatches,
  type AgencyFilterCriteria,
  type FilterableRequest,
  type FilterMismatch,
} from "./agency-filters.js";
import {
  workingOverlapMinutes,
  type WeeklyHours,
  type WorkingCalendar,
} from "./working-calendar.js";

/**
 * Choice of the agencies to invite (ASTA-05, ASTA-04, ASTA-08). Pure: the
 * caller loads the agencies with their filters, capacity and history.
 */

export interface AgencyCandidate {
  organizationId: string;
  /** Organization status: only ACTIVE agencies are invited (suspension, EMI-06). */
  active: boolean;
  criteria: AgencyFilterCriteria | null;
  /** BY_MEMBER_FILTERS: at least one member with compatible filters is needed. */
  distribution: "ALL_USERS" | "BY_MEMBER_FILTERS";
  memberCriteria: readonly AgencyFilterCriteria[];
  pausedUntil: Date | null;
  dailyMax: number | null;
  /** Invitations received on the Rome calendar day of the opening. */
  invitationsToday: number;
  receptionHours: WeeklyHours | null;
  /** Companies of the verified mandates. */
  mandatedCompanies: readonly string[];
  lastInvitedAt: Date | null;
}

export type RejectionReason =
  | "NOT_ACTIVE"
  | "NO_FILTERS"
  | "PAUSED"
  | "DAILY_CAPACITY"
  | "RECEPTION_HOURS"
  | "NO_COMPANY"
  | "NO_MEMBER_FILTERS"
  | "ALREADY_INVITED"
  | "EXCLUDED_BY_BACK_OFFICE"
  | FilterMismatch;

export interface SelectionInput {
  request: FilterableRequest;
  candidates: readonly AgencyCandidate[];
  calendar: WorkingCalendar;
  openedAt: Date;
  closeAt: Date;
  /** ASTA-05: minimum overlap of the reception hours with the auction. */
  minReceptionOverlapMinutes: number;
  /** Maximum number to invite; null = all the compatible ones (ASTA-08). */
  limit: number | null;
  /** Agencies of this round already invited: not again, their companies count as covered. */
  alreadyInvited: readonly { organizationId: string; companies: readonly string[] }[];
  /** ASTA-06: agencies the back office left out of the preview. */
  excluded: readonly string[];
  /** False for the reopening of a deserted auction: no rotation (ASTA-08). */
  rotation: boolean;
}

export interface SelectedAgency {
  organizationId: string;
  /** Companies the agency may offer with on this request. */
  companies: string[];
  /** Companies it adds to those already covered when chosen. */
  newCompanies: string[];
}

export interface Selection {
  selected: SelectedAgency[];
  /** The compatible agencies left out only because of the limit. */
  compatibleNotChosen: string[];
  rejected: { organizationId: string; reasons: RejectionReason[] }[];
}

/** Companies the agency may offer with: its mandates, within its filter. */
function companiesOf(c: AgencyCandidate): string[] {
  const wanted = c.criteria?.companies ?? [];
  return c.mandatedCompanies.filter((id) => wanted.includes(id));
}

function rejections(c: AgencyCandidate, input: SelectionInput): RejectionReason[] {
  const reasons: RejectionReason[] = [];
  if (input.alreadyInvited.some((a) => a.organizationId === c.organizationId)) {
    return ["ALREADY_INVITED"];
  }
  if (input.excluded.includes(c.organizationId)) return ["EXCLUDED_BY_BACK_OFFICE"];
  if (!c.active) reasons.push("NOT_ACTIVE");
  if (!c.criteria) return [...reasons, "NO_FILTERS"];
  reasons.push(...filterMismatches(c.criteria, input.request));
  if (c.pausedUntil && c.pausedUntil > input.openedAt) reasons.push("PAUSED");
  if (c.dailyMax !== null && c.invitationsToday >= c.dailyMax) reasons.push("DAILY_CAPACITY");
  const overlap = c.receptionHours
    ? workingOverlapMinutes(input.calendar, input.openedAt, input.closeAt, c.receptionHours)
    : 0;
  if (overlap < input.minReceptionOverlapMinutes) reasons.push("RECEPTION_HOURS");
  if (companiesOf(c).length === 0) reasons.push("NO_COMPANY");
  if (
    c.distribution === "BY_MEMBER_FILTERS" &&
    !c.memberCriteria.some((m) => filterMismatches(m, input.request).length === 0)
  ) {
    reasons.push("NO_MEMBER_FILTERS");
  }
  return reasons;
}

/** Never invited first, then the least recently invited; the id breaks ties. */
function byRotation(a: AgencyCandidate, b: AgencyCandidate): number {
  const ta = a.lastInvitedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const tb = b.lastInvitedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.organizationId < b.organizationId ? -1 : a.organizationId > b.organizationId ? 1 : 0;
}

/**
 * ASTA-05: among the compatible agencies, first those that add companies not
 * yet covered, then the ones invited least recently. Without rotation
 * (ASTA-08) every compatible agency is chosen, in a stable order.
 */
export function selectAgencies(input: SelectionInput): Selection {
  const rejected: Selection["rejected"] = [];
  const compatible: AgencyCandidate[] = [];
  for (const c of input.candidates) {
    const reasons = rejections(c, input);
    if (reasons.length === 0) compatible.push(c);
    else rejected.push({ organizationId: c.organizationId, reasons });
  }

  const ordered = input.rotation
    ? [...compatible].sort(byRotation)
    : [...compatible].sort((a, b) => (a.organizationId < b.organizationId ? -1 : 1));
  const covered = new Set(input.alreadyInvited.flatMap((a) => a.companies));
  const selected: SelectedAgency[] = [];
  const remaining = [...ordered];
  const limit = input.limit ?? Number.POSITIVE_INFINITY;

  while (selected.length < limit && remaining.length > 0) {
    // The first, in rotation order, that adds a company not yet covered;
    // when none adds one, simply the first in rotation order.
    const index = Math.max(
      0,
      remaining.findIndex((c) => companiesOf(c).some((id) => !covered.has(id))),
    );
    const [chosen] = remaining.splice(index, 1);
    if (!chosen) break;
    const companies = companiesOf(chosen);
    const newCompanies = companies.filter((id) => !covered.has(id));
    for (const id of companies) covered.add(id);
    selected.push({ organizationId: chosen.organizationId, companies, newCompanies });
  }

  return { selected, compatibleNotChosen: remaining.map((c) => c.organizationId), rejected };
}
