import { describe, expect, it } from "vitest";
import { centsToEuros, eurosToCents, requestTermsFromForm } from "./wizard-forms";

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

  it("uses the defaults in force for duration and validity until the user chooses", () => {
    const terms = requestTermsFromForm(
      form({
        "request.packageCode": "BASE",
        "request.packageVersion": "1",
        "request.startDate": "2026-11-30",
      }),
      { auctionDurationHours: 2, minValidityDays: 15, today: "2026-10-19" },
    );
    expect(terms).toMatchObject({
      auctionDurationHours: 2,
      minValidityDays: 15,
      blackBox: false,
      startDate: "2026-11-30",
      startMode: "DATE",
    });
  });

  it("question 1: with the start set by the payment the date is the day of the request", () => {
    for (const mode of ["ON_ISSUANCE", "MIDNIGHT_AFTER_DEADLINE"]) {
      const terms = requestTermsFromForm(
        form({
          "request.packageCode": "BASE",
          "request.packageVersion": "1",
          "request.startMode": mode,
          "request.startDate": "2026-11-30",
        }),
        { auctionDurationHours: 2, minValidityDays: 15, today: "2026-10-19" },
      );
      expect(terms).toMatchObject({ startMode: mode, startDate: "2026-10-19" });
    }
    // An unknown value is a chosen date.
    expect(
      requestTermsFromForm(
        form({ "request.startMode": "YESTERDAY", "request.startDate": "2026-11-30" }),
        {
          auctionDurationHours: 2,
          minValidityDays: 15,
          today: "2026-10-19",
        },
      ),
    ).toMatchObject({ startMode: "DATE", startDate: "2026-11-30" });
  });
});

describe("Dan, 2026-10-21: coverages of «Su misura»", () => {
  const base = { auctionDurationHours: 2, minValidityDays: 15, today: "2026-10-21" };

  it("the ticked coverages are read only for «Su misura»", () => {
    const custom = requestTermsFromForm(
      form({
        "request.packageCode": "CUSTOM",
        "request.packageVersion.CUSTOM": "1",
        "request.startDate": "2026-11-30",
        "request.coverages.glass": "on",
        "request.coverages.theftFire": "on",
        "request.coverages.unknown": "on",
      }),
      base,
    );
    expect(custom).toMatchObject({ packageCode: "CUSTOM", coverages: ["theftFire", "glass"] });
    const recommended = requestTermsFromForm(
      form({
        "request.packageCode": "RECOMMENDED",
        "request.packageVersion.RECOMMENDED": "1",
        "request.startDate": "2026-11-30",
        "request.coverages.glass": "on",
      }),
      base,
    );
    expect(recommended).not.toHaveProperty("coverages");
  });
});
