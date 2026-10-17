import { SYSTEM_CONTEXT, addRequestEvent, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openTestAuction } from "./auction-helpers.js";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
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
    await r.call(
      {
        token: await h.tokenFor("bo-verifier"),
        context: membershipId("bo-verifier", "astax"),
      },
      `/verification/requests/${requestId}/approve`,
      { body: {} },
    ),
    200,
  );
});

afterAll(async () => {
  await h.close();
});

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

  it("GAR-07 proposal C in a reconfirmation the agency may answer without a new PDF", async () => {
    const auctionId = await openTestAuction(h, requestId, ["agenzia-uno"], {
      kind: "RECONFIRMATION",
      round: 2,
    });
    const uno: Who = {
      token: await h.tokenFor("agenzia-uno-owner"),
      context: membershipId("agenzia-uno-owner", "agenzia-uno"),
    };
    const detail = await r.json<{
      kind: string;
      companies: { id: string; name: string }[];
      products: { id: string; companyId: string }[];
      minGuaranteeDate: string;
    }>(await r.call(uno, `/agency/requests/${auctionId}`), 200);
    expect(detail.kind).toBe("RECONFIRMATION");
    await r.json(await r.call(uno, `/auctions/${auctionId}/claim`, { body: {} }), 200);
    const company = detail.companies[0]?.id ?? "";
    const offer = {
      annualGrossPremiumCents: 48000,
      companyId: company,
      productId: detail.products.find((p) => p.companyId === company)?.id,
      coverage: {
        rca: { limitType: "SINGLE_LIMIT", singleLimitEur: 10_000_000 },
        recourseWaiver: { included: false },
        roadsideAssistance: { included: false },
        legalProtection: { included: false },
        driverAccident: { included: false },
        theftFire: { included: false },
        naturalEventsVandalism: { included: false },
        glass: { included: false },
      },
      guaranteeUntil: "2026-12-20",
      notes: null,
      binding: true,
    };
    const response = await fetch(`${h.baseUrl}/auctions/${auctionId}/offers`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${uno.token}`,
        "x-astax-context": uno.context ?? "",
        "x-offer": Buffer.from(JSON.stringify(offer)).toString("base64url"),
      },
    });
    expect(response.status).toBe(201);
  });

  it("only the requester asks for a reconfirmation", async () => {
    const other = {
      token: await h.tokenFor("agenzia-uno-owner"),
      context: membershipId("agenzia-uno-owner", "agenzia-uno"),
    };
    expect(
      (await r.call(other, `/requests/${requestId}/reconfirmation`, { body: {} })).status,
    ).toBe(403);
  });
});
