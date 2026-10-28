/**
 * Check digit of an Italian VAT number (partita IVA): eleven digits, the last
 * one computed from the first ten (odd positions summed, even positions doubled
 * with 9 subtracted above 9).
 */
export function vatNumberCheckDigit(firstTen: string): number {
  if (!/^\d{10}$/.test(firstTen)) throw new Error("A VAT number body is 10 digits");
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const digit = Number(firstTen[i]);
    if (i % 2 === 0) {
      sum += digit;
    } else {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidVatNumber(value: string): boolean {
  const vat = value.replace(/\s/g, "").replace(/^IT/i, "");
  if (!/^\d{11}$/.test(vat) || /^0{11}$/.test(vat)) return false;
  return vatNumberCheckDigit(vat.slice(0, 10)) === Number(vat[10]);
}

/** Builds a valid VAT number from a 7-digit company serial and a 3-digit office code. */
export function buildVatNumber(serial: number, officeCode: number): string {
  const body = `${String(serial).padStart(7, "0")}${String(officeCode).padStart(3, "0")}`;
  return `${body}${vatNumberCheckDigit(body)}`;
}

/** ISO 13616 check: the IBAN moved and read as a number, modulo 97, is 1. */
function ibanMod97(rearranged: string): number {
  const digits = rearranged
    .toUpperCase()
    .split("")
    .map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
    .join("");
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest;
}

export function isValidIban(value: string): boolean {
  const iban = value.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  return ibanMod97(iban.slice(4) + iban.slice(0, 4)) === 1;
}

/**
 * A synthetic Italian IBAN (rule 11): CIN «X», bank and branch codes of
 * nobody's, the account from a serial; the ISO check digits are right.
 */
export function buildSyntheticIban(serial: number): string {
  const bban = `X0000099999${String(serial).padStart(12, "0")}`;
  const check = 98 - ibanMod97(`${bban}IT00`);
  return `IT${String(check).padStart(2, "0")}${bban}`;
}

/**
 * An Italian mobile number as the customer writes it («333 123 4567»,
 * «+39 333-1234567», «0039 3331234567») in one form: +39 and the digits.
 * Null when it is not a mobile number (Dan, 2026-10-28: the private customer
 * gives a phone at the first access, for the agency that wins).
 */
export function italianMobile(input: string): string | null {
  const digits = input.replace(/[\s./()-]/g, "").replace(/^(\+39|0039)/, "");
  return /^3\d{8,9}$/.test(digits) ? `+39${digits}` : null;
}
