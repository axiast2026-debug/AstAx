import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approvedRequest,
  FULL_BASE_COVERAGE,
  harness,
  orgId,
  sealedOffer,
  type Harness,
} from "./fixtures.js";

// The activities of QuoteRequestWorkflow against a real PostgreSQL, with the
// fake KMS (ADR 0005, ADR 0008). Monday 16/11/2026, 9:00 in Rome.
let h: Harness;
const MONDAY_9 = "2026-11-16T08:00:00.000Z";

beforeAll(() => {
  h = harness(MONDAY_9);
});

afterAll(async () => {
  await h.db.$disconnect();
});

const read = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);

describe("opening (ASTA-01, ASTA-05, ASTA-09)", () => {
  it("ASTA-01 ASTA-02 GAR-01 the auction opens at the approval with the closing on the working calendar and the minimum guarantee", async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h);
    const opened = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    expect(opened.opened).toBe(true);
    if (!opened.opened) return;
    // 2 working hours from Monday 9:00: Monday 11:00 in Rome.
    expect(opened.scheduledCloseAt).toBe("2026-11-16T10:00:00.000Z");
    const auction = await read((tx) =>
      tx.auction.findUniqueOrThrow({ where: { id: opened.auctionId } }),
    );
    expect(auction.minGuaranteeDate.toISOString().slice(0, 10)).toBe("2026-12-01");
    const status = await read((tx) =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: request.id } }),
    );
    expect(status.status).toBe("AUCTION_OPEN");
  });

  it("ASTA-04 ASTA-05 at most 8 agencies, covering every company; requester and agencies told", async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h);
    const opened = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    if (!opened.opened) throw new Error("not opened");
    const invitations = await read((tx) =>
      tx.invitation.findMany({ where: { auctionId: opened.auctionId } }),
    );
    expect(invitations).toHaveLength(8);
    const companies = await read((tx) =>
      tx.agencyMandate.findMany({
        where: { organizationId: { in: invitations.map((i) => i.organizationId) } },
        include: { company: true },
      }),
    );
    expect(new Set(companies.map((m) => m.company.name)).size).toBe(4);
    const notes = await read((tx) =>
      tx.notification.findMany({
        where: { payload: { path: ["auctionId"], equals: opened.auctionId } },
      }),
    );
    expect(notes.every((n) => n.eventKey === "auction.invited")).toBe(true);
    expect(notes.length).toBeGreaterThan(8);
  });

  it("VIS-01 the texts sent to the agencies carry no contact of the customer and no price", async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h);
    await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    const notes = await read((tx) =>
      tx.notification.findMany({ where: { eventKey: "auction.invited" } }),
    );
    const agencyEmails = h.email.sent.filter((m) => m.subject.startsWith("Nuova richiesta"));
    const text = JSON.stringify([notes, agencyEmails]);
    for (const forbidden of [
      "giulia.cliente@example.test",
      "333 999 0001",
      "giulia.neri@example.test",
      "€",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("ASTA-09 the auction keeps the parameters in force at its opening", async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h);
    const opened = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    if (!opened.opened) throw new Error("not opened");
    // The administrator then sets the top-up threshold to 0 offers.
    await read((tx) =>
      tx.setting.create({
        data: {
          key: "invitations.topUp.minOffers",
          value: 0,
          version: 99,
          validFrom: new Date("2026-11-16T08:30:00.000Z"),
        },
      }),
    );
    h.clock.set("2026-11-16T09:00:00.000Z");
    // The auction still uses 3: with no offers, the top-up invites the 2 agencies left.
    expect(await h.activities.topUp({ auctionId: opened.auctionId })).toEqual({ invited: 2 });
  });

  it("a repeated opening finds the same auction and invites nobody twice", async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h);
    const first = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    const again = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    if (!first.opened || !again.opened) throw new Error("not opened");
    expect(again.auctionId).toBe(first.auctionId);
    expect(await read((tx) => tx.invitation.count({ where: { auctionId: first.auctionId } }))).toBe(
      8,
    );
  });

  it("LEG-04 a revoked consent opens no auction", async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h);
    await read((tx) =>
      tx.consent.updateMany({
        where: { quoteRequestId: request.id },
        data: { revokedAt: new Date(MONDAY_9) },
      }),
    );
    expect(await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 })).toEqual(
      {
        opened: false,
        reason: "CONSENT_REVOKED",
      },
    );
  });
});

describe("closing (docs/busta-chiusa.md, step 5)", () => {
  let requestId: string;
  let auctionId: string;

  beforeAll(async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h);
    requestId = request.id;
    const opened = await h.activities.openRound({ requestId, kind: "MAIN", round: 1 });
    if (!opened.opened) throw new Error("not opened");
    auctionId = opened.auctionId;
    const invited = await read((tx) => tx.invitation.findMany({ where: { auctionId } }));
    const agencies = new Set(invited.map((i) => i.organizationId));
    const at = (minute: number) => new Date(Date.parse(MONDAY_9) + minute * 60_000);
    // Agenzia Tre and Cinque: Beta at 505,00 €; Uno: Alfa at 480,00 €; Due: below the RCA legal minimum.
    for (const [agency, company, cents, until, minute] of [
      ["agenzia-uno", "Compagnia Alfa", 48000, "2026-12-03", 10],
      ["agenzia-tre", "Compagnia Beta", 50500, "2026-12-03", 5],
      ["agenzia-cinque", "Compagnia Beta", 50500, "2026-12-06", 30],
      ["agenzia-due", "Compagnia Alfa", 39000, "2026-12-10", 15],
    ] as const) {
      if (!agencies.has(orgId(agency))) throw new Error(`${agency} not invited`);
      await sealedOffer(
        h,
        auctionId,
        agency,
        {
          company,
          annualGrossPremiumCents: cents,
          coverage:
            agency === "agenzia-due"
              ? {
                  ...FULL_BASE_COVERAGE,
                  rca: { limitType: "SINGLE_LIMIT", singleLimitEur: 5_000_000 },
                }
              : FULL_BASE_COVERAGE,
          guaranteeUntil: until,
          notes: null,
        },
        at(minute),
      );
    }
  });

  it("BC-02 before the closing the database holds no premium nor company of the offers", async () => {
    const offers = await read((tx) => tx.offer.findMany({ where: { auctionId } }));
    const dump = JSON.stringify(offers);
    expect(dump).not.toContain("50500");
    expect(dump).not.toContain("48000");
    expect(offers.every((o) => o.annualGrossPremiumCents === null && o.companyId === null)).toBe(
      true,
    );
  });

  it("BC-03 the KMS key of the auction is not used before the closing", async () => {
    const decrypts = await read((tx) =>
      tx.kmsEvent.findMany({
        where: { operation: "DECRYPT", context: { path: ["auctionId"], equals: auctionId } },
      }),
    );
    expect(decrypts).toEqual([]);
  });

  it("OFF-06 PRES-01 CLA-01 S06 the closing opens the envelopes: below the package excluded, the others ranked", async () => {
    h.clock.set("2026-11-16T10:00:00.000Z");
    expect(await h.activities.closeRound({ auctionId })).toEqual({
      validOffers: 3,
      excludedOffers: 1,
      cancelled: false,
    });
    const offers = await read((tx) =>
      tx.offer.findMany({ where: { auctionId }, orderBy: { rank: "asc" } }),
    );
    const byAgency = (key: string) => offers.find((o) => o.organizationId === orgId(key));
    expect(byAgency("agenzia-uno")?.rank).toBe(1);
    // S06: same premium, Cinque guarantees longer than Tre.
    expect(byAgency("agenzia-cinque")?.rank).toBe(2);
    expect(byAgency("agenzia-tre")?.rank).toBe(3);
    expect(byAgency("agenzia-due")).toMatchObject({
      status: "EXCLUDED",
      exclusionReason: "COVERAGE:rca",
    });
    expect(byAgency("agenzia-uno")).toMatchObject({
      status: "AWAITING_CUSTOMER",
      annualGrossPremiumCents: 48000,
    });
    const ranking = await read((tx) => tx.ranking.findUniqueOrThrow({ where: { auctionId } }));
    expect(ranking.validCount).toBe(3);
    const request = await read((tx) =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
    );
    expect(request.status).toBe("OFFERS_AVAILABLE");
    const auction = await read((tx) => tx.auction.findUniqueOrThrow({ where: { id: auctionId } }));
    expect(auction.status).toBe("CLOSED");
  });

  it("BC-03 the key of the auction was used once, at the closing, by the worker", async () => {
    const decrypts = await read((tx) =>
      tx.kmsEvent.findMany({
        where: { operation: "DECRYPT", context: { path: ["auctionId"], equals: auctionId } },
      }),
    );
    expect(decrypts).toHaveLength(1);
    expect(decrypts[0]?.process).toBe("worker");
    expect(decrypts[0]?.at.toISOString()).toBe("2026-11-16T10:00:00.000Z");
  });

  it("the PDF quotes become ordinary documents of the request", async () => {
    const docs = await read((tx) =>
      tx.document.findMany({ where: { quoteRequestId: requestId, kind: "OFFER_QUOTE" } }),
    );
    expect(docs).toHaveLength(4);
    const text = new TextDecoder().decode(await h.storage.get(docs[0]?.storageKey ?? ""));
    expect(text.startsWith("%PDF-1.7 preventivo")).toBe(true);
  });

  it("CLA-04 the agencies learn only the status of their own offer, no price", async () => {
    const notes = await read((tx) =>
      tx.notification.findMany({ where: { eventKey: "auction.closed.agency" } }),
    );
    expect(notes.length).toBeGreaterThan(0);
    // No amount in euros ("480,00 €") in any title or text.
    expect(JSON.stringify(notes.map((n) => [n.title, n.body]))).not.toMatch(/€|\d+,\d{2}/);
  });

  it("a repeated closing changes nothing", async () => {
    expect(await h.activities.closeRound({ auctionId })).toEqual({
      validOffers: 3,
      excludedOffers: 1,
      cancelled: false,
    });
  });

  it("GAR-05 GAR-06 reminder about the best guaranteed offer, then «Scaduta» after the last guarantee", async () => {
    h.clock.set("2026-11-20T09:00:00.000Z");
    const schedule = await h.activities.guaranteeSchedule({ requestId });
    const best = await read((tx) =>
      tx.offer.findFirstOrThrow({ where: { auctionId, organizationId: orgId("agenzia-uno") } }),
    );
    // Uno, guaranteed until 3/12: reminder on 1/12 at 9:00 in Rome; the last guarantee (Cinque) ends 6/12.
    expect(schedule).toEqual({
      active: true,
      reminderAt: "2026-12-01T08:00:00.000Z",
      reminderOfferId: best.id,
      bestExpiresAt: "2026-12-03T23:00:00.000Z",
      allExpiredAt: "2026-12-06T23:00:00.000Z",
    });
    h.clock.set("2026-12-01T08:00:00.000Z");
    await h.activities.sendGuaranteeReminder({ requestId, offerId: best.id });
    await h.activities.sendGuaranteeReminder({ requestId, offerId: best.id });
    expect(
      await read((tx) =>
        tx.notification.count({
          where: {
            eventKey: "guarantee.expiring",
            payload: { path: ["quoteRequestId"], equals: requestId },
          },
        }),
      ),
    ).toBe(1);
    h.clock.set("2026-12-05T08:00:00.000Z");
    expect(await h.activities.expireRequest({ requestId })).toEqual({ expired: false });
    h.clock.set("2026-12-06T23:00:00.000Z");
    expect(await h.activities.expireRequest({ requestId })).toEqual({ expired: true });
    const request = await read((tx) =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
    );
    expect(request.status).toBe("EXPIRED");
  });
});

describe("deserted and back office actions (ASTA-06, ASTA-08)", () => {
  it("ASTA-08 no valid offer: the reopening invites the agencies not yet invited, then deserted", async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h);
    const main = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    if (!main.opened) throw new Error("not opened");
    h.clock.set(main.scheduledCloseAt);
    expect((await h.activities.closeRound({ auctionId: main.auctionId })).validOffers).toBe(0);
    const reopened = await h.activities.openRound({
      requestId: request.id,
      kind: "REOPEN",
      round: 2,
    });
    if (!reopened.opened) throw new Error("not reopened");
    // 10 synthetic agencies take cars: 8 in the main round, the other 2 now.
    expect(reopened.invited).toBe(2);
    h.clock.set(reopened.scheduledCloseAt);
    await h.activities.closeRound({ auctionId: reopened.auctionId });
    await h.activities.markDeserted({ requestId: request.id });
    const status = await read((tx) =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: request.id } }),
    );
    expect(status.status).toBe("DESERTED");
    expect(
      await read((tx) => tx.notification.count({ where: { eventKey: "auction.deserted.bo" } })),
    ).toBeGreaterThan(0);
  });

  it("ASTA-06 GAR-01 an extension moves the closing, not the minimum guarantee; it is logged with the reason", async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h);
    const opened = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    if (!opened.opened) throw new Error("not opened");
    const before = await read((tx) =>
      tx.auction.findUniqueOrThrow({ where: { id: opened.auctionId } }),
    );
    await h.activities.extendRound({
      auctionId: opened.auctionId,
      workingHours: 9,
      byUserId: before.id,
      reason: "Guasto tecnico",
    });
    const after = await read((tx) =>
      tx.auction.findUniqueOrThrow({ where: { id: opened.auctionId } }),
    );
    // 11:00 Monday plus 9 working hours: Tuesday 10:00 in Rome.
    expect(after.scheduledCloseAt.toISOString()).toBe("2026-11-17T09:00:00.000Z");
    expect(after.minGuaranteeDate).toEqual(before.minGuaranteeDate);
    const log = await read((tx) =>
      tx.auditLog.findFirstOrThrow({
        where: { action: "AUCTION_EXTENDED", targetId: opened.auctionId },
      }),
    );
    expect(log.reason).toBe("Guasto tecnico");
  });

  it("ASTA-06 invitations by the back office only in the first half", async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h, (q) => ({
      ...q,
      request: { ...q.request, auctionDurationHours: 5 },
    }));
    const opened = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    if (!opened.opened) throw new Error("not opened");
    const invited = await read((tx) =>
      tx.invitation.findMany({ where: { auctionId: opened.auctionId } }),
    );
    const free = (await read((tx) => tx.organization.findMany({ where: { type: "AGENCY" } })))
      .map((o) => o.id)
      .filter((id) => !invited.some((i) => i.organizationId === id));
    h.clock.set("2026-11-16T09:00:00.000Z"); // 10:00 in Rome: first half of 9:00-14:00
    expect(
      await h.activities.addInvitations({
        auctionId: opened.auctionId,
        organizationIds: free.slice(0, 1),
        byUserId: invited[0]?.id ?? "",
        reason: "Più compagnie",
      }),
    ).toEqual({ invited: 1 });
    h.clock.set("2026-11-16T10:30:00.000Z"); // 11:30: past the half
    await expect(
      h.activities.addInvitations({
        auctionId: opened.auctionId,
        organizationIds: free.slice(1, 2),
        byUserId: invited[0]?.id ?? "",
        reason: "Tardi",
      }),
    ).rejects.toThrow(/AFTER_FIRST_HALF/);
  });

  it("ASTA-06 a cancellation closes the auction without opening the envelopes; the request is «Deserta» (question 13)", async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h);
    const opened = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    if (!opened.opened) throw new Error("not opened");
    await sealedOffer(
      h,
      opened.auctionId,
      "agenzia-uno",
      {
        annualGrossPremiumCents: 50000,
        coverage: FULL_BASE_COVERAGE,
        guaranteeUntil: "2026-12-10",
        notes: null,
      },
      new Date(MONDAY_9),
    );
    await h.activities.cancelRound({
      auctionId: opened.auctionId,
      byUserId: opened.auctionId,
      reason: "Sospetta frode",
    });
    expect((await h.activities.closeRound({ auctionId: opened.auctionId })).cancelled).toBe(true);
    const offer = await read((tx) =>
      tx.offer.findFirstOrThrow({ where: { auctionId: opened.auctionId } }),
    );
    expect(offer.annualGrossPremiumCents).toBeNull();
    const status = await read((tx) =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: request.id } }),
    );
    expect(status.status).toBe("DESERTED");
  });
});

describe("S04 — asta deserta (ASTA-04, ASTA-07, ASTA-08)", () => {
  it("S04 a motorcycle approved Thursday 19/11/2026 at 17:30 for 1 hour, Nove paused until 18:15", async () => {
    const nove = orgId("agenzia-nove");
    await read((tx) =>
      tx.agencyCapacity.update({
        where: { organizationId: nove },
        data: { pausedUntil: new Date("2026-11-19T17:15:00.000Z") },
      }),
    );
    try {
      h.clock.set("2026-11-19T16:30:00.000Z"); // 17:30 in Rome
      const request = await approvedRequest(h, (q) => ({
        ...q,
        vehicle: { ...q.vehicle, type: "MOTORCYCLE" },
        request: { ...q.request, packageCode: "COMPLETE", auctionDurationHours: 1 },
      }));
      const main = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
      if (!main.opened) throw new Error("not opened");
      // Uno, Tre and Quattro are invited; the auction closes at 18:30, the reminder at half (18:00).
      const invited = async (auctionId: string) =>
        (await read((tx) => tx.invitation.findMany({ where: { auctionId } })))
          .map((i) => i.organizationId)
          .sort();
      expect(await invited(main.auctionId)).toEqual(
        [orgId("agenzia-uno"), orgId("agenzia-tre"), orgId("agenzia-quattro")].sort(),
      );
      expect(main.scheduledCloseAt).toBe("2026-11-19T17:30:00.000Z");
      expect(main.reminderAt).toBe("2026-11-19T17:00:00.000Z");
      // At half no offer: the top-up finds no other agency (Nove still paused).
      h.clock.set(main.topUpAt);
      expect(await h.activities.topUp({ auctionId: main.auctionId })).toEqual({ invited: 0 });
      h.clock.set(main.scheduledCloseAt);
      expect((await h.activities.closeRound({ auctionId: main.auctionId })).validOffers).toBe(0);
      // The reopening at 18:30 invites Nove and closes Friday 20/11 at 10:30.
      const reopened = await h.activities.openRound({
        requestId: request.id,
        kind: "REOPEN",
        round: 2,
      });
      if (!reopened.opened) throw new Error("not reopened");
      expect(await invited(reopened.auctionId)).toEqual([nove]);
      expect(reopened.scheduledCloseAt).toBe("2026-11-20T09:30:00.000Z");
      expect(
        await read((tx) =>
          tx.notification.count({
            where: {
              eventKey: "auction.reopened.requester",
              payload: { path: ["quoteRequestId"], equals: request.id },
            },
          }),
        ),
      ).toBe(1);
      // Also the reopening closes without offers: «Deserta», Davide and the back office are told.
      h.clock.set(reopened.scheduledCloseAt);
      await h.activities.closeRound({ auctionId: reopened.auctionId });
      await h.activities.markDeserted({ requestId: request.id });
      const status = await read((tx) =>
        tx.quoteRequest.findUniqueOrThrow({ where: { id: request.id } }),
      );
      expect(status.status).toBe("DESERTED");
    } finally {
      await read((tx) =>
        tx.agencyCapacity.update({ where: { organizationId: nove }, data: { pausedUntil: null } }),
      );
    }
  });
});
