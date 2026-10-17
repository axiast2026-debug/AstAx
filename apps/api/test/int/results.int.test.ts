import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closedRound, openTestAuction } from "./auction-helpers.js";
import {
  acceptAllLegal,
  membershipId,
  orgId,
  startHarness,
  userId,
  type Harness,
} from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 6, step 9: «Risultati» (spec 04). The ranking published when the
// request is cancelled without acceptance (CLA-02), what each agency sees
// (CLA-03), the ranking hidden again during a reconfirmation (question 17),
// the operator's own results only.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);
const who = async (key: Parameters<Harness["tokenFor"]>[0], org: string): Promise<Who> => ({
  token: await h.tokenFor(key),
  context: membershipId(key, org),
});

interface Results {
  scope: "OWN" | "AGENCY";
  published: { code: string; view: { kind: string; [k: string]: unknown } }[];
  totals: {
    invited: number;
    offers: number;
    wins: number;
    averageGapBasisPoints: number | null;
  };
  byProvince: { key: string; offers: number }[];
}
const resultsOf = async (key: Parameters<Harness["tokenFor"]>[0], org: string) =>
  r.json<Results>(await r.call(await who(key, org), "/agency/results"), 200);

let customer: Who;
const mine: string[] = [];

async function privateCustomer(sub: string, email: string): Promise<Who> {
  const c = {
    token: await h.token({
      sub,
      azp: "astax-web-private",
      roles: ["astax-private"],
      email,
      givenName: "Sara",
      familyName: "Risultati",
    }),
  };
  const pending = (await (await h.call("/legal/pending", c)).json()) as { versionId: string }[];
  await h.call("/legal/acceptances", {
    ...c,
    body: { versionIds: pending.map((p) => p.versionId) },
  });
  return c;
}

async function requestWithRound(email: string) {
  const request = await r.submittedPrivateRequest(customer, email);
  await r.json(
    await r.call(
      await who("bo-verifier", "astax"),
      `/verification/requests/${request.id}/approve`,
      {
        body: {},
      },
    ),
    200,
  );
  const round = await closedRound(h, request.id, [
    {
      agency: "agenzia-uno",
      company: "Compagnia Alfa",
      cents: 48_000,
      until: "2026-12-05",
      at: "2026-11-16T09:20:00Z",
    },
    {
      agency: "agenzia-due",
      company: "Compagnia Alfa",
      cents: 51_000,
      until: "2026-12-05",
      at: "2026-11-16T09:30:00Z",
    },
  ]);
  const { code } = await system((tx) =>
    tx.quoteRequest.findUniqueOrThrow({ where: { id: request.id } }),
  );
  mine.push(code);
  return { id: request.id, code, auctionId: round.auctionId };
}

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  for (const key of [
    "bo-verifier",
    "agenzia-uno-owner",
    "agenzia-uno-operator",
    "agenzia-due-owner",
    "agenzia-tre-owner",
  ] as const) {
    await acceptAllLegal(h, key);
  }
  customer = await privateCustomer("kc-private-results-test", "privato.risultati@example.test");
});

afterAll(async () => {
  await h.close();
});

describe("CLA-02 CLA-03 the published rankings", () => {
  it("CLA-04 before the publication the request is not in «Risultati»; CLA-02 cancelled without acceptance it is", async () => {
    const a = await requestWithRound("privato.risultati@example.test");
    const before = await resultsOf("agenzia-uno-owner", "agenzia-uno");
    expect(before.published.find((p) => p.code === a.code)).toBeUndefined();

    // An offer of Agenzia Tre excluded at the closing (not in the ranking).
    await system(async (tx) => {
      const owner = await tx.membership.findFirstOrThrow({
        where: { organizationId: orgId("agenzia-tre"), role: "OWNER" },
      });
      await tx.offer.create({
        data: {
          auctionId: a.auctionId,
          organizationId: orgId("agenzia-tre"),
          membershipId: owner.id,
          userId: owner.userId,
          submittedAt: h.clock.now(),
          lastChangedAt: h.clock.now(),
          sealedPayload: "sealed",
          ownerCopy: "copy",
          status: "EXCLUDED",
          exclusionReason: "Massimale sotto il pacchetto",
        },
      });
    });
    await r.json(await r.call(customer, `/requests/${a.id}/cancel`, { body: {} }), 200);
    const ranking = await system((tx) =>
      tx.ranking.findUniqueOrThrow({ where: { auctionId: a.auctionId } }),
    );
    expect(ranking.publishedAt).not.toBeNull();
    const uno = await resultsOf("agenzia-uno-owner", "agenzia-uno");
    expect(uno.published.find((p) => p.code === a.code)?.view).toMatchObject({
      kind: "RANKED",
      position: 1,
      total: 2,
      firstCents: 48_000,
      secondCents: 51_000,
    });
    const due = await resultsOf("agenzia-due-owner", "agenzia-due");
    expect(due.published.find((p) => p.code === a.code)?.view).toMatchObject({
      kind: "RANKED",
      position: 2,
      // (510 − 480) / 480 = 6,25 %.
      gapBasisPoints: 625,
    });
    const note = await system((tx) =>
      tx.notification.findFirst({
        where: {
          eventKey: "ranking.available",
          payload: { path: ["auctionId"], equals: a.auctionId },
          userId: userId("agenzia-due-owner"),
        },
      }),
    );
    expect(note?.body).toContain("2ª su 2");
    // CLA-03: the excluded offer sees «esclusa» with the reason, and nothing else.
    const tre = await resultsOf("agenzia-tre-owner", "agenzia-tre");
    expect(tre.published.find((p) => p.code === a.code)?.view).toEqual({
      kind: "EXCLUDED",
      reason: "Massimale sotto il pacchetto",
    });
    expect(due.totals).toHaveProperty("averageGapBasisPoints");
    // The statistics count the agency's closed offers.
    expect(uno.totals.offers).toBeGreaterThanOrEqual(1);
    expect(uno.byProvince.length).toBeGreaterThanOrEqual(1);
  });

  it("question 17 a published ranking is hidden while the request is in a reconfirmation", async () => {
    const b = await requestWithRound("privato.risultati@example.test");
    // As at a signature: published; then the guarantees lapse and a reconfirmation opens.
    await system((tx) =>
      tx.ranking.update({
        where: { auctionId: b.auctionId },
        data: { publishedAt: h.clock.now() },
      }),
    );
    expect(
      (await resultsOf("agenzia-uno-owner", "agenzia-uno")).published.some(
        (p) => p.code === b.code,
      ),
    ).toBe(true);
    const second = await openTestAuction(h, b.id, ["agenzia-uno", "agenzia-due"], {
      kind: "RECONFIRMATION",
      round: 2,
    });
    expect(
      (await resultsOf("agenzia-uno-owner", "agenzia-uno")).published.some(
        (p) => p.code === b.code,
      ),
    ).toBe(false);
    await system((tx) =>
      tx.auction.update({
        where: { id: second },
        data: { status: "CLOSED", closedAt: h.clock.now() },
      }),
    );
    expect(
      (await resultsOf("agenzia-uno-owner", "agenzia-uno")).published.some(
        (p) => p.code === b.code,
      ),
    ).toBe(true);
  });

  it("spec 05 an operator sees only its own offers", async () => {
    const operator = await resultsOf("agenzia-uno-operator", "agenzia-uno");
    expect(operator.scope).toBe("OWN");
    // The offers above were made by the owner.
    expect(operator.published.filter((p) => mine.includes(p.code))).toEqual([]);
    expect(operator.totals.invited).toBe(0);
  });
});
