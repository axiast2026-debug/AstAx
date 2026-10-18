import { describe, expect, it } from "vitest";
import {
  acceptanceBlock,
  customerFee,
  guaranteeDaysLeft,
  issuanceDeadline,
  lastAcceptanceMoment,
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
