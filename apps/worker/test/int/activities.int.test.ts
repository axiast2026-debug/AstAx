import { randomUUID } from "node:crypto";
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
  userId,
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
        details: { used: request.reconfirmationsUsed },
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
    // GAR-07 ASTA-02: 24 working hours from Monday 7/12 at 9:00, Tuesday 8/12 a holiday:
    // Monday 10, Wednesday 10, Thursday 4 hours: Thursday 10/12 at 13:00 in Rome.
    expect(round.scheduledCloseAt.toISOString()).toBe("2026-12-10T12:00:00.000Z");
    expect(round.publicKey).not.toEqual(main.publicKey);
    expect(request.status).toBe("IN_RECONFIRMATION");
    expect(request.reconfirmationsUsed).toBe(1);
    // A repetition finds the same round.
    const again = await h.activities.openRound({ requestId, kind: "RECONFIRMATION", round: 0 });
    expect(again.opened && again.auctionId).toBe(opened.auctionId);
    // GAR-07: no new agency at the top-up of a reconfirmation.
    expect(await h.activities.topUp({ auctionId: opened.auctionId })).toEqual({ invited: 0 });
    // Question 15A: each agency reads the price of its own offer.
    const notes = await read((tx) =>
      tx.notification.findMany({
        where: {
          eventKey: "reconfirmation.requested",
          payload: { path: ["auctionId"], equals: opened.auctionId },
        },
      }),
    );
    expect(notes.length).toBeGreaterThan(0);
    const mails = h.email.sent.filter((m) => m.subject.startsWith("Riconferma entro"));
    expect(mails.length).toBeGreaterThan(0);
    expect(mails.every((m) => /\d+,\d{2}\s€/.test(m.text))).toBe(true);
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
    // Expired on 1/12 (Rome): closed at the start of 1/1, after 30 whole calendar days.
    expect(schedule).toEqual({ expired: true, autoCancelAt: "2026-12-31T23:00:00.000Z" });
    h.clock.set("2026-12-31T22:59:00.000Z");
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

  it("ASTA-06 a cancellation closes the auction without opening the envelopes; the request is «Annullata» (question 13, answer B)", async () => {
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
    expect(status.status).toBe("CANCELLED");
    const told = await read((tx) =>
      tx.notification.count({
        where: {
          eventKey: "auction.cancelled.requester",
          payload: { path: ["quoteRequestId"], equals: request.id },
        },
      }),
    );
    expect(told).toBeGreaterThan(0);
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

describe("OFF-09 check of the PDF quotes after the closing (decision 16)", () => {
  it("OFF-09 a premium in the PDF different from the declared one is a flag for the back office, never an exclusion", async () => {
    h.clock.set(MONDAY_9);
    const request = await approvedRequest(h);
    const opened = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    if (!opened.opened) throw new Error("not opened");
    const at = new Date(Date.parse(MONDAY_9) + 10 * 60_000);
    const base = { coverage: FULL_BASE_COVERAGE, guaranteeUntil: "2026-12-10", notes: null };
    const differs = await sealedOffer(
      h,
      opened.auctionId,
      "agenzia-uno",
      {
        ...base,
        company: "Compagnia Alfa",
        annualGrossPremiumCents: 48000,
        pdfText: "%PDF-1.7\nCompagnia: Compagnia Alfa\nPremio: 470,00\n",
      },
      at,
    );
    const same = await sealedOffer(
      h,
      opened.auctionId,
      "agenzia-tre",
      {
        ...base,
        company: "Compagnia Beta",
        annualGrossPremiumCents: 50500,
        pdfText: "%PDF-1.7\nCompagnia: Compagnia Beta\nPremio: 505,00\n",
      },
      at,
    );
    const unreadable = await sealedOffer(
      h,
      opened.auctionId,
      "agenzia-cinque",
      { ...base, company: "Compagnia Beta", annualGrossPremiumCents: 51000 },
      at,
    );
    // Decision 16: never before the closing.
    expect(await h.activities.reviewQuotes({ auctionId: opened.auctionId })).toEqual({
      checked: 0,
      flagged: 0,
    });
    h.clock.set(opened.scheduledCloseAt);
    expect((await h.activities.closeRound({ auctionId: opened.auctionId })).validOffers).toBe(3);
    expect(await h.activities.reviewQuotes({ auctionId: opened.auctionId })).toEqual({
      checked: 3,
      flagged: 1,
    });
    // A repetition writes nothing twice.
    expect(await h.activities.reviewQuotes({ auctionId: opened.auctionId })).toEqual({
      checked: 0,
      flagged: 0,
    });
    const checks = await read((tx) =>
      tx.offerQuoteCheck.findMany({ where: { quoteRequestId: request.id } }),
    );
    const of = (id: string) => checks.find((c) => c.offerId === id);
    expect(of(differs.id)).toMatchObject({
      result: "MISMATCH",
      differences: [{ field: "annualGrossPremiumCents", declared: 48000, read: 47000 }],
    });
    expect(of(same.id)?.result).toBe("MATCH");
    expect(of(unreadable.id)?.result).toBe("UNREADABLE");
    // The binding offer stays the declared one: nothing excluded by the check.
    const offer = await read((tx) => tx.offer.findUniqueOrThrow({ where: { id: differs.id } }));
    expect(offer.status).toBe("AWAITING_CUSTOMER");
    // Rule 8: the back office is told without the premiums.
    const notes = await read((tx) =>
      tx.notification.findMany({
        where: {
          eventKey: "offer.quote_mismatch.bo",
          payload: { path: ["quoteRequestId"], equals: request.id },
        },
      }),
    );
    expect(notes.length).toBeGreaterThan(0);
    // Only what is written to the people: random ids may contain the same digits.
    expect(JSON.stringify(notes.map((n) => [n.title, n.body]))).not.toMatch(/470|480|€/);
  });
});

describe("phase 5: issuance deadline and an unpaid acceptance (EMI-01, PAG-03)", () => {
  it("EMI-01 the agency and the back office are reminded once, 60 minutes before the deadline", async () => {
    h.clock.set(MONDAY_9);
    const created = await approvedRequest(h);
    const request = await read((tx) =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: created.id } }),
    );
    const opened = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    if (!opened.opened) throw new Error("not opened");
    const offer = await sealedOffer(
      h,
      opened.auctionId,
      "agenzia-uno",
      {
        company: "Compagnia Alfa",
        annualGrossPremiumCents: 52000,
        coverage: FULL_BASE_COVERAGE,
        guaranteeUntil: "2026-12-05",
        notes: null,
      },
      new Date(Date.parse(MONDAY_9) + 60_000),
    );
    await read(async (tx) => {
      await tx.quoteRequest.update({ where: { id: request.id }, data: { status: "IN_ISSUANCE" } });
      await tx.acceptance.create({
        data: {
          quoteRequestId: request.id,
          offerId: offer.id,
          ownerUserId: request.ownerUserId,
          ownerOrganizationId: request.ownerOrganizationId,
          acceptedByUserId: request.requesterUserId,
          premiumCents: 52000,
          feeCents: 3000,
          feeRule: "PRIVATE",
          aiUsed: false,
          status: "PAID",
          paidAt: new Date("2026-11-16T11:30:00.000Z"),
          issuanceDeadlineAt: new Date("2026-11-16T15:30:00.000Z"),
        },
      });
    });
    expect(await h.activities.issuanceSchedule({ requestId: request.id })).toEqual({
      deadlineAt: "2026-11-16T15:30:00.000Z",
      reminderAt: "2026-11-16T14:30:00.000Z",
    });
    await h.activities.sendIssuanceReminder({ requestId: request.id });
    await h.activities.sendIssuanceReminder({ requestId: request.id });
    const sent = await read((tx) =>
      tx.notification.findMany({
        where: {
          eventKey: { in: ["issuance.deadline_near", "issuance.deadline_near.bo"] },
          payload: { path: ["quoteRequestId"], equals: request.id },
        },
      }),
    );
    expect(new Set(sent.map((n) => n.eventKey))).toEqual(
      new Set(["issuance.deadline_near", "issuance.deadline_near.bo"]),
    );
    const agencyNotes = sent.filter((n) => n.eventKey === "issuance.deadline_near");
    const perUser = new Set(agencyNotes.map((n) => n.userId));
    expect(perUser.size).toBe(agencyNotes.length);
    expect(JSON.stringify(sent)).not.toContain("€");
  });

  it("PAG-03 signed but unpaid when every guarantee ends: the acceptance lapses and the request is «Scaduta»", async () => {
    h.clock.set(MONDAY_9);
    const created = await approvedRequest(h);
    const request = await read((tx) =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: created.id } }),
    );
    const opened = await h.activities.openRound({ requestId: request.id, kind: "MAIN", round: 1 });
    if (!opened.opened) throw new Error("not opened");
    await sealedOffer(
      h,
      opened.auctionId,
      "agenzia-uno",
      {
        company: "Compagnia Alfa",
        annualGrossPremiumCents: 52000,
        coverage: FULL_BASE_COVERAGE,
        guaranteeUntil: "2026-12-05",
        notes: null,
      },
      new Date(Date.parse(MONDAY_9) + 60_000),
    );
    h.clock.set(opened.scheduledCloseAt);
    await h.activities.closeRound({ auctionId: opened.auctionId });
    const offer = await read((tx) =>
      tx.offer.findFirstOrThrow({ where: { auctionId: opened.auctionId } }),
    );
    await read(async (tx) => {
      await tx.quoteRequest.update({ where: { id: request.id }, data: { status: "ACCEPTED" } });
      await tx.acceptance.create({
        data: {
          quoteRequestId: request.id,
          offerId: offer.id,
          ownerUserId: request.ownerUserId,
          ownerOrganizationId: request.ownerOrganizationId,
          acceptedByUserId: request.requesterUserId,
          premiumCents: 52000,
          feeCents: 3000,
          feeRule: "PRIVATE",
          aiUsed: false,
          status: "SIGNED",
        },
      });
    });
    const schedule = await h.activities.guaranteeSchedule({ requestId: request.id });
    expect(schedule.active).toBe(true);
    h.clock.set("2026-12-06T00:00:00.000Z");
    expect(await h.activities.expireRequest({ requestId: request.id })).toEqual({ expired: true });
    const [after, acceptance] = await read((tx) =>
      Promise.all([
        tx.quoteRequest.findUniqueOrThrow({ where: { id: request.id } }),
        tx.acceptance.findFirstOrThrow({ where: { quoteRequestId: request.id } }),
      ]),
    );
    expect(after.status).toBe("EXPIRED");
    expect(acceptance).toMatchObject({ status: "VOIDED", voidReason: "GUARANTEE_EXPIRED" });
  });
});

describe("phase 6: the issuance steps (EMI-01, EMI-03, EMI-04)", () => {
  it("EMI-01 EMI-03 EMI-04 reminder, delay with the penalty proposed, missed issuance at the start of cover, each once", async () => {
    h.clock.set(MONDAY_9);
    const created = await approvedRequest(h);
    const opened = await h.activities.openRound({ requestId: created.id, kind: "MAIN", round: 1 });
    if (!opened.opened) throw new Error("not opened");
    const offer = await sealedOffer(
      h,
      opened.auctionId,
      "agenzia-uno",
      {
        company: "Compagnia Alfa",
        annualGrossPremiumCents: 52000,
        coverage: FULL_BASE_COVERAGE,
        guaranteeUntil: "2026-12-05",
        notes: null,
      },
      new Date(Date.parse(MONDAY_9) + 60_000),
    );
    const request = await read(async (tx) => {
      const updated = await tx.quoteRequest.update({
        where: { id: created.id },
        data: { status: "IN_ISSUANCE", startDate: new Date("2026-11-20") },
      });
      await tx.offer.update({ where: { id: offer.id }, data: { status: "WINNING" } });
      const acceptance = await tx.acceptance.create({
        data: {
          quoteRequestId: updated.id,
          offerId: offer.id,
          ownerUserId: updated.ownerUserId,
          ownerOrganizationId: updated.ownerOrganizationId,
          acceptedByUserId: updated.requesterUserId,
          premiumCents: 52000,
          feeCents: 3000,
          feeRule: "PRIVATE",
          aiUsed: false,
          status: "PAID",
          paidAt: new Date("2026-11-16T11:30:00.000Z"),
          issuanceDeadlineAt: new Date("2026-11-16T15:30:00.000Z"),
        },
      });
      await tx.payment.create({
        data: {
          acceptanceId: acceptance.id,
          ownerUserId: updated.ownerUserId,
          ownerOrganizationId: updated.ownerOrganizationId,
          provider: "fake-payments",
          premiumCents: 52000,
          feeCents: 3000,
          idempotencyKey: `${acceptance.id}-1`,
          status: "CAPTURED",
          capturedAt: new Date("2026-11-16T11:30:00.000Z"),
        },
      });
      return updated;
    });
    const steps = () => h.activities.issuanceSteps({ requestId: request.id });
    expect(await steps()).toEqual({
      inIssuance: true,
      issued: false,
      nextStepAt: "2026-11-16T14:30:00.000Z",
    });
    // Not due yet: nothing happens.
    await h.activities.runIssuanceStep({ requestId: request.id, force: false });
    expect((await steps()).nextStepAt).toBe("2026-11-16T14:30:00.000Z");
    h.clock.set("2026-11-16T14:30:00.000Z");
    await h.activities.runIssuanceStep({ requestId: request.id, force: false });
    expect((await steps()).nextStepAt).toBe("2026-11-16T15:30:00.000Z");
    h.clock.set("2026-11-16T15:30:00.000Z");
    await h.activities.runIssuanceStep({ requestId: request.id, force: false });
    await h.activities.runIssuanceStep({ requestId: request.id, force: false });
    const penalties = await read((tx) =>
      tx.penalty.findMany({ where: { quoteRequestId: request.id } }),
    );
    expect(penalties.map((p) => [p.type, p.status, p.amountCents])).toEqual([
      ["LATE_ISSUANCE", "PROPOSED", 2500],
    ]);
    // The start of cover: Friday 20/11 at 00:00 in Rome.
    expect((await steps()).nextStepAt).toBe("2026-11-19T23:00:00.000Z");
    await h.activities.runIssuanceStep({ requestId: request.id, force: true });
    const [problem, notes] = await read((tx) =>
      Promise.all([
        tx.issuanceProblem.findFirst({ where: { quoteRequestId: request.id } }),
        tx.notification.findMany({
          where: {
            payload: { path: ["quoteRequestId"], equals: request.id },
            eventKey: { startsWith: "issuance." },
          },
        }),
      ]),
    );
    expect(problem).toMatchObject({ type: "MISSED_DEADLINE", status: "OPEN" });
    expect(new Set(notes.map((n) => n.eventKey))).toEqual(
      new Set([
        "issuance.deadline_near",
        "issuance.deadline_near.bo",
        "issuance.deadline_passed",
        "issuance.deadline_passed.bo",
        "issuance.missed.bo",
      ]),
    );
    expect(JSON.stringify(notes)).not.toContain("€");
    expect(await steps()).toEqual({ inIssuance: true, issued: false, nextStepAt: null });

    // EMI-04: a second offer not answered within its time: the full refund, to approve.
    await read(async (tx) => {
      await tx.quoteRequest.update({ where: { id: request.id }, data: { status: "ACCEPTED" } });
      await tx.offer.update({ where: { id: offer.id }, data: { status: "MISSED_ISSUANCE" } });
      await tx.nextOfferProposal.create({
        data: {
          quoteRequestId: request.id,
          ownerUserId: request.ownerUserId,
          ownerOrganizationId: request.ownerOrganizationId,
          kind: "REPRICE",
          fromOfferId: offer.id,
          toOfferId: offer.id,
          premiumCents: 54000,
          feeCents: 3000,
          differenceCents: 2000,
          expiresAt: new Date("2026-11-17T15:30:00.000Z"),
        },
      });
    });
    expect((await steps()).nextStepAt).toBe("2026-11-17T15:30:00.000Z");
    h.clock.set("2026-11-17T15:30:00.000Z");
    await h.activities.runIssuanceStep({ requestId: request.id, force: false });
    const [after, proposal, refund] = await read((tx) =>
      Promise.all([
        tx.quoteRequest.findUniqueOrThrow({ where: { id: request.id } }),
        tx.nextOfferProposal.findFirstOrThrow({ where: { quoteRequestId: request.id } }),
        tx.refund.findFirst({ where: { quoteRequestId: request.id } }),
      ]),
    );
    expect(after.status).toBe("IN_ISSUANCE");
    expect(proposal.status).toBe("EXPIRED");
    expect(refund).toMatchObject({
      reason: "BEFORE_ISSUANCE",
      premiumCents: 52000,
      feeCents: 3000,
      status: "REQUESTED",
    });
  });
});

describe("phase 6: the policy steps (decision 39, process 10, proposal E)", () => {
  async function issuedPolicy(options: { broker: boolean; agency: string }) {
    const created = await approvedRequest(h);
    return read(async (tx) => {
      if (options.broker) {
        await tx.quoteRequest.update({
          where: { id: created.id },
          data: {
            channel: "BROKER",
            ownerUserId: null,
            ownerOrganizationId: orgId("broker-demo"),
            requesterUserId: userId("broker-owner"),
          },
        });
      }
      const company = await tx.insuranceCompany.findFirstOrThrow({
        where: { name: "Compagnia Alfa" },
      });
      const policy = await tx.policy.create({
        data: {
          quoteRequestId: created.id,
          offerId: randomUUID(),
          acceptanceId: randomUUID(),
          organizationId: orgId(options.agency),
          companyId: company.id,
          ...(options.broker
            ? { ownerOrganizationId: orgId("broker-demo") }
            : { ownerUserId: userId("private-giulia-neri") }),
          policyNumber: `POL-${created.code}`,
          startDate: new Date("2026-11-20"),
          endDate: new Date("2027-11-19"),
          premiumCents: 52000,
          issuedAt: new Date(MONDAY_9),
          issuedByUserId: userId(`${options.agency}-operator`),
          autoRenewal: options.broker,
        },
      });
      return { requestId: created.id, policy };
    });
  }

  it("the questionnaire 7 days after the issuance, by email only, once", async () => {
    h.clock.set(MONDAY_9);
    const { requestId, policy } = await issuedPolicy({ broker: false, agency: "agenzia-uno" });
    // Monday 23/11 at 9:00 in Rome.
    expect(await h.activities.policySteps({ requestId })).toEqual({
      active: true,
      nextStepAt: "2026-11-23T08:00:00.000Z",
    });
    await h.activities.runPolicyStep({ requestId, force: false });
    expect(await read((tx) => tx.postSaleSurvey.count({ where: { policyId: policy.id } }))).toBe(0);
    h.clock.set("2026-11-23T08:00:00.000Z");
    const before = h.email.sent.length;
    await h.activities.runPolicyStep({ requestId, force: false });
    await h.activities.runPolicyStep({ requestId, force: false });
    expect(await read((tx) => tx.postSaleSurvey.count({ where: { policyId: policy.id } }))).toBe(1);
    const mails = h.email.sent.slice(before);
    expect(mails).toHaveLength(1);
    expect(mails[0]?.text).toContain("http://web.test/questionario/");
  });

  it("the renewal notice 30 days before the end: «In scadenza»; a broker's customer with the automatic renewal gets the draft", async () => {
    h.clock.set(MONDAY_9);
    const { requestId, policy } = await issuedPolicy({ broker: true, agency: "agenzia-dieci" });
    // The questionnaire first (forced), then the notice: 20/10/2027 at 9:00 in Rome.
    await h.activities.runPolicyStep({ requestId, force: true });
    expect(await h.activities.policySteps({ requestId })).toEqual({
      active: true,
      nextStepAt: "2027-10-20T07:00:00.000Z",
    });
    h.clock.set("2027-10-20T07:00:00.000Z");
    await h.activities.runPolicyStep({ requestId, force: false });
    const [after, notes] = await read((tx) =>
      Promise.all([
        tx.policy.findUniqueOrThrow({ where: { id: policy.id } }),
        tx.notification.findMany({
          where: {
            eventKey: "renewal.upcoming.broker",
            payload: { path: ["policyId"], equals: policy.id },
          },
        }),
      ]),
    );
    expect(after.status).toBe("EXPIRING");
    expect(after.renewalRequestId).not.toBeNull();
    expect(notes).toHaveLength(1);
    expect(notes[0]?.body).toContain("la bozza è pronta");
    const draft = await read((tx) =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: after.renewalRequestId ?? "" } }),
    );
    expect(draft).toMatchObject({ status: "DRAFT", renewalOfPolicyId: policy.id });

    // Process 10: the renewal's auction invites the agency that issued the policy.
    const renewal = await approvedRequest(h);
    await read((tx) =>
      tx.quoteRequest.update({
        where: { id: renewal.id },
        data: { renewalOfPolicyId: policy.id },
      }),
    );
    h.clock.set(MONDAY_9);
    // Agenzia Dieci on pause: the automatic choice leaves it out, the renewal does not.
    const capacity = await read((tx) =>
      tx.agencyCapacity.findUnique({ where: { organizationId: orgId("agenzia-dieci") } }),
    );
    await read((tx) =>
      tx.agencyCapacity.update({
        where: { organizationId: orgId("agenzia-dieci") },
        data: { pausedUntil: new Date("2030-01-01T00:00:00Z") },
      }),
    );
    try {
      const opened = await h.activities.openRound({
        requestId: renewal.id,
        kind: "MAIN",
        round: 1,
      });
      if (!opened.opened) throw new Error("not opened");
      const invited = await read((tx) =>
        tx.invitation.findMany({ where: { auctionId: opened.auctionId } }),
      );
      expect(invited.find((i) => i.organizationId === orgId("agenzia-dieci"))?.source).toBe(
        "RENEWAL",
      );
    } finally {
      await read((tx) =>
        tx.agencyCapacity.update({
          where: { organizationId: orgId("agenzia-dieci") },
          data: { pausedUntil: capacity?.pausedUntil ?? null },
        }),
      );
    }

    // The end: «Scaduta» the day after the last day, 00:00 in Rome; then no more steps.
    h.clock.set("2027-11-19T23:00:00.000Z");
    await h.activities.runPolicyStep({ requestId, force: false });
    expect(
      (await read((tx) => tx.policy.findUniqueOrThrow({ where: { id: policy.id } }))).status,
    ).toBe("EXPIRED");
    expect(await h.activities.policySteps({ requestId })).toEqual({
      active: false,
      nextStepAt: null,
    });
  });
});

describe("phase 6: the agency at fault has nothing more to do (EMI-04, decision 27)", () => {
  it("EMI-04 no reminder, no delay penalty, no new case once the offer is «Mancata emissione»", async () => {
    h.clock.set(MONDAY_9);
    const created = await approvedRequest(h);
    const opened = await h.activities.openRound({ requestId: created.id, kind: "MAIN", round: 1 });
    if (!opened.opened) throw new Error("not opened");
    const offer = await sealedOffer(
      h,
      opened.auctionId,
      "agenzia-uno",
      {
        company: "Compagnia Alfa",
        annualGrossPremiumCents: 52000,
        coverage: FULL_BASE_COVERAGE,
        guaranteeUntil: "2026-12-05",
        notes: null,
      },
      new Date(Date.parse(MONDAY_9) + 60_000),
    );
    const request = await read(async (tx) => {
      const updated = await tx.quoteRequest.update({
        where: { id: created.id },
        data: { status: "IN_ISSUANCE", startDate: new Date("2026-11-20") },
      });
      await tx.offer.update({ where: { id: offer.id }, data: { status: "WINNING" } });
      const acceptance = await tx.acceptance.create({
        data: {
          quoteRequestId: updated.id,
          offerId: offer.id,
          ownerUserId: updated.ownerUserId,
          ownerOrganizationId: updated.ownerOrganizationId,
          acceptedByUserId: updated.requesterUserId,
          premiumCents: 52000,
          feeCents: 3000,
          feeRule: "PRIVATE",
          aiUsed: false,
          status: "PAID",
          paidAt: new Date("2026-11-16T11:30:00.000Z"),
          issuanceDeadlineAt: new Date("2026-11-16T15:30:00.000Z"),
        },
      });
      await tx.payment.create({
        data: {
          acceptanceId: acceptance.id,
          ownerUserId: updated.ownerUserId,
          ownerOrganizationId: updated.ownerOrganizationId,
          provider: "fake-payments",
          premiumCents: 52000,
          feeCents: 3000,
          idempotencyKey: `${acceptance.id}-1`,
          status: "CAPTURED",
          capturedAt: new Date("2026-11-16T11:30:00.000Z"),
        },
      });
      return updated;
    });
    await read((tx) =>
      tx.offer.update({ where: { id: offer.id }, data: { status: "MISSED_ISSUANCE" } }),
    );
    expect(await h.activities.issuanceSteps({ requestId: request.id })).toEqual({
      inIssuance: true,
      issued: false,
      nextStepAt: null,
    });
    h.clock.set("2026-11-20T08:00:00.000Z");
    // Reminder, deadline and start of cover would all be due by now.
    for (let i = 0; i < 3; i += 1) {
      await h.activities.runIssuanceStep({ requestId: request.id, force: true });
    }
    const [penalties, problems] = await read((tx) =>
      Promise.all([
        tx.penalty.count({ where: { quoteRequestId: request.id } }),
        tx.issuanceProblem.count({ where: { quoteRequestId: request.id } }),
      ]),
    );
    expect({ penalties, problems }).toEqual({ penalties: 0, problems: 0 });
  });
});
