import { describe, expect, it } from "vitest";
import type { FeeSettings } from "./acceptance.js";
import {
  brokerInvoiceLines,
  creditNoteCents,
  invoiceNumber,
  invoiceTotals,
  monthBounds,
  previousMonth,
  type InvoicingSettings,
} from "./invoicing.js";
import {
  monthsBefore,
  policyEndDate,
  renewalNoticeDate,
  secondOffer,
  secondOfferTerms,
  surveyDate,
  suspensionDue,
} from "./issuance.js";
import { agencyRankingView, formatGapPercent } from "./ranking-view.js";
import { computeRemittance, isRemittanceDay, remittanceCutoff } from "./remittance.js";

const FEES: FeeSettings = {
  privateCents: 3000,
  aiSupplementCents: 500,
  lowPremiumThresholdCents: 20000,
  lowPremiumCents: 1500,
  brokerCents: 3000,
};

const INVOICING: InvoicingSettings = {
  vatNature: "N4",
  legalReference: "Operazione esente IVA ai sensi dell'art. 10, comma 1, n. 9, DPR 633/1972",
  stampDutyThresholdCents: 7747,
  stampDutyCents: 200,
  stampDutyChargedTo: "RECIPIENT",
};

describe("CONT-01 the weekly remittance", () => {
  it("CONT-01 S01 one policy of Agenzia Uno: 520,00 € less the agency fee 15,00 € = 505,00 €", () => {
    const r = computeRemittance(
      [{ policyId: "p1", premiumCents: 52000, agencyFeeCents: 1500 }],
      [],
    );
    expect(r).toMatchObject({
      grossCents: 52000,
      feesCents: 1500,
      netCents: 50500,
      carriedCents: 0,
    });
  });

  it("CONT-01 EMI-05 S05 penalties and recoveries are held back", () => {
    const r = computeRemittance(
      [
        { policyId: "p1", premiumCents: 52000, agencyFeeCents: 1500 },
        { policyId: "p2", premiumCents: 61000, agencyFeeCents: 1500 },
      ],
      [
        { kind: "PENALTY", ref: "pen-1", cents: 10000 },
        { kind: "RECOVERY", ref: "ref-1", cents: 49700 },
      ],
    );
    expect(r.netCents).toBe(113000 - 3000 - 10000 - 49700);
    expect(r.held).toMatchObject({ PENALTY: 10000, RECOVERY: 49700 });
  });

  it("CONT-01 decision 25 the broker's quota, when active, comes first", () => {
    const r = computeRemittance(
      [{ policyId: "p1", premiumCents: 10000, agencyFeeCents: 1500 }],
      [
        { kind: "PENALTY", ref: "pen", cents: 10000 },
        { kind: "BROKER_SHARE", ref: "p1", cents: 500 },
      ],
    );
    expect(r.held.BROKER_SHARE).toBe(500);
    expect(r.held.PENALTY).toBe(8000);
  });

  it("EMI-05 decision 23b never negative: what does not fit passes to the next remittance", () => {
    const r = computeRemittance(
      [{ policyId: "p1", premiumCents: 20000, agencyFeeCents: 1500 }],
      [
        { kind: "PENALTY", ref: "pen-1", cents: 10000 },
        { kind: "PENALTY", ref: "pen-2", cents: 10000 },
      ],
    );
    expect(r.netCents).toBe(0);
    expect(r.carriedCents).toBe(1500);
    expect(r.applied.map((a) => a.appliedCents)).toEqual([10000, 8500]);
    // The next week: the residue first, as CARRIED_OVER.
    const next = computeRemittance(
      [{ policyId: "p2", premiumCents: 30000, agencyFeeCents: 1500 }],
      [{ kind: "CARRIED_OVER", ref: "rem-1", cents: 1500 }],
    );
    expect(next.netCents).toBe(30000 - 1500 - 1500);
  });

  it("CONT-01 a week without policies and with a penalty: nothing paid, all carried", () => {
    const r = computeRemittance([], [{ kind: "PENALTY", ref: "pen", cents: 2500 }]);
    expect(r).toMatchObject({ netCents: 0, carriedCents: 2500 });
  });

  it("CONT-01 rule 5 amounts are whole cents", () => {
    expect(() =>
      computeRemittance([{ policyId: "p", premiumCents: 100.5, agencyFeeCents: 0 }], []),
    ).toThrow();
  });

  it("CONT-01 the cutoff: on Monday 30/11/2026, policies issued up to Friday 27/11 at 23:59 in Rome", () => {
    const cutoff = remittanceCutoff("2026-11-30", { day: "FRIDAY", time: "23:59" });
    expect(cutoff.toISOString()).toBe("2026-11-27T22:59:59.999Z");
    expect(isRemittanceDay("2026-11-30", "MONDAY")).toBe(true);
    expect(isRemittanceDay("2026-12-01", "MONDAY")).toBe(false);
  });
});

describe("CONT-03 CONT-04 invoices", () => {
  it("CONT-03 S01 the private customer's invoice of 35,00 €: exempt, no stamp duty", () => {
    expect(
      invoiceTotals([{ description: "Compenso", quantity: 1, unitCents: 3500 }], INVOICING),
    ).toEqual({
      exemptCents: 3500,
      stampDutyCents: 0,
      totalCents: 3500,
      vatNature: "N4",
      legalReference: INVOICING.legalReference,
    });
  });

  it("CONT-04 the stamp duty applies strictly above 77,47 €, charged to the recipient", () => {
    const at = (cents: number) =>
      invoiceTotals([{ description: "Fee", quantity: 1, unitCents: cents }], INVOICING);
    expect(at(7747).stampDutyCents).toBe(0);
    expect(at(7748)).toMatchObject({ stampDutyCents: 200, totalCents: 7948 });
    expect(
      invoiceTotals([{ description: "Fee", quantity: 1, unitCents: 9000 }], {
        ...INVOICING,
        stampDutyChargedTo: "ASTAX",
      }),
    ).toMatchObject({ stampDutyCents: 200, totalCents: 9000 });
  });

  it("CONT-03 the agency's invoice: 15,00 € per policy", () => {
    const t = invoiceTotals(
      [{ description: "Fee agenzia", quantity: 6, unitCents: 1500 }],
      INVOICING,
    );
    expect(t).toMatchObject({ exemptCents: 9000, stampDutyCents: 200, totalCents: 9200 });
  });

  it("decision 34 the numbers by series and year", () => {
    expect(invoiceNumber("P", 2026, 1)).toBe("P-2026-000001");
    expect(invoiceNumber("B", 2027, 123)).toBe("B-2027-000123");
    expect(() => invoiceNumber("A", 2026, 0)).toThrow();
  });

  it("CONT-03 a credit note never exceeds what is left on the invoice", () => {
    expect(creditNoteCents(3500, 0, 3500)).toBe(3500);
    expect(() => creditNoteCents(3500, 3000, 1000)).toThrow();
  });

  it("decision 24 the broker invoice covers the month before, one line per fee amount", () => {
    expect(previousMonth("2026-11-01")).toBe("2026-10");
    expect(previousMonth("2027-01-01")).toBe("2026-12");
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(() => monthBounds("2026-13")).toThrow();
    expect(brokerInvoiceLines([3000, 3000, 0, 2500, 3000], "Fee")).toEqual([
      { description: "Fee", quantity: 1, unitCents: 2500 },
      { description: "Fee", quantity: 3, unitCents: 3000 },
    ]);
  });
});

describe("EMI-04 EMI-06 issuance", () => {
  const offer = (
    id: string,
    organizationId: string,
    cents: number,
    until: string,
    at = "2026-11-16T09:00:00Z",
  ) => ({
    id,
    organizationId,
    companyId: `c-${id}`,
    annualGrossPremiumCents: cents,
    guaranteeUntil: until,
    lastSubmittedAt: new Date(at),
  });

  it("EMI-04 S05 the second offer: Agenzia Due's Alfa 520,00 €, the best still guaranteed of another agency", () => {
    const offers = [
      offer("uno", "agenzia-uno", 50000, "2026-12-05"),
      offer("due", "agenzia-due", 52000, "2026-12-05"),
      offer("tre", "agenzia-tre", 53000, "2026-12-05"),
      offer("quattro", "agenzia-quattro", 51000, "2026-11-20"),
    ];
    const now = new Date("2026-11-24T14:00:00Z");
    expect(secondOffer(offers, "agenzia-uno", now)?.id).toBe("due");
    expect(secondOffer([offers[0] as (typeof offers)[number]], "agenzia-uno", now)).toBeNull();
  });

  it("EMI-04 S05 the difference: 20,00 € to pay, the fee unchanged", () => {
    expect(
      secondOfferTerms(
        { premiumCents: 50000, feeCents: 3000 },
        { premiumCents: 52000 },
        { channel: "PRIVATE", aiUsed: false },
        FEES,
      ),
    ).toEqual({ premiumCents: 52000, feeCents: 3000, differenceCents: 2000 });
  });

  it("EMI-04 FEE-02 a second offer below 200,00 €: lower fee, the customer gets money back", () => {
    expect(
      secondOfferTerms(
        { premiumCents: 20500, feeCents: 3000 },
        { premiumCents: 19500 },
        { channel: "PRIVATE", aiUsed: false },
        FEES,
      ),
    ).toEqual({ premiumCents: 19500, feeCents: 1500, differenceCents: -2500 });
  });

  it("EMI-06 the third missed issuance within six months suspends; an older one does not count", () => {
    const settings = { missedIssuances: 3, windowMonths: 6 };
    expect(suspensionDue(["2026-07-01", "2026-09-10", "2026-11-24"], "2026-11-24", settings)).toBe(
      true,
    );
    expect(suspensionDue(["2026-05-24", "2026-09-10", "2026-11-24"], "2026-11-24", settings)).toBe(
      false,
    );
    expect(suspensionDue(["2026-09-10", "2026-11-24"], "2026-11-24", settings)).toBe(false);
    expect(monthsBefore("2026-08-31", 6)).toBe("2026-02-28");
  });

  it("policy dates: one year, the renewal 30 days before the end, the questionnaire 7 days after", () => {
    expect(policyEndDate("2026-11-20")).toBe("2027-11-19");
    expect(policyEndDate("2028-02-29")).toBe("2029-02-27");
    expect(renewalNoticeDate("2027-11-19", 30)).toBe("2027-10-20");
    expect(surveyDate("2026-11-16", 7)).toBe("2026-11-23");
  });
});

describe("CLA-03 CLA-04 the agency's ranking", () => {
  const entries = [
    {
      offerId: "cinque",
      organizationId: "agenzia-cinque",
      rank: 1,
      annualGrossPremiumCents: 50500,
    },
    { offerId: "tre", organizationId: "agenzia-tre", rank: 2, annualGrossPremiumCents: 50500 },
    { offerId: "uno", organizationId: "agenzia-uno", rank: 3, annualGrossPremiumCents: 52000 },
    { offerId: "due", organizationId: "agenzia-due", rank: 4, annualGrossPremiumCents: 54000 },
    {
      offerId: "quattro",
      organizationId: "agenzia-quattro",
      rank: 5,
      annualGrossPremiumCents: 61000,
    },
  ];

  it("CLA-03 S01 Agenzia Uno: first 505,00 €, second 505,00 €, 3ª su 5, +2,97 %", () => {
    const view = agencyRankingView({
      published: true,
      entries,
      organizationId: "agenzia-uno",
      excluded: null,
    });
    expect(view).toEqual({
      kind: "RANKED",
      firstCents: 50500,
      secondCents: 50500,
      position: 3,
      total: 5,
      ownCents: 52000,
      gapBasisPoints: 297,
    });
    expect(formatGapPercent(297)).toBe("+2,97 %");
    expect(formatGapPercent(0)).toBe("0,00 %");
  });

  it("CLA-03 Agenzia Cinque is 1ª su 5 with no gap", () => {
    expect(
      agencyRankingView({
        published: true,
        entries,
        organizationId: "agenzia-cinque",
        excluded: null,
      }),
    ).toMatchObject({ position: 1, gapBasisPoints: 0 });
  });

  it("CLA-03 an excluded offer sees «esclusa» with the reason; CLA-04 nothing before the publication", () => {
    expect(
      agencyRankingView({
        published: true,
        entries,
        organizationId: "agenzia-sei",
        excluded: { reason: "Coperture sotto il pacchetto" },
      }),
    ).toEqual({ kind: "EXCLUDED", reason: "Coperture sotto il pacchetto" });
    expect(
      agencyRankingView({
        published: false,
        entries,
        organizationId: "agenzia-uno",
        excluded: null,
      }),
    ).toEqual({ kind: "NOT_PUBLISHED" });
  });
});
