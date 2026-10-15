/**
 * From the wizard's HTML forms to the draft sections of `quoteData`
 * (packages/shared, QuoteDraftSchema). Pure functions: the API validates the
 * result again, these only read and convert the fields.
 */
export interface FormReader {
  get(name: string): FormDataEntryValue | null;
  getAll(name: string): FormDataEntryValue[];
}

export function text(form: FormReader, name: string): string | undefined {
  const value = form.get(name);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function integer(form: FormReader, name: string): number | undefined {
  const value = text(form, name);
  if (value === undefined) return undefined;
  const digits = value.replace(/\./g, "");
  return /^-?\d+$/.test(digits) ? Number(digits) : Number.NaN;
}

export function checked(form: FormReader, name: string): boolean {
  return form.get(name) === "on" || form.get(name) === "true";
}

/** "1.234,56", "450", "450,5" → integer cents (CLAUDE.md rule 5); NaN when not an amount. */
export function eurosToCents(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const normalized = value.replace(/\s|€/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  const [units = "0", decimals = ""] = normalized.split(".");
  return Number(units) * 100 + Number(decimals.padEnd(2, "0"));
}

export function centsToEuros(cents: number | undefined): string {
  if (cents === undefined) return "";
  const units = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(units) : `${units},${String(rest).padStart(2, "0")}`;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function vehicleFromForm(form: FormReader) {
  return compact({
    plate: text(form, "vehicle.plate"),
    type: text(form, "vehicle.type"),
    use: text(form, "vehicle.use") ?? "PRIVATE",
    make: text(form, "vehicle.make"),
    model: text(form, "vehicle.model"),
    version: text(form, "vehicle.version"),
    fuel: text(form, "vehicle.fuel"),
    displacementCc: integer(form, "vehicle.displacementCc"),
    powerKw: integer(form, "vehicle.powerKw"),
    firstRegistrationDate: text(form, "vehicle.firstRegistrationDate"),
    purchaseDate: text(form, "vehicle.purchaseDate"),
    isNew: checked(form, "vehicle.isNew"),
    marketValueEur: integer(form, "vehicle.marketValueEur"),
    satelliteAlarm: checked(form, "vehicle.satelliteAlarm") ? true : undefined,
    nightParking: text(form, "vehicle.nightParking"),
    annualKmBand: text(form, "vehicle.annualKmBand"),
  });
}

/** Claims of the last five years plus the current one, one row per year with any claim. */
export function claimsFromForm(form: FormReader, years: readonly number[]) {
  return years.flatMap((year) => {
    const main = integer(form, `claims.${year}.main`) ?? 0;
    const shared = integer(form, `claims.${year}.shared`) ?? 0;
    return main === 0 && shared === 0
      ? []
      : [{ year, mainResponsibility: main, sharedResponsibility: shared }];
  });
}

export function historyFromForm(form: FormReader, years: readonly number[]) {
  const provenance = text(form, "history.provenance");
  const familyPlate = text(form, "history.familyRc.plate");
  const familyCode = text(form, "history.familyRc.relativeFiscalCode");
  return compact({
    provenance,
    cuClass: integer(form, "history.cuClass"),
    claims: claimsFromForm(form, years),
    riskUniqueId: text(form, "history.riskUniqueId")?.toUpperCase(),
    currentInsurer: text(form, "history.currentInsurer"),
    currentExpiryDate: text(form, "history.currentExpiryDate"),
    familyRc:
      provenance === "FAMILY_RC" && familyPlate && familyCode
        ? { plate: familyPlate, relativeFiscalCode: familyCode }
        : undefined,
  });
}

export interface PersonFields {
  surname?: string;
  givenName?: string;
  fiscalCode?: string;
  street?: string;
  postalCode?: string;
  municipality?: string;
  province?: string;
  profession?: string;
  maritalStatus?: string;
  children?: number;
}

/** The fields of a person block named `prefix` (policyHolder, vehicleOwner, driver1…). */
export function personFieldsFromForm(form: FormReader, prefix: string): PersonFields {
  return compact({
    surname: text(form, `${prefix}.surname`),
    givenName: text(form, `${prefix}.givenName`),
    fiscalCode: text(form, `${prefix}.fiscalCode`)?.replace(/\s/g, "").toUpperCase(),
    street: text(form, `${prefix}.street`),
    postalCode: text(form, `${prefix}.postalCode`),
    municipality: text(form, `${prefix}.municipality`),
    province: text(form, `${prefix}.province`)?.toUpperCase(),
    profession: text(form, `${prefix}.profession`),
    maritalStatus: text(form, `${prefix}.maritalStatus`),
    children: integer(form, `${prefix}.children`),
  });
}

export function licenceFromForm(form: FormReader, prefix: string) {
  return compact({
    category: text(form, `${prefix}.licence.category`),
    number: text(form, `${prefix}.licence.number`)?.replace(/\s/g, "").toUpperCase(),
    issuedOn: text(form, `${prefix}.licence.issuedOn`),
    expiresOn: text(form, `${prefix}.licence.expiresOn`),
  });
}

export function requestTermsFromForm(
  form: FormReader,
  defaults: { auctionDurationHours: number; minValidityDays: number },
) {
  const packageCode = text(form, "request.packageCode");
  return compact({
    packageCode,
    // Each package option carries its own version; the chosen one is kept.
    packageVersion:
      integer(form, `request.packageVersion.${packageCode ?? ""}`) ??
      integer(form, "request.packageVersion"),
    startDate: text(form, "request.startDate"),
    blackBox: checked(form, "request.blackBox"),
    paymentFrequency: "ANNUAL",
    auctionDurationHours:
      integer(form, "request.auctionDurationHours") ?? defaults.auctionDurationHours,
    minValidityDays: integer(form, "request.minValidityDays") ?? defaults.minValidityDays,
    currentPremiumCents: eurosToCents(text(form, "request.currentPremium")),
  });
}
