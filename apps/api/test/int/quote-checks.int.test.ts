import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openTestAuction } from "./auction-helpers.js";
import { acceptAllLegal, membershipId, orgId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 4: OFF-09, decision 16. The worker writes the checks after the closing
// (apps/worker/test/int); here the back office decides on them.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let verifier: Who;
let uno: Who;
let requestId: string;
let offerId: string;
let checkId: string;

const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);

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

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  for (const key of ["bo-verifier", "agenzia-uno-owner"] as const) await acceptAllLegal(h, key);
  verifier = {
    token: await h.tokenFor("bo-verifier"),
    context: membershipId("bo-verifier", "astax"),
  };
  uno = {
    token: await h.tokenFor("agenzia-uno-owner"),
    context: membershipId("agenzia-uno-owner", "agenzia-uno"),
  };
  const email = "privato.controllo@example.test";
  const customer = {
    token: await h.token({
      sub: "kc-private-quote-check-test",
      azp: "astax-web-private",
      roles: ["astax-private"],
      email,
      givenName: "Privato",
      familyName: "Controllo",
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
  await r.json(await r.approve(verifier, requestId), 200);
  const auctionId = await openTestAuction(h, requestId, ["agenzia-uno"]);
  const detail = await r.json<{
    companies: { id: string }[];
    products: { id: string; companyId: string }[];
  }>(await r.call(uno, `/agency/requests/${auctionId}`), 200);
  await r.json(await r.call(uno, `/auctions/${auctionId}/claim`, { body: {} }), 200);
  const company = detail.companies[0]?.id ?? "";
  const offer = {
    annualGrossPremiumCents: 48000,
    companyId: company,
    productId: detail.products.find((p) => p.companyId === company)?.id,
    coverage: COVERAGE,
    guaranteeUntil: "2026-12-20",
    notes: null,
    binding: true,
  };
  const sent = await fetch(`${h.baseUrl}/auctions/${auctionId}/offers`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${uno.token}`,
      "x-astax-context": uno.context ?? "",
      "x-offer": Buffer.from(JSON.stringify(offer)).toString("base64url"),
      "content-type": "application/pdf",
    },
    body: new TextEncoder().encode("%PDF-1.7\nPremio: 470,00\n"),
  });
  offerId = ((await sent.json()) as { id: string }).id;
  // What the closing and the worker's check leave behind (they are tested in the worker).
  await system(async (tx) => {
    await tx.auction.update({ where: { id: auctionId }, data: { status: "CLOSED" } });
    await tx.quoteRequest.update({
      where: { id: requestId },
      data: { status: "OFFERS_AVAILABLE" },
    });
    await tx.offer.update({
      where: { id: offerId },
      data: {
        status: "AWAITING_CUSTOMER",
        annualGrossPremiumCents: 48000,
        companyId: company,
        guaranteeUntil: new Date("2026-12-20"),
      },
    });
    const check = await tx.offerQuoteCheck.create({
      data: {
        offerId,
        quoteRequestId: requestId,
        checkedAt: h.clock.now(),
        result: "MISMATCH",
        differences: [{ field: "annualGrossPremiumCents", declared: 48000, read: 47000 }],
        readerModel: "fake-document-reader",
        promptVersion: "fake-1",
      },
    });
    checkId = check.id;
  });
});

afterAll(async () => {
  await h.close();
});

const decide = (who: Who, body: unknown) =>
  r.call(who, `/back-office/quote-checks/${checkId}/decision`, { body });

describe("fase 4: OFF-09 decisions of the back office", () => {
  it("OFF-09 the back office sees the flag with the differences; an agency may not (403)", async () => {
    const list = await r.json<{ id: string; excludable: boolean; agency: string }[]>(
      await r.call(verifier, "/back-office/quote-checks"),
      200,
    );
    expect(list.find((c) => c.id === checkId)).toMatchObject({
      excludable: true,
      agency: "Agenzia Uno",
    });
    expect((await r.call(uno, "/back-office/quote-checks")).status).toBe(403);
    expect((await decide(uno, { decision: "EXCLUDED", reason: "Prova" })).status).toBe(403);
  });

  it("OFF-09 the exclusion needs a reason, is logged and tells the agency", async () => {
    expect((await decide(verifier, { decision: "EXCLUDED", reason: "" })).status).toBe(400);
    await r.json(
      await decide(verifier, {
        decision: "EXCLUDED",
        reason: "Il premio del PDF è diverso da quello dichiarato",
      }),
      200,
    );
    const [offer, audit, told] = await system((tx) =>
      Promise.all([
        tx.offer.findUniqueOrThrow({ where: { id: offerId } }),
        tx.auditLog.findFirst({
          where: { action: "OFFER_EXCLUDED_AFTER_REVIEW", targetId: offerId },
        }),
        tx.membership
          .findMany({ where: { organizationId: orgId("agenzia-uno") } })
          .then((members) =>
            tx.notification.count({
              where: {
                eventKey: "offer.excluded_after_review",
                userId: { in: members.map((m) => m.userId) },
              },
            }),
          ),
      ]),
    );
    expect(offer.status).toBe("EXCLUDED");
    expect(offer.exclusionReason).toBe("Il premio del PDF è diverso da quello dichiarato");
    expect(audit?.reason).toBe("Il premio del PDF è diverso da quello dichiarato");
    expect(told).toBeGreaterThan(0);
    // Question 16, answer B: it was the last valid offer, the request is «Deserta» at once.
    const [request, requesterTold, backOfficeTold] = await system((tx) =>
      Promise.all([
        tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
        tx.notification.count({
          where: {
            eventKey: "offer.excluded_last.requester",
            payload: { path: ["quoteRequestId"], equals: requestId },
          },
        }),
        tx.notification.count({
          where: {
            eventKey: "offer.excluded_last.bo",
            payload: { path: ["quoteRequestId"], equals: requestId },
          },
        }),
      ]),
    );
    expect(request.status).toBe("DESERTED");
    expect(requesterTold).toBe(1);
    expect(backOfficeTold).toBeGreaterThan(0);
    // Decided once.
    const again = await r.json<{ errors: { issue: string }[] }>(
      await decide(verifier, { decision: "KEPT", reason: "Ripensamento" }),
      409,
    );
    expect(again.errors.map((e) => e.issue)).toEqual(["ALREADY_DECIDED"]);
  });

  it("OFF-09 after the customer's acceptance the exclusion is refused", async () => {
    await system(async (tx) => {
      await tx.offerQuoteCheck.update({
        where: { id: checkId },
        data: { decision: null, decidedAt: null, decidedByUserId: null },
      });
      await tx.offer.update({ where: { id: offerId }, data: { status: "WINNING" } });
    });
    const refused = await r.json<{ errors: { issue: string }[] }>(
      await decide(verifier, { decision: "EXCLUDED", reason: "Troppo tardi" }),
      409,
    );
    expect(refused.errors.map((e) => e.issue)).toEqual(["ALREADY_ACCEPTED"]);
  });
});
