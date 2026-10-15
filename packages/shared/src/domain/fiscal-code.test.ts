import { describe, expect, it } from "vitest";
import {
  buildFiscalCode,
  decodeFiscalCode,
  fiscalCodeCheckChar,
  fiscalCodeMatchesName,
  givenNameCode,
  isValidFiscalCode,
  omocodeVariant,
  surnameCode,
} from "./fiscal-code.js";

const TODAY = "2026-10-15";

describe("fiscal code", () => {
  it("builds the well-known example code of Mario Rossi, born in Rome on 1 January 1980", () => {
    const code = buildFiscalCode({
      surname: "Rossi",
      givenName: "Mario",
      birthDate: "1980-01-01",
      sex: "M",
      birthPlaceCadastralCode: "H501",
    });
    expect(code).toBe("RSSMRA80A01H501U");
    expect(fiscalCodeCheckChar("RSSMRA80A01H501")).toBe("U");
  });

  it("decodes birth date, sex and birth place", () => {
    expect(decodeFiscalCode("rssmra80a01h501u", TODAY)).toEqual({
      normalized: "RSSMRA80A01H501U",
      birthDate: "1980-01-01",
      sex: "M",
      birthPlaceCadastralCode: "H501",
      bornAbroad: false,
      isOmocode: false,
    });
  });

  it("adds 40 to the day for women", () => {
    const code = buildFiscalCode({
      surname: "Neri",
      givenName: "Giulia",
      birthDate: "1990-05-12",
      sex: "F",
      birthPlaceCadastralCode: "F205",
    });
    expect(code.slice(9, 11)).toBe("52");
    expect(decodeFiscalCode(code, TODAY)).toMatchObject({ birthDate: "1990-05-12", sex: "F" });
  });

  it("resolves the century against today: a future year belongs to the previous century", () => {
    const born2010 = buildFiscalCode({
      surname: "Bianchi",
      givenName: "Luca",
      birthDate: "2010-03-04",
      sex: "M",
      birthPlaceCadastralCode: "F205",
    });
    expect(decodeFiscalCode(born2010, TODAY)?.birthDate).toBe("2010-03-04");
    const born1930 = buildFiscalCode({
      surname: "Bianchi",
      givenName: "Luca",
      birthDate: "1930-03-04",
      sex: "M",
      birthPlaceCadastralCode: "F205",
    });
    expect(decodeFiscalCode(born1930, TODAY)?.birthDate).toBe("1930-03-04");
  });

  it("recognises people born abroad (Z codes)", () => {
    const code = buildFiscalCode({
      surname: "Hoxha",
      givenName: "Arta",
      birthDate: "1992-07-20",
      sex: "F",
      birthPlaceCadastralCode: "Z100",
    });
    expect(decodeFiscalCode(code, TODAY)).toMatchObject({
      bornAbroad: true,
      birthPlaceCadastralCode: "Z100",
    });
  });

  it("accepts every omocodia variant and decodes them to the same person", () => {
    const base = "RSSMRA80A01H501U";
    for (let level = 1; level <= 7; level += 1) {
      const variant = omocodeVariant(base, level);
      expect(variant).not.toBe(base);
      const decoded = decodeFiscalCode(variant, TODAY);
      expect(decoded, variant).not.toBeNull();
      expect(decoded).toMatchObject({
        birthDate: "1980-01-01",
        sex: "M",
        birthPlaceCadastralCode: "H501",
        isOmocode: true,
      });
    }
    // Level 1 turns the last digit (1) into M; level 7 leaves no digit.
    expect(omocodeVariant(base, 1).slice(0, 15)).toBe("RSSMRA80A01H50M");
    expect(omocodeVariant(base, 7).slice(0, 15)).toBe("RSSMRAULALMHRLM");
  });

  it("rejects a wrong check character, a wrong shape and an impossible date", () => {
    expect(isValidFiscalCode("RSSMRA80A01H501A", TODAY)).toBe(false);
    expect(isValidFiscalCode("RSSMRA80A01H501", TODAY)).toBe(false);
    expect(isValidFiscalCode("RSSMRA80F01H501U", TODAY)).toBe(false);
    // 31 February, with a correct check character
    const body = "RSSMRA80B31H501";
    expect(isValidFiscalCode(`${body}${fiscalCodeCheckChar(body)}`, TODAY)).toBe(false);
  });

  it("computes the letters of surname and given name", () => {
    expect(surnameCode("Rossi")).toBe("RSS");
    expect(surnameCode("Fo")).toBe("FOX");
    expect(surnameCode("De Luca")).toBe("DLC");
    expect(givenNameCode("Mario")).toBe("MRA");
    // four or more consonants: first, third and fourth
    expect(givenNameCode("Gianfranco")).toBe("GFR");
    expect(givenNameCode("Andrea")).toBe("NDR");
    expect(givenNameCode("Zoë")).toBe("ZOE");
    expect(fiscalCodeMatchesName("RSSMRA80A01H501U", "Rossi", "Mario")).toBe(true);
    expect(fiscalCodeMatchesName("RSSMRA80A01H501U", "Russo", "Maria")).toBe(true);
    expect(fiscalCodeMatchesName("RSSMRA80A01H501U", "Neri", "Mario")).toBe(false);
  });
});
