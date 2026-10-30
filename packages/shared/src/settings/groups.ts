import { SETTING_KEYS, type SettingKey } from "./registry.js";

/**
 * Phase 7, spec 07: where each parameter is changed in the administrator's
 * panel. «Regole d'asta» holds the rules of the process (auction, guarantees,
 * issuance, renewals…), «Economia» the money (fees, invoices, remittances,
 * penalties, refunds, AI weights), «Sicurezza e dati» sessions, codes and
 * retention. Every key belongs to exactly one page (a test checks it).
 */
export type SettingsPage = "auctionRules" | "economy" | "system";

const PAGE_OF_PREFIX: Record<string, SettingsPage> = {
  calendar: "auctionRules",
  auction: "auctionRules",
  invitations: "auctionRules",
  guarantee: "auctionRules",
  reconfirmation: "auctionRules",
  requests: "auctionRules",
  batch: "auctionRules",
  verification: "auctionRules",
  documents: "auctionRules",
  notes: "auctionRules",
  drivingFormula: "auctionRules",
  vehicle: "auctionRules",
  rca: "auctionRules",
  consent: "auctionRules",
  acceptance: "auctionRules",
  issuance: "auctionRules",
  secondOffer: "auctionRules",
  renewal: "auctionRules",
  survey: "auctionRules",
  withdrawal: "auctionRules",
  backOffice: "auctionRules",
  agency: "auctionRules",
  fees: "economy",
  invoicing: "economy",
  remittance: "economy",
  brokerCommission: "economy",
  refunds: "economy",
  penalties: "economy",
  ai: "economy",
  session: "system",
  otp: "system",
  security: "system",
  retention: "system",
  complaints: "system",
  privacy: "system",
  support: "system",
  organizations: "system",
  team: "system",
  home: "system",
};

/** The group of a key: its first part («fees», «invoicing»…). */
export const settingGroupOf = (key: string): string => key.split(".")[0] ?? key;

/**
 * Parameters not shown in the panel, because changing them would change
 * nothing (audit of 2026-10-30): the top-up, gone (D6), still read by the
 * auctions opened before; the refund rules, the time zone and the retention
 * of contracts, fixed in the code until the lawyer validates them (G1); the
 * reminder of the RC professionale, no longer asked (ADR 0024).
 */
export const RETIRED_SETTING_KEYS: readonly SettingKey[] = [
  "invitations.topUp.checkAtFraction",
  "invitations.topUp.minOffers",
  "invitations.topUp.extra",
  "refunds.beforeIssuance",
  "refunds.afterIssuance",
  "calendar.timeZone",
  "retention.contractsYears",
  "organizations.profInsuranceReminderDays",
];

export function settingsPageOf(key: SettingKey): SettingsPage | undefined {
  if (RETIRED_SETTING_KEYS.includes(key)) return undefined;
  return PAGE_OF_PREFIX[settingGroupOf(key)];
}

/** The keys of a page, grouped in the order of the catalogue. */
export function settingsOfPage(page: SettingsPage): { group: string; keys: SettingKey[] }[] {
  const groups: { group: string; keys: SettingKey[] }[] = [];
  for (const key of SETTING_KEYS) {
    if (settingsPageOf(key) !== page) continue;
    const group = settingGroupOf(key);
    const found = groups.find((g) => g.group === group);
    if (found) found.keys.push(key);
    else groups.push({ group, keys: [key] });
  }
  return groups;
}

/** How the panel edits a value: money in euro, numbers, switches, lists, or the raw form. */
export type SettingInput = "money" | "number" | "boolean" | "text" | "json";

export function settingInputOf(key: string, value: unknown): SettingInput {
  if (/Cents$/.test(key) && typeof value === "number") return "money";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") return "text";
  return "json";
}
