/**
 * Italian plates accepted by the request wizard (spec 09 §3: "formato italiano
 * auto o moto"). Anything else is treated as a foreign or temporary plate,
 * an excluded case that blocks the wizard (ASTA-10).
 *
 * - Car (since 1994): two letters, three digits, two letters ("AB123CD").
 *   The letters I, O, Q and U are never used.
 * - Motorcycle (since 1999): two letters and five digits ("AB12345").
 * - Moped (since 2006): six characters, letters and digits; the official
 *   pattern is a letter, a digit or letter, then four characters ("X2B4CD").
 *   We accept six letters and digits with at least one letter and one digit.
 */
export type PlateKind = "CAR" | "MOTORCYCLE" | "MOPED";

const PLATE_LETTER = "[A-HJ-NPR-TV-Z]";
const CAR = new RegExp(`^${PLATE_LETTER}{2}\\d{3}${PLATE_LETTER}{2}$`);
const MOTORCYCLE = new RegExp(`^${PLATE_LETTER}{2}\\d{5}$`);
const MOPED = /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{6}$/;

export function normalizePlate(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/** The plate kinds a plate's shape fits, most specific first. */
export function plateKinds(value: string): PlateKind[] {
  const plate = normalizePlate(value);
  const kinds: PlateKind[] = [];
  if (CAR.test(plate)) kinds.push("CAR");
  if (MOTORCYCLE.test(plate)) kinds.push("MOTORCYCLE");
  if (MOPED.test(plate)) kinds.push("MOPED");
  return kinds;
}

export function isItalianPlate(value: string): boolean {
  return plateKinds(value).length > 0;
}

/** Vehicle type codes of `seed/elenchi.json` and the plate shape they use. */
const PLATE_KIND_OF_VEHICLE: Record<string, PlateKind> = {
  CAR: "CAR",
  MOTORCYCLE: "MOTORCYCLE",
  MOPED: "MOPED",
};

/** True when the plate shape fits the declared vehicle type. */
export function plateFitsVehicleType(plate: string, vehicleType: string): boolean {
  const kind = PLATE_KIND_OF_VEHICLE[vehicleType];
  return kind !== undefined && plateKinds(plate).includes(kind);
}
