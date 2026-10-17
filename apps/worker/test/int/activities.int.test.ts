import { addRequestEvent, SYSTEM_CONTEXT, withContext } from "@astax/db";
import { dbDateToCalendarDate } from "@astax/shared/format";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approvedRequest,
  FULL_BASE_COVERAGE,
  harness,
  insertSealedOffer,
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

  /** What the API writes when the requester presses «Chiedi riconferma». */
  const askReconfirmation = (at: string) =>
    read(async (tx) => {
      const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } });
      await addRequestEvent(tx, request, {
        type: "RECONFIRMATION_REQUESTED",
        actorKind: "REQUESTER",
        actorUserId: null,
        at: new Date(at),
      });
    });
  let reconfirmationId: string;

  it("GAR-06 no reconfirmation opens unless the requester asked for it (a repeated signal opens nothing)", async () => {
    h.clock.set("2026-12-07T08:00:00.000Z");
    expect(await h.activities.openRound({ requestId, kind: "RECONFIRMATION", round: 0 })).toEqual({
      opened: false,
      reason: "NOT_RECONFIRMABLE",
    });
  });

  it("GAR-07 BC-06 the reconfirmation asks only the agencies with a valid offer in the last round, with a new key pair and 24 working hours", async () => {
    await askReconfirmation("2026-12-07T08:00:00.000Z");
    const opened = await h.activities.openRound({ requestId, kind: "RECONFIRMATION", round: 0 });
    if (!opened.opened) throw new Error("not opened");
    reconfirmationId = opened.auctionId;
    const [main, round, invited, request] = await read((tx) =>
      Promise.all([
        tx.auction.findUniqueOrThrow({ where: { id: auctionId } }),
        tx.auction.findUniqueOrThrow({ where: { id: opened.auctionId } }),
        tx.invitation.findMany({ where: { auctionId: opened.auctionId } }),
        tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
      ]),
    );
    // Uno, Tre and Cinque had valid offers; Due was excluded at the closing.
    expect(invited.map((i) => i.organizationId).sort()).toEqual(
      [orgId("agenzia-uno"), orgId("agenzia-tre"), orgId("agenzia-cinque")].sort(),
    );
    expect(invited.every((i) => i.source === "RECONFIRMATION")).toBe(true);
    expect(round.kind).toBe("RECONFIRMATION");
    expect(round.round).toBe(main.round + 1);
    expect(round.durationHours).toBe(24);
    expect(round.publicKey).not.toEqual(main.publicKey);
    expect(request.status).toBe("IN_RECONFIRMATION");
    expect(request.reconfirmationsUsed).toBe(1);
    // A repetition finds the same round.
    const again = await h.activities.openRound({ requestId, kind: "RECONFIRMATION", round: 0 });
    expect(again.opened && again.auctionId).toBe(opened.auctionId);
    // GAR-07: no new agency at the top-up of a reconfirmation.
    expect(await h.activities.topUp({ auctionId: opened.auctionId })).toEqual({ invited: 0 });
    // Rule 8: the agencies are told without a price.
    const notes = await read((tx) =>
      tx.notification.findMany({
        where: {
          eventKey: "reconfirmation.requested",
          payload: { path: ["auctionId"], equals: opened.auctionId },
        },
      }),
    );
    expect(notes.length).toBeGreaterThan(0);
    expect(JSON.stringify(notes)).not.toContain("€");
  });

  it("GAR-07 proposal C a confirmation without a new PDF keeps the previous quote; the requester is told", async () => {
    const round = await read((tx) =>
      tx.auction.findUniqueOrThrow({ where: { id: reconfirmationId } }),
    );
    const until = dbDateToCalendarDate(round.minGuaranteeDate);
    const offer = await sealedOffer(
      h,
      reconfirmationId,
      "agenzia-uno",
      {
        company: "Compagnia Alfa",
        annualGrossPremiumCents: 48000,
        coverage: FULL_BASE_COVERAGE,
        guaranteeUntil: until,
        notes: null,
      },
      new Date("2026-12-07T09:00:00.000Z"),
    );
    await read((tx) =>
      tx.offer.update({
        where: { id: offer.id },
        data: { sealedPdfKey: null, sealedPdfDataKey: null },
      }),
    );
    h.clock.set(round.scheduledCloseAt.toISOString());
    expect((await h.activities.closeRound({ auctionId: reconfirmationId })).validOffers).toBe(1);
    const [closed, previous, request, told] = await read((tx) =>
      Promise.all([
        tx.offer.findUniqueOrThrow({ where: { id: offer.id } }),
        tx.offer.findFirstOrThrow({
          where: { auctionId, organizationId: orgId("agenzia-uno") },
        }),
        tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
        tx.notification.count({
          where: {
            eventKey: "reconfirmation.completed.requester",
            payload: { path: ["quoteRequestId"], equals: requestId },
          },
        }),
      ]),
    );
    expect(closed.status).toBe("AWAITING_CUSTOMER");
    expect(closed.pdfDocumentId).toBe(previous.pdfDocumentId);
    expect(request.status).toBe("OFFERS_AVAILABLE");
    expect(told).toBe(1);
  });
});

describe("GAR-06 automatic cancellation (proposal D)", () => {
  it("GAR-06 a request «Scaduta» without a reconfirmation for 30 days closes by itself", async () => {
    h.clock.set(MONDAY_9);
    const approved = await approvedRequest(h);
    const expiredAt = new Date("2026-12-01T10:00:00.000Z");
    await read(async (tx) => {
      const request = await tx.quoteRequest.update({
        where: { id: approved.id },
        data: { status: "EXPIRED" },
      });
      await addRequestEvent(tx, request, {
        type: "EXPIRED",
        actorKind: "SYSTEM",
        actorUserId: null,
        at: expiredAt,
      });
    });
    const schedule = await h.activities.expiredSchedule({ requestId: approved.id });
    expect(schedule).toEqual({
      expired: true,
      autoCancelAt: new Date(expiredAt.getTime() + 30 * 86_400_000).toISOString(),
    });
    h.clock.set("2026-12-30T10:00:00.000Z");
    expect(await h.activities.autoCancelExpired({ requestId: approved.id })).toEqual({
      cancelled: false,
    });
    h.clock.set(schedule.autoCancelAt ?? "");
    expect(await h.activities.autoCancelExpired({ requestId: approved.id })).toEqual({
      cancelled: true,
    });
    const [request, told] = await read((tx) =>
      Promise.all([
        tx.quoteRequest.findUniqueOrThrow({ where: { id: approved.id } }),
        tx.notification.count({
          where: {
            eventKey: "request.auto_cancelled",
            payload: { path: ["quoteRequestId"], equals: approved.id },
          },
        }),
      ]),
    );
    expect(request.status).toBe("CANCELLED");
    expect(told).toBe(1);
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

  it("ASTA-06 GAR-01 an extension moves the closing once, not the minimum guarantee; it is logged with the action", async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h);
    const opened = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    if (!opened.opened) throw new Error("not opened");
    const before = await read((tx) =>
      tx.auction.findUniqueOrThrow({ where: { id: opened.auctionId } }),
    );
    const extension = {
      auctionId: opened.auctionId,
      actionId: "00000000-0000-7000-8000-0000000000e1",
      workingHours: 9,
      byUserId: before.id,
    };
    await h.activities.extendRound(extension);
    // A repetition by Temporal (same action) changes nothing.
    await h.activities.extendRound(extension);
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
    expect(log.after).toMatchObject({ actionId: extension.actionId });
  });

  it("BC-05 no extension once the scheduled closing has passed", async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h);
    const opened = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    if (!opened.opened) throw new Error("not opened");
    h.clock.set("2026-11-16T10:10:00.000Z"); // 11:10, the closing was at 11:00
    await expect(
      h.activities.extendRound({
        auctionId: opened.auctionId,
        actionId: "00000000-0000-7000-8000-0000000000e2",
        workingHours: 1,
        byUserId: opened.auctionId,
      }),
    ).rejects.toThrow(/AUCTION_NOT_OPEN/);
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
        actionId: "00000000-0000-7000-8000-0000000000e3",
      }),
    ).toEqual({ invited: 1 });
    h.clock.set("2026-11-16T10:30:00.000Z"); // 11:30: past the half
    await expect(
      h.activities.addInvitations({
        auctionId: opened.auctionId,
        organizationIds: free.slice(1, 2),
        byUserId: invited[0]?.id ?? "",
        actionId: "00000000-0000-7000-8000-0000000000e4",
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
      actionId: "00000000-0000-7000-8000-0000000000e5",
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
      // ASTA-07: the reminder at 18:00 to the three invited agencies without an offer.
      h.clock.set(main.reminderAt);
      expect(await h.activities.remindAgencies({ auctionId: main.auctionId })).toEqual({
        reminded: 3,
      });
      const reminders = await read((tx) =>
        tx.notification.count({
          where: {
            eventKey: "auction.closing_soon",
            payload: { path: ["auctionId"], equals: main.auctionId },
          },
        }),
      );
      expect(reminders).toBeGreaterThanOrEqual(3);
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
      const told = await read(async (tx) => ({
        requester: await tx.notification.count({
          where: {
            eventKey: "auction.deserted.requester",
            payload: { path: ["quoteRequestId"], equals: request.id },
          },
        }),
        backOffice: await tx.notification.count({
          where: {
            eventKey: "auction.deserted.bo",
            payload: { path: ["quoteRequestId"], equals: request.id },
          },
        }),
      }));
      expect(told.requester).toBe(1);
      expect(told.backOffice).toBeGreaterThan(0);
    } finally {
      await read((tx) =>
        tx.agencyCapacity.update({ where: { organizationId: nove }, data: { pausedUntil: null } }),
      );
    }
  });
});

describe("closing against submissions (BC-03, BC-05) and what reaches Temporal (BC-07)", () => {
  it("BC-03 the envelopes are not opened before the scheduled closing", async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h);
    const opened = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    if (!opened.opened) throw new Error("not opened");
    h.clock.set("2026-11-16T09:59:00.000Z"); // one minute early
    await expect(h.activities.closeRound({ auctionId: opened.auctionId })).rejects.toThrow(
      /not due/,
    );
    const auction = await read((tx) =>
      tx.auction.findUniqueOrThrow({ where: { id: opened.auctionId } }),
    );
    expect(auction.status).toBe("OPEN");
  });

  it("BC-05 a submission holding the auction's lock when the closing comes is opened by that closing", async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h);
    const opened = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    if (!opened.opened) throw new Error("not opened");
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => undefined;
    const isLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    // The submission of the API: the row lock, then the sealed offer, then the commit.
    const submission = h.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.is_system', 'true', true)`;
        await tx.$queryRaw`SELECT 1 FROM "Auction" WHERE "id" = ${opened.auctionId}::uuid FOR UPDATE`;
        locked();
        await held;
        await insertSealedOffer(
          h,
          tx,
          opened.auctionId,
          "agenzia-uno",
          {
            annualGrossPremiumCents: 47000,
            coverage: FULL_BASE_COVERAGE,
            guaranteeUntil: "2026-12-10",
            notes: null,
          },
          new Date(MONDAY_9),
        );
      },
      { timeout: 20_000 },
    );
    await isLocked;
    h.clock.set(opened.scheduledCloseAt);
    // The closing comes while the submission holds the lock: it waits, then sees the offer.
    const closing = h.activities.closeRound({ auctionId: opened.auctionId });
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await submission;
    expect((await closing).validOffers).toBe(1);
  });

  it("BC-07 SIC-06 what the activities return to Temporal holds identifiers, counts and instants only", async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h);
    const opened = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    if (!opened.opened) throw new Error("not opened");
    await sealedOffer(
      h,
      opened.auctionId,
      "agenzia-tre",
      {
        company: "Compagnia Beta",
        annualGrossPremiumCents: 46100,
        coverage: FULL_BASE_COVERAGE,
        guaranteeUntil: "2026-12-10",
        notes: "Nota",
      },
      new Date(MONDAY_9),
    );
    h.clock.set(opened.scheduledCloseAt);
    const outputs = [
      opened,
      await h.activities.roundTimes({ auctionId: opened.auctionId }),
      await h.activities.topUp({ auctionId: opened.auctionId }),
      await h.activities.closeRound({ auctionId: opened.auctionId }),
      await h.activities.guaranteeSchedule({ requestId: request.id }),
    ];
    const text = JSON.stringify(outputs);
    for (const forbidden of [
      "46100",
      "461,00",
      "Compagnia",
      "Beta",
      "Giulia",
      "Neri",
      "NREGLI",
      "@example.test",
      "Nota",
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
  });
});
