import { z } from "zod";

/**
 * Catalogue of every business parameter (CLAUDE.md rule 7).
 * Default values live in seed/parametri.json; the administrator changes them later.
 * Money in integer cents, as required by FEE-07.
 */
const cents = z.number().int().nonnegative();
const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
const fraction = z.number().gt(0).lt(1);
const unitInterval = z.number().min(0).max(1);
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const weekday = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);
const dayIntervals = z.array(
  z
    .tuple([clockTime, clockTime])
    .refine(([from, to]) => from < to, "interval must end after it starts"),
);

const aiWeights = z
  .object({
    price: unitInterval,
    coverage: unitInterval,
    companyComplaints: unitInterval,
    agencyIssuanceSpeed: unitInterval,
  })
  .strict()
  .refine(
    (w) => Math.abs(w.price + w.coverage + w.companyComplaints + w.agencyIssuanceSpeed - 1) < 1e-9,
    "weights must add up to 1",
  );

const weeklyHours = z
  .object({
    mon: dayIntervals,
    tue: dayIntervals,
    wed: dayIntervals,
    thu: dayIntervals,
    fri: dayIntervals,
    sat: dayIntervals,
    sun: dayIntervals,
  })
  .strict();

export const settingSchemas = {
  "calendar.timeZone": z.literal("Europe/Rome"),
  "calendar.workingHours": weeklyHours,
  /** Question 1 (Dan, 2026-10-19): the hours in which issuance time runs (EMI-01). */
  "issuance.workingHours": weeklyHours,
  "auction.durationsWorkingHours": z.array(positiveInt).nonempty(),
  "auction.defaultDurationWorkingHours": positiveInt,
  "auction.closingReminderMinutes": positiveInt,
  "auction.desertedReopen.enabled": z.boolean(),
  "auction.desertedReopen.workingHours": positiveInt,
  "auction.desertedReopen.maxAttempts": nonNegativeInt,
  "invitations.max": positiveInt,
  "invitations.topUp.checkAtFraction": fraction,
  "invitations.topUp.minOffers": nonNegativeInt,
  "invitations.topUp.extra": nonNegativeInt,
  "invitations.backOfficeWindowFraction": fraction,
  "invitations.minReceptionOverlapWorkingHours": positiveInt,
  "guarantee.minValidityDaysOptions": z.array(positiveInt).nonempty(),
  "guarantee.defaultMinValidityDays": positiveInt,
  "guarantee.reminderDaysBefore": positiveInt,
  "guarantee.reminderTime": clockTime,
  "backOffice.recentAuctionsDays": positiveInt,
  "agency.dashboard.statsDays": positiveInt,
  "agency.dashboard.closingSoonMinutes": positiveInt,
  "agency.defaultFilter.maxStartDateDays": positiveInt,
  "agency.defaultFilter.maxGuaranteeDays": positiveInt,
  "reconfirmation.workingHours": positiveInt,
  "reconfirmation.maxPerRequest": nonNegativeInt,
  "requests.autoCancelExpiredDays": positiveInt,
  "issuance.deadlineWorkingHours": positiveInt,
  "issuance.reminderMinutesBefore": positiveInt,
  "secondOffer.customerConfirmHours": positiveInt,
  "renewal.daysBefore": positiveInt,
  "renewal.brokerHorizonDays": positiveInt,
  "survey.daysAfterIssuance": positiveInt,
  "survey.linkValidDays": positiveInt,
  "withdrawal.days": positiveInt,
  "fees.private.amountCents": cents,
  "fees.private.aiSupplementCents": cents,
  "fees.private.lowPremium.thresholdCents": cents,
  "fees.private.lowPremium.amountCents": cents,
  "fees.broker.amountCents": cents,
  "fees.agency.amountCents": cents,
  "invoicing.vatNature": z.string().regex(/^N\d(\.\d)?$/),
  "invoicing.legalReference": z.string().min(1),
  "invoicing.stampDuty.thresholdCents": cents,
  "invoicing.stampDuty.amountCents": cents,
  "invoicing.stampDuty.chargedTo": z.enum(["RECIPIENT", "ASTAX"]),
  "invoicing.brokerPaymentTermDays": positiveInt,
  "remittance.runDay": weekday,
  "remittance.cutoff": z.object({ day: weekday, time: clockTime }).strict(),
  "brokerCommission.enabled": z.boolean(),
  "withdrawal.onPlatform": z.boolean(),
  "brokerCommission.percentOfNetPremium": z.number().min(0).max(100),
  "refunds.beforeIssuance": z.enum(["FULL_INCLUDING_FEE", "PREMIUM_ONLY"]),
  "refunds.afterIssuance": z.enum([
    "PREMIUM_PER_COMPANY_TERMS_FEE_RETAINED",
    "PREMIUM_PER_COMPANY_TERMS_FEE_REFUNDED",
  ]),
  "penalties.lateIssuanceCents": cents,
  "penalties.missedIssuanceCents": cents,
  "penalties.circumventionCents": cents,
  "penalties.contestDays": positiveInt,
  "penalties.suspension.missedIssuances": positiveInt,
  "penalties.suspension.windowMonths": positiveInt,
  "ai.weights": aiWeights,
  "ai.explanationMaxChars": positiveInt,
  "documents.confidenceThreshold": unitInterval,
  "verification.autoApproveGreen": z.boolean(),
  "home.publicData.enabled": z.boolean(),
  "home.publicData.minClosedAuctions": positiveInt,
  "home.publicData.windowDays": positiveInt,
  "documents.maxUploadMb": positiveInt,
  "documents.maxFilesPerDocument": positiveInt,
  "notes.maxChars": positiveInt,
  "drivingFormula.expertMinAge": positiveInt,
  "session.privateDays": positiveInt,
  "session.privateMaxDays": positiveInt,
  "session.professionalIdleHours": positiveInt,
  "session.staffIdleHours": positiveInt,
  "retention.incompleteRequestsMonths": positiveInt,
  "retention.contractsYears": positiveInt,
  "complaints.responseDays": positiveInt,
  "complaints.reminderDaysBefore": positiveInt,
  "privacy.requestResponseDays": positiveInt,
  "support.responseHours": positiveInt,
  "security.loginMaxFailures": positiveInt,
  "security.loginLockMinutes": positiveInt,
  "security.emailCodesPerAddressPerHour": positiveInt,
  "security.codesPerDestinationPerHour": positiveInt,
  "security.publicRequestsPerMinute": positiveInt,
  "security.publicApplicationsPerHour": positiveInt,
  "security.failedAuthPerMinute": positiveInt,
  "requests.bulkMaxRows": positiveInt,
  "batch.auctionDaysBeforeExpiry": positiveInt,
  "batch.documentsDaysBeforeAuction": positiveInt,
  "organizations.profInsuranceReminderDays": positiveInt,
  "otp.validityMinutes": positiveInt,
  "otp.maxAttempts": positiveInt,
  "otp.resendWaitSeconds": positiveInt,
  "team.inviteValidityDays": positiveInt,
  "vehicle.vintageAgeYears": positiveInt,
  "consent.linkValidityDays": positiveInt,
  "rca.legalMinimums": z
    .object({ bodilyInjuryPerClaimEur: positiveInt, propertyDamagePerClaimEur: positiveInt })
    .strict(),
  "requests.codePrefix": z.string().regex(/^[A-Z]{2,5}$/),
} as const satisfies Record<string, z.ZodType>;

export type SettingKey = keyof typeof settingSchemas;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingSchemas)[K]>;
export type SettingValues = { [K in SettingKey]: SettingValue<K> };

export const SETTING_KEYS = Object.keys(settingSchemas) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(settingSchemas, key);
}

export function parseSettingValue<K extends SettingKey>(key: K, value: unknown): SettingValue<K> {
  return settingSchemas[key].parse(value) as SettingValue<K>;
}

/** Rules that tie two parameters together; they are checked on a complete set. */
export function crossSettingErrors(values: SettingValues): string[] {
  const errors: string[] = [];
  if (
    !values["auction.durationsWorkingHours"].includes(values["auction.defaultDurationWorkingHours"])
  ) {
    errors.push("auction.defaultDurationWorkingHours must be one of auction.durationsWorkingHours");
  }
  if (
    !values["guarantee.minValidityDaysOptions"].includes(values["guarantee.defaultMinValidityDays"])
  ) {
    errors.push("guarantee.defaultMinValidityDays must be one of guarantee.minValidityDaysOptions");
  }
  return errors;
}
