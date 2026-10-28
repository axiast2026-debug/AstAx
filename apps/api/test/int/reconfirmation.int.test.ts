import { SYSTEM_CONTEXT, addRequestEvent, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openTestAuction } from "./auction-helpers.js";
import { acceptAllLegal, membershipId, orgId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 4: «Chiedi riconferma» (GAR-06) and the agencies' answers (GAR-07, proposal C).
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let customer: Who;
let requestId: string;

const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  for (const key of ["bo-verifier", "agenzia-uno-owner"] as const) await acceptAllLegal(h, key);
  const email = "privato.riconferma@example.test";
  customer = {
    token: await h.token({
      sub: "kc-private-reconfirmation-test",
      azp: "astax-web-private",
      roles: ["astax-private"],
      email,
      givenName: "Privato",
      familyName: "Riconferma",
    }),
  };
  const pending = (await (await h.call("/legal/pending", customer)).json()) as {
    versionId: string;
  }[];
  await h.call("/legal/acceptances", {
    ...customer,
    body: { versionIds: pending.map((p) => p.versionId) },
  });
  requestId = (await r.submittedPrivateRequest(customer, email)).id;
  await r.json(
    await r.approve(
      {
        token: await h.tokenFor("bo-verifier"),
        context: membershipId("bo-verifier", "astax"),
      },
      requestId,
    ),
    200,
  );
});

afterAll(async () => {
  await h.close();
});

const COVERAGE = {
  rca: { limitType: "SINGLE_LIMIT", singleLimitEur: 10_000_000 },
  recourseWaiver: { included: false },
  roadsideAssistance: { included: false },
  legalProtection: { included: false },
  driverAccident: { included: false },
  theftFire: { included: false },
  naturalEvents: { included: false },
  vandalism: { included: false },
  collisionKasko: { included: false },
  fullKasko: { included: false },
  wildlifeCollision: { included: false },
  glass: { included: false },
};

const ask = () => r.call(customer, `/requests/${requestId}/reconfirmation`, { body: {} });

describe("fase 4: reconfirmation (GAR-06, GAR-07)", () => {
  it("GAR-06 no reconfirmation while the request is not «Scaduta»", async () => {
    const problem = await r.json<{ errors: { issue: string }[] }>(await ask(), 409);
    expect(problem.errors.map((e) => e.issue)).toEqual(["NOT_EXPIRED"]);
  });

  it("GAR-06 «Chiedi riconferma» on a request «Scaduta»: once, logged, handed to the worker", async () => {
    await system((tx) =>
      tx.quoteRequest.update({ where: { id: requestId }, data: { status: "EXPIRED" } }),
    );
    await r.json(await ask(), 200);
    // A second click before the worker opens the round changes nothing.
    await r.json(await ask(), 200);
    const [events, outbox, audit] = await system((tx) =>
      Promise.all([
        tx.quoteRequestEvent.count({
          where: { quoteRequestId: requestId, type: "RECONFIRMATION_REQUESTED" },
        }),
        tx.outboxEvent.count({ where: { type: "ReconfirmationRequested" } }),
        tx.auditLog.count({ where: { action: "RECONFIRMATION_REQUESTED", targetId: requestId } }),
      ]),
    );
    expect(events).toBe(1);
    expect(outbox).toBeGreaterThanOrEqual(1);
    expect(audit).toBe(1);
    const status = await r.json<{ reconfirmation: { pending: boolean; available: boolean } }>(
      await r.call(customer, `/requests/${requestId}/auction`),
      200,
    );
    expect(status.reconfirmation).toMatchObject({ pending: true, available: false });
  });

  it("GAR-06 the requester sees when a request «Scaduta» closes by itself: the day after the last of requests.autoCancelExpiredDays, Rome midnight", async () => {
    await system(async (tx) => {
      const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } });
      await addRequestEvent(tx, request, {
        type: "EXPIRED",
        actorKind: "SYSTEM",
        actorUserId: null,
        at: new Date("2026-11-10T10:00:00Z"),
      });
    });
    const status = await r.json<{ reconfirmation: { autoCancelAt: string | null } }>(
      await r.call(customer, `/requests/${requestId}/auction`),
      200,
    );
    // Expired on 10/11, 30 days: it closes at the start of 11/12, Rome time (UTC+1).
    expect(status.reconfirmation.autoCancelAt).toBe("2026-12-10T23:00:00.000Z");
  });

  it("GAR-06 at most reconfirmation.maxPerRequest reconfirmations per request", async () => {
    await system(async (tx) => {
      const request = await tx.quoteRequest.update({
        where: { id: requestId },
        data: { reconfirmationsUsed: 2 },
      });
      await addRequestEvent(tx, request, {
        type: "RECONFIRMATION_OPENED",
        actorKind: "SYSTEM",
        actorUserId: null,
        at: h.clock.now(),
      });
    });
    const problem = await r.json<{ errors: { issue: string }[] }>(await ask(), 409);
    expect(problem.errors.map((e) => e.issue)).toEqual(["RECONFIRMATIONS_USED_UP"]);
  });

  it("GAR-07 proposal C OFF-04 without a new PDF only a confirmation of the same premium, company and product is accepted", async () => {
    const uno: Who = {
      token: await h.tokenFor("agenzia-uno-owner"),
      context: membershipId("agenzia-uno-owner", "agenzia-uno"),
    };
    // The last closed round: Agenzia Uno's offer, now expired, with its quote.
    const main = await openTestAuction(h, requestId, ["agenzia-uno"]);
    const detail = await r.json<{
      companies: { id: string }[];
      products: { id: string; companyId: string }[];
    }>(await r.call(uno, `/agency/requests/${main}`), 200);
    const company = detail.companies[0]?.id ?? "";
    const productId = detail.products.find((p) => p.companyId === company)?.id ?? "";
    const owner = membershipId("agenzia-uno-owner", "agenzia-uno");
    await system(async (tx) => {
      const member = await tx.membership.findUniqueOrThrow({ where: { id: owner } });
      const document = await tx.document.create({
        data: {
          kind: "OFFER_QUOTE",
          ownerUserId: (await tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }))
            .ownerUserId,
          quoteRequestId: requestId,
          storageKey: `documents/test-${main}`,
          sha256: "0".repeat(64),
          mime: "application/pdf",
          size: 10,
          fileName: "preventivo.pdf",
          uploadedByUserId: member.userId,
        },
      });
      await tx.offer.create({
        data: {
          auctionId: main,
          organizationId: orgId("agenzia-uno"),
          membershipId: owner,
          userId: member.userId,
          submittedAt: h.clock.now(),
          lastChangedAt: h.clock.now(),
          sealedPayload: "test",
          ownerCopy: "test",
          status: "EXPIRED",
          annualGrossPremiumCents: 48000,
          companyId: company,
          productId,
          coverage: COVERAGE,
          guaranteeUntil: new Date("2026-12-01"),
          pdfDocumentId: document.id,
        },
      });
      await tx.auction.update({ where: { id: main }, data: { status: "CLOSED" } });
    });
    const auctionId = await openTestAuction(h, requestId, ["agenzia-uno"], {
      kind: "RECONFIRMATION",
      round: 2,
    });
    const answer = await r.json<{
      kind: string;
      previousOffer: { annualGrossPremiumCents: number };
    }>(await r.call(uno, `/agency/requests/${auctionId}`), 200);
    expect(answer.kind).toBe("RECONFIRMATION");
    expect(answer.previousOffer.annualGrossPremiumCents).toBe(48000);
    await r.json(await r.call(uno, `/auctions/${auctionId}/claim`, { body: {} }), 200);
    const send = (premium: number) =>
      fetch(`${h.baseUrl}/auctions/${auctionId}/offers`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${uno.token}`,
          "x-astax-context": uno.context ?? "",
          "x-offer": Buffer.from(
            JSON.stringify({
              annualGrossPremiumCents: premium,
              companyId: company,
              productId,
              coverage: COVERAGE,
              guaranteeUntil: "2026-12-20",
              notes: null,
              binding: true,
            }),
          ).toString("base64url"),
        },
      });
    // An update of the premium needs its own quote: the old PDF says another price.
    const update = await r.json<{ errors: { path: string; issue: string }[] }>(
      await send(45000),
      400,
    );
    expect(update.errors).toContainEqual({ path: "pdf", issue: "PDF_REQUIRED" });
    const confirmed = await send(48000);
    expect(confirmed.status).toBe(201);
    const { id: answerId } = (await confirmed.json()) as { id: string };
    // OFF-07: changing the premium later, still without a new PDF, is refused too.
    const changed = await fetch(`${h.baseUrl}/offers/${answerId}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${uno.token}`,
        "x-astax-context": uno.context ?? "",
        "x-offer": Buffer.from(
          JSON.stringify({
            annualGrossPremiumCents: 46000,
            companyId: company,
            productId,
            coverage: COVERAGE,
            guaranteeUntil: "2026-12-20",
            notes: null,
            binding: true,
          }),
        ).toString("base64url"),
      },
    });
    const refusedChange = await r.json<{ errors: { path: string; issue: string }[] }>(changed, 400);
    expect(refusedChange.errors).toContainEqual({ path: "pdf", issue: "PDF_REQUIRED" });
    // BC-06: the answers of the round stay sealed for everybody else until its closing.
    const verifier: Who = {
      token: await h.tokenFor("bo-verifier"),
      context: membershipId("bo-verifier", "astax"),
    };
    for (const path of [`/offers/${answerId}`, `/auctions/${auctionId}/offers`]) {
      expect((await r.call(verifier, path)).status, path).toBe(403);
    }
    expect((await r.call(customer, `/offers/${answerId}`)).status).toBe(403);
  });

  it("only the requester asks for a reconfirmation", async () => {
    const other = {
      token: await h.tokenFor("agenzia-uno-owner"),
      context: membershipId("agenzia-uno-owner", "agenzia-uno"),
    };
    // ADR 0015: an agency may ask for its own requests, not for this one (not even its existence).
    expect(
      (await r.call(other, `/requests/${requestId}/reconfirmation`, { body: {} })).status,
    ).toBe(404);
  });
});
