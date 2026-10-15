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
