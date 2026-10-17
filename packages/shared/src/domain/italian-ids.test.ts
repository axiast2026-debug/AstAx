import { describe, expect, it } from "vitest";
import {
  buildSyntheticIban,
  buildVatNumber,
  isValidIban,
  isValidVatNumber,
  vatNumberCheckDigit,
} from "./italian-ids.js";

describe("Italian VAT number", () => {
  it("computes the check digit", () => {
    // 1+3+5+7+9 = 25; doubled 2,4,6,8,0 → 4+8+3+7+0 = 22; 47 → 3
    expect(vatNumberCheckDigit("1234567890")).toBe(3);
    expect(isValidVatNumber("12345678903")).toBe(true);
    // 0+7+1+4+2 = 14; doubled 7,4,0,0,6 → 5+8+0+0+3 = 16; 30 → 0
    expect(vatNumberCheckDigit("0774104026")).toBe(0);
  });

  it("rejects wrong check digits, wrong lengths and all zeros", () => {
    expect(isValidVatNumber("12345678901")).toBe(false);
    expect(isValidVatNumber("1234567890")).toBe(false);
    expect(isValidVatNumber("00000000000")).toBe(false);
  });

  it("accepts the IT prefix and spaces", () => {
    expect(isValidVatNumber("IT 12345678903")).toBe(true);
  });

  it("builds valid numbers", () => {
    for (let serial = 1; serial <= 50; serial += 1) {
      expect(isValidVatNumber(buildVatNumber(9_000_000 + serial, 15))).toBe(true);
    }
  });
});

describe("IBAN", () => {
  it("a synthetic IBAN passes the ISO 13616 check; a changed digit does not", () => {
    const iban = buildSyntheticIban(42);
    expect(iban).toMatch(/^IT\d{2}X0000099999000000000042$/);
    expect(isValidIban(iban)).toBe(true);
    expect(isValidIban(iban.replace(/42$/, "43"))).toBe(false);
    expect(isValidIban("IT60 X054 2811 1010 0000 0123 456")).toBe(true);
  });
});
