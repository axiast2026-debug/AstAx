import { describe, expect, it } from "vitest";
import {
  centsToEuros,
  claimsFromForm,
  eurosToCents,
  historyFromForm,
  holderDrivesByDefault,
  driversChoice,
  requestTermsFromForm,
  vehicleFromForm,
} from "./wizard-forms";

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.append(k, v);
  return data;
};

describe("wizard forms", () => {
  it("rule 5: euros typed by the user become integer cents", () => {
    expect(eurosToCents("450")).toBe(45000);
    expect(eurosToCents("1.234,56")).toBe(123456);
    expect(eurosToCents("450,5")).toBe(45050);
    expect(eurosToCents("€ 99,90")).toBe(9990);
    expect(eurosToCents("12,345")).toBeNaN();
    expect(eurosToCents(undefined)).toBeUndefined();
    expect(centsToEuros(45050)).toBe("450,50");
    expect(centsToEuros(45000)).toBe("450");
  });

  it("reads the vehicle with numbers and check boxes, leaving empty fields out", () => {
    expect(
      vehicleFromForm(
        form({
          "vehicle.plate": " gn123ab ",
          "vehicle.type": "CAR",
          "vehicle.make": "Marca Prova",
          "vehicle.model": "Uno",
          "vehicle.fuel": "PETROL",
          "vehicle.powerKw": "55",
          "vehicle.firstRegistrationDate": "2019-03-15",
          "vehicle.purchaseDate": "2019-03-15",
          "vehicle.isNew": "on",
          "vehicle.version": "",
        }),
      ),
    ).toEqual({
      plate: "gn123ab",
      type: "CAR",
      use: "PRIVATE",
      make: "Marca Prova",
      model: "Uno",
      fuel: "PETROL",
      powerKw: 55,
      firstRegistrationDate: "2019-03-15",
      purchaseDate: "2019-03-15",
      isNew: true,
    });
  });

  it("keeps only the years with claims", () => {
    expect(
      claimsFromForm(
        form({ "claims.2024.main": "1", "claims.2025.main": "0", "claims.2025.shared": "0" }),
        [2024, 2025, 2026],
      ),
    ).toEqual([{ year: 2024, mainResponsibility: 1, sharedResponsibility: 0 }]);
  });

  it("asks the family RC data only for that provenance", () => {
    const fields = {
      "history.provenance": "FROM_OTHER_COMPANY",
      "history.familyRc.plate": "AB123CD",
      "history.familyRc.relativeFiscalCode": "RSSMRA80A01H501U",
    };
    expect(historyFromForm(form(fields), [2026])).not.toHaveProperty("familyRc");
    expect(
      historyFromForm(form({ ...fields, "history.provenance": "FAMILY_RC" }), [2026]),
    ).toHaveProperty("familyRc.plate", "AB123CD");
  });

  it("uses the defaults in force for duration and validity until the user chooses", () => {
    const terms = requestTermsFromForm(
      form({
        "request.packageCode": "BASE",
        "request.packageVersion": "1",
        "request.startDate": "2026-11-30",
      }),
      { auctionDurationHours: 2, minValidityDays: 15 },
    );
    expect(terms).toMatchObject({ auctionDurationHours: 2, minValidityDays: 15, blackBox: false });
  });
});

describe("step 2 «Chi guida»", () => {
  const giulia = { isMain: true, person: { fiscalCode: "NREGLI90E52F205X" } };

  it("the holder drives by default, also with the holder saved and no driver yet", () => {
    expect(holderDrivesByDefault(undefined, [])).toBe(true);
    expect(holderDrivesByDefault("NREGLI90E52F205X", [])).toBe(true);
    expect(holderDrivesByDefault("NREGLI90E52F205X", [giulia])).toBe(true);
    expect(holderDrivesByDefault("BNCMRA80C15F205V", [giulia])).toBe(false);
  });

  it("the other driver's details are read only with its box ticked", () => {
    expect(driversChoice(form({ holderDrives: "on" }), true)).toEqual({
      holderIsDriver: true,
      otherDriver: false,
      missingMainDriver: false,
    });
    expect(driversChoice(form({}), true).missingMainDriver).toBe(true);
    expect(driversChoice(form({ otherDriver: "on" }), true)).toMatchObject({
      holderIsDriver: false,
      missingMainDriver: false,
    });
    // A company never drives: the other person's details are always read.
    expect(driversChoice(form({}), false)).toEqual({
      holderIsDriver: false,
      otherDriver: true,
      missingMainDriver: false,
    });
  });
});
