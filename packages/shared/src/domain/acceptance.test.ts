import { describe, expect, it } from "vitest";
import {
  acceptanceBlock,
  coverStartAt,
  customerFee,
  guaranteeDaysLeft,
  issuanceDeadline,
  lastAcceptanceMoment,
  missedIssuanceAt,
  savingCents,
  type FeeSettings,
} from "./acceptance.js";
import type { WorkingCalendar } from "./working-calendar.js";

// The values of seed/parametri.json.
const FEES: FeeSettings = {
  privateCents: 3000,
  aiSupplementCents: 500,
  lowPremiumThresholdCents: 20000,
  lowPremiumCents: 1500,
  brokerCents: 3000,
};

// ASTA-02: Monday to Friday 9-19, Saturday 9-13, Rome time.
const calendar: WorkingCalendar = {
  hours: {
    mon: [["09:00", "19:00"]],
    tue: [["09:00", "19:00"]],
    wed: [["09:00", "19:00"]],
    thu: [["09:00", "19:00"]],
    fri: [["09:00", "19:00"]],
    sat: [["09:00", "13:00"]],
    sun: [],
  },
  holidays: new Set(["2026-12-08", "2026-12-25"]),
};

describe("fee of the customer (FEE-01…03)", () => {
  const fee = (premiumCents: number, aiUsed: boolean, channel: "PRIVATE" | "BROKER" = "PRIVATE") =>
    customerFee({ channel, premiumCents, aiUsed }, FEES);

  it("FEE-01 S01 a private pays 30,00 €, 35,00 € after the AI comparison: Alfa 520,00 € costs 555,00 €", () => {
    expect(fee(52000, false)).toEqual({ feeCents: 3000, rule: "PRIVATE", brokerFeeCents: 0 });
    expect(fee(52000, true)).toEqual({ feeCents: 3500, rule: "PRIVATE_AI", brokerFeeCents: 0 });
    expect(52000 + fee(52000, true).feeCents).toBe(55500);
  });

  it("FEE-02 S09 below 200,00 €: 15,00 €, or 20,00 € with the AI comparison", () => {
    expect(18000 + fee(18000, false).feeCents).toBe(19500);
    expect(18000 + fee(18000, true).feeCents).toBe(20000);
    expect(fee(18000, true).rule).toBe("PRIVATE_LOW_AI");
  });

  it("FEE-02 S09 exactly 200,00 € is still the reduced fee (question 3); 200,01 € the full one", () => {
    expect(fee(20000, false).feeCents).toBe(1500);
    expect(fee(20000, true).feeCents).toBe(2000);
    expect(fee(20001, false).feeCents).toBe(3000);
  });

  it("FEE-03 S09 the broker's customer pays no fee; the broker owes 30,00 €, never reduced", () => {
    expect(fee(18000, false, "BROKER")).toEqual({
      feeCents: 0,
      rule: "BROKER_CLIENT",
      brokerFeeCents: 3000,
    });
  });

  it("FEE-07 the premium is a positive whole number of cents", () => {
    expect(() => fee(520.5, false)).toThrow();
    expect(() => fee(0, false)).toThrow();
  });
});

describe("last useful moment and issuance deadline (GAR-04, EMI-01)", () => {
  it("GAR-04 start on Friday 20/11: the last moment is Thursday 19/11 at 15:00 in Rome", () => {
    expect(lastAcceptanceMoment(calendar, "2026-11-20", 4).toISOString()).toBe(
      "2026-11-19T14:00:00.000Z",
    );
  });

  it("GAR-04 an offer is refused when expired, or past the last moment", () => {
    const at = (iso: string) => new Date(iso);
    const input = { guaranteeUntil: "2026-12-05", startDate: "2026-11-20" };
    expect(acceptanceBlock({ ...input, now: at("2026-11-19T13:59:00Z") }, calendar, 4)).toBeNull();
    expect(acceptanceBlock({ ...input, now: at("2026-11-19T14:00:00Z") }, calendar, 4)).toBe(
      "TOO_LATE",
    );
    expect(
      acceptanceBlock(
        { guaranteeUntil: "2026-11-17", startDate: "2026-12-20", now: at("2026-11-18T08:00:00Z") },
        calendar,
        4,
      ),
    ).toBe("EXPIRED");
  });

  it("EMI-01 S01 paid on Monday 16/11 at 12:30: deadline at 16:30", () => {
    expect(
      issuanceDeadline(calendar, new Date("2026-11-16T11:30:00Z"), "2026-11-20", 4).toISOString(),
    ).toBe("2026-11-16T15:30:00.000Z");
  });

  it("EMI-01 and in any case before the start of cover", () => {
    // Paid on Thursday 19/11 at 17:00, start Friday 20/11: the deadline is 00:00 of the 20th.
    expect(
      issuanceDeadline(calendar, new Date("2026-11-19T16:00:00Z"), "2026-11-20", 4).toISOString(),
    ).toBe("2026-11-19T23:00:00.000Z");
  });
});

describe("question 1: start of cover set by the payment (docs/piano-decorrenza.md)", () => {
  // issuance.workingHours (Dan, 2026-10-19): Monday to Friday 9-19, no Saturday.
  const issuance: WorkingCalendar = {
    hours: { ...calendar.hours, sat: [] },
    holidays: calendar.holidays,
  };
  // Friday 20/11/2026 at 18:00 in Rome.
  const fridayAt18 = new Date("2026-11-20T17:00:00Z");

  it("EMI-01 paid Friday at 18: the agency has until Monday at 12 (one hour Friday, three Monday)", () => {
    for (const mode of ["ON_ISSUANCE", "MIDNIGHT_AFTER_DEADLINE"] as const) {
      expect(issuanceDeadline(issuance, fridayAt18, "2026-11-18", 4, mode).toISOString()).toBe(
        "2026-11-23T11:00:00.000Z",
      );
    }
  });

  it("EMI-01 paid on Saturday or Sunday: the deadline is Monday at 13", () => {
    const sunday = new Date("2026-11-22T10:00:00Z");
    expect(issuanceDeadline(issuance, sunday, "2026-11-18", 4, "ON_ISSUANCE").toISOString()).toBe(
      "2026-11-23T12:00:00.000Z",
    );
  });

  it("GAR-04 with the start set by the payment only the guarantee counts", () => {
    const input = { guaranteeUntil: "2026-12-05", startDate: "2026-11-18" };
    const now = new Date("2026-11-30T10:00:00Z");
    expect(acceptanceBlock({ ...input, now }, calendar, 4)).toBe("TOO_LATE");
    expect(acceptanceBlock({ ...input, now, startMode: "ON_ISSUANCE" }, calendar, 4)).toBeNull();
    expect(
      acceptanceBlock({ ...input, now, startMode: "MIDNIGHT_AFTER_DEADLINE" }, calendar, 4),
    ).toBeNull();
    expect(
      acceptanceBlock(
        { ...input, now: new Date("2026-12-06T10:00:00Z"), startMode: "ON_ISSUANCE" },
        calendar,
        4,
      ),
    ).toBe("EXPIRED");
  });

  it("«immediata»: the cover starts at the issuance, never before; the deadline until then", () => {
    const deadline = new Date("2026-11-23T11:00:00Z");
    const issuedAt = new Date("2026-11-23T08:30:00Z");
    const base = {
      startMode: "ON_ISSUANCE" as const,
      startDate: "2026-11-18",
      issuanceDeadlineAt: deadline,
    };
    expect(coverStartAt({ ...base, issuedAt })).toEqual(issuedAt);
    expect(coverStartAt(base)).toEqual(deadline);
    // EMI-04: not issued by the deadline is a missed issuance.
    expect(missedIssuanceAt(base)).toEqual(deadline);
  });

  it("«dalle 24:00»: from 24:00 of the day of the deadline (Dan: paid Friday at 18, from 24:00 on Monday)", () => {
    const base = { startMode: "MIDNIGHT_AFTER_DEADLINE" as const, startDate: "2026-11-18" };
    // Deadline Monday 23/11 at 12: cover from 00:00 of Tuesday 24/11 in Rome.
    const monday = { ...base, issuanceDeadlineAt: new Date("2026-11-23T11:00:00Z") };
    expect(coverStartAt(monday).toISOString()).toBe("2026-11-23T23:00:00.000Z");
    expect(missedIssuanceAt(monday).toISOString()).toBe("2026-11-23T23:00:00.000Z");
    // Paid Tuesday at 10, deadline Tuesday at 14: from 24:00 of that Tuesday.
    const sameDay = { ...base, issuanceDeadlineAt: new Date("2026-11-24T13:00:00Z") };
    expect(coverStartAt(sameDay).toISOString()).toBe("2026-11-24T23:00:00.000Z");
  });

  it("a chosen date keeps its rules, also for data saved before the modes", () => {
    const deadline = new Date("2026-11-19T16:00:00Z");
    expect(
      coverStartAt({ startDate: "2026-11-20", issuanceDeadlineAt: deadline }).toISOString(),
    ).toBe("2026-11-19T23:00:00.000Z");
    expect(
      missedIssuanceAt({
        startMode: "DATE",
        startDate: "2026-11-20",
        issuanceDeadlineAt: deadline,
      }),
    ).toEqual(new Date("2026-11-19T23:00:00.000Z"));
  });
});

describe("presentation (PRES-03, PRES-04)", () => {
  it("PRES-03 S01 the saving on the current premium: 680,00 − 505,00 = 175,00 €", () => {
    expect(savingCents(68000, 50500)).toBe(17500);
    expect(savingCents(null, 50500)).toBeNull();
    expect(savingCents(40000, 50500)).toBeNull();
  });

  it("PRES-04 the days of guarantee left", () => {
    expect(guaranteeDaysLeft("2026-12-06", "2026-11-16")).toBe(20);
    expect(guaranteeDaysLeft("2026-11-16", "2026-11-16")).toBe(0);
    expect(guaranteeDaysLeft("2026-11-15", "2026-11-16")).toBe(0);
  });
});
