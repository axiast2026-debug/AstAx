import { LocalFieldCipher } from "@astax/adapters/crypto";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openTestAuction } from "./auction-helpers.js";
import {
  acceptAllLegal,
  membershipId,
  orgId,
  startHarness,
  TEST_CIPHER_KEYS,
  type Harness,
  type UserKey,
} from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 4: the agency area (spec 04). The private customer is created by this
// file at the first call, so that no other file depends on it.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
const CUSTOMER_EMAIL = "privato.agenzia@example.test";
let requestId: string;
let auctionId: string;

const who = async (key: UserKey, org: string): Promise<Who> => ({
  token: await h.tokenFor(key),
  context: membershipId(key, org),
});
const audit = (action: string, targetId?: string) =>
  withContext(h.db, SYSTEM_CONTEXT, (tx) =>
    tx.auditLog.findMany({
      where: { action, ...(targetId ? { targetId } : {}) },
      orderBy: { seq: "asc" },
    }),
  );

/** VIS-01: none of the customer's contacts, anywhere in an answer to an agency. */
function noContacts(body: unknown) {
  const text = JSON.stringify(body);
  for (const contact of [CUSTOMER_EMAIL, "@example.test", "+39"]) {
    expect(text).not.toContain(contact);
  }
}

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  for (const key of [
    "bo-verifier",
    "agenzia-uno-owner",
    "agenzia-uno-supervisor",
    "agenzia-uno-operator",
    "agenzia-due-owner",
    "agenzia-tre-owner",
  ] as const) {
    await acceptAllLegal(h, key);
  }
  const customer = {
    token: await h.token({
      sub: "kc-private-agency-test",
      azp: "astax-web-private",
      roles: ["astax-private"],
      email: CUSTOMER_EMAIL,
      givenName: "Privato",
      familyName: "Agenzia",
    }),
  };
  const pending = (await (await h.call("/legal/pending", customer)).json()) as {
    versionId: string;
  }[];
  await h.call("/legal/acceptances", {
    ...customer,
    body: { versionIds: pending.map((p) => p.versionId) },
  });
  const request = await r.submittedPrivateRequest(customer, CUSTOMER_EMAIL);
  requestId = request.id;
  await r.json(await r.approve(await who("bo-verifier", "astax"), requestId), 200);
  auctionId = await openTestAuction(h, requestId, ["agenzia-uno", "agenzia-tre"]);
});

afterAll(async () => {
  await h.close();
});

describe("fase 4: the agency area (spec 04)", () => {
  it("«Richieste in arrivo»: the request in target with the columns of the spec, never a contact", async () => {
    const rows = await r.json<{ auctionId: string; state: string; packageName: string }[]>(
      await r.call(await who("agenzia-uno-owner", "agenzia-uno"), "/agency/requests"),
      200,
    );
    const row = rows.find((x) => x.auctionId === auctionId);
    expect(row).toMatchObject({
      state: "NEW",
      vehicleType: "CAR",
      cuClass: 1,
      minValidityDays: 15,
      auctionStatus: "OPEN",
      // ASTA-02, P5 radar: the working time from the server.
      live: {
        workingSecondsLeft: expect.any(Number),
        totalWorkingSeconds: expect.any(Number),
        serverNow: expect.any(String),
      },
      urgent: expect.any(Boolean),
    });
    noContacts(rows);
    // Agenzia Due is not invited.
    const due = await r.json<{ auctionId: string }[]>(
      await r.call(await who("agenzia-due-owner", "agenzia-due"), "/agency/requests"),
      200,
    );
    expect(due.map((x) => x.auctionId)).not.toContain(auctionId);
  });

  it("«Profilo» of the agency (Dan, 2026-10-21): its data, mandates and team; the IBAN masked", async () => {
    const profile = await r.json<{
      legalName: string;
      ruiNumber: string;
      iban: string | null;
      mandates: { company: string; verified: boolean }[];
      activeMembers: number;
    }>(await r.call(await who("agenzia-uno-owner", "agenzia-uno"), "/agency/profile"), 200);
    expect(profile).toMatchObject({ legalName: "Agenzia Uno", ruiNumber: "A000000001" });
    expect(profile.iban).toMatch(/^IT[0-9]{2} •••• [0-9]{4}$/);
    expect(profile.mandates.length).toBeGreaterThan(0);
    expect(profile.activeMembers).toBeGreaterThan(0);
  });

  it("«Metriche» (Dan, 2026-10-21): the period, the rates in basis points; the operator sees only its own", async () => {
    const owner = await r.json<{ scope: string; days: number; totals: Record<string, unknown> }>(
      await r.call(await who("agenzia-uno-owner", "agenzia-uno"), "/agency/metrics?days=90"),
      200,
    );
    expect(owner).toMatchObject({ scope: "AGENCY", days: 90 });
    expect(owner.totals).toHaveProperty("winRateBasisPoints");
    expect(owner.totals).toHaveProperty("wonPremiumCents");
    const operator = await r.json<{ scope: string; totals: { responseRateBasisPoints: unknown } }>(
      await r.call(await who("agenzia-uno-operator", "agenzia-uno"), "/agency/metrics"),
      200,
    );
    expect(operator).toMatchObject({ scope: "OWN", totals: { responseRateBasisPoints: null } });
    expect(
      (await r.call(await who("agenzia-uno-owner", "agenzia-uno"), "/agency/metrics?days=7"))
        .status,
    ).toBe(400);
  });

  it("«Partecipa all'asta» (Dan, 2026-10-21): open or closed, closing within, package, without documents", async () => {
    const uno = await who("agenzia-uno-owner", "agenzia-uno");
    const ids = async (query: string) =>
      (
        await r.json<{ auctionId: string }[]>(await r.call(uno, `/agency/requests?${query}`), 200)
      ).map((x) => x.auctionId);
    expect(await ids("auction=OPEN")).toContain(auctionId);
    expect(await ids("auction=CLOSED")).not.toContain(auctionId);
    expect(await ids("closesWithinHours=168")).toContain(auctionId);
    expect(await ids("withoutDocuments=1")).not.toContain(auctionId);
    expect((await r.call(uno, "/agency/requests?closesWithinHours=0")).status).toBe(400);
  });

  it("VIS-01 VIS-09 the detail has every datum useful to quote, no contact, and the opening is logged", async () => {
    const detail = await r.json<{
      quoteData: { vehicle: { plate: string } };
      documents: { id: string; kind: string }[];
      accessLogged: boolean;
      companies: { name: string }[];
      live: { workingSecondsLeft: number } | null;
    }>(
      await r.call(await who("agenzia-uno-owner", "agenzia-uno"), `/agency/requests/${auctionId}`),
      200,
    );
    expect(detail.quoteData.vehicle.plate).toBe("GN123AB");
    expect(detail.accessLogged).toBe(true);
    expect(detail.live?.workingSecondsLeft).toBeGreaterThan(0);
    expect(detail.companies.map((c) => c.name).sort()).toEqual([
      "Compagnia Alfa",
      "Compagnia Beta",
    ]);
    expect(detail.documents.map((d) => d.kind)).not.toContain("CONSENT_FORM");
    noContacts(detail);
    const logged = await audit("QUOTE_DATA_VIEWED", requestId);
    expect(logged.some((l) => l.actorOrganizationId === orgId("agenzia-uno"))).toBe(true);
    const invitation = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.invitation.findFirstOrThrow({
        where: { auctionId, organizationId: orgId("agenzia-uno") },
      }),
    );
    expect(invitation.status).toBe("VIEWED");
  });

  it("VIS-10 a document reaches the agency as a PDF with the watermark: agency, user, date and time", async () => {
    const uno = await who("agenzia-uno-owner", "agenzia-uno");
    const detail = await r.json<{ documents: { id: string; kind: string }[] }>(
      await r.call(uno, `/agency/requests/${auctionId}`),
      200,
    );
    const document = detail.documents[0];
    const response = await r.call(uno, `/agency/requests/${auctionId}/documents/${document?.id}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    // The original file name may hold the customer's name: never sent (VIS-01).
    expect(response.headers.get("content-disposition")).not.toContain("giulia");
    const pdf = await PDFDocument.load(new Uint8Array(await response.arrayBuffer()));
    const keywords = pdf.getKeywords() ?? "";
    expect(keywords).toContain("Agenzia Uno");
    expect(keywords).toContain("Anna Moretti");
    expect(keywords).toMatch(/\d{2}\/\d{2}\/\d{2}, \d{2}:\d{2}/);
    expect(await audit("DOCUMENT_VIEWED", document?.id)).toHaveLength(1);
  });

  it("an agency not invited gets 404 for the request and its documents, logged", async () => {
    const due = await who("agenzia-due-owner", "agenzia-due");
    expect((await r.call(due, `/agency/requests/${auctionId}`)).status).toBe(404);
    const denied = await audit("ACCESS_DENIED", auctionId);
    expect(denied.some((d) => d.actorOrganizationId === orgId("agenzia-due"))).toBe(true);
  });

  it("OFF-03 two users of the same agency claim at the same instant: only one succeeds", async () => {
    const [a, b] = await Promise.all([
      r.call(await who("agenzia-uno-owner", "agenzia-uno"), `/auctions/${auctionId}/claim`, {
        body: {},
      }),
      r.call(await who("agenzia-uno-operator", "agenzia-uno"), `/auctions/${auctionId}/claim`, {
        body: {},
      }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const claims = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.claim.count({
        where: { auctionId, organizationId: orgId("agenzia-uno"), releasedAt: null },
      }),
    );
    expect(claims).toBe(1);
  });

  it("OFF-03 the supervisor gives the claim to the operator, who then offers", async () => {
    const supervisor = await who("agenzia-uno-supervisor", "agenzia-uno");
    await r.json(
      await r.call(supervisor, `/agency/requests/${auctionId}/assign`, {
        body: { membershipId: membershipId("agenzia-uno-operator", "agenzia-uno") },
      }),
      200,
    );
    const rows = await r.json<{ auctionId: string; state: string }[]>(
      await r.call(await who("agenzia-uno-operator", "agenzia-uno"), "/agency/requests"),
      200,
    );
    expect(rows.find((x) => x.auctionId === auctionId)?.state).toBe("CLAIMED_BY_ME");
    expect(await audit("AUCTION_CLAIM_ASSIGNED", auctionId)).toHaveLength(1);
  });

  let offerId: string;

  it("OFF-04 the operator sends the offer the supervisor gave them", async () => {
    const operator = await who("agenzia-uno-operator", "agenzia-uno");
    const detail = await r.json<{
      companies: { id: string }[];
      products: { id: string; companyId: string }[];
      package: { requirements: Record<string, { required?: boolean }> } | null;
    }>(await r.call(operator, `/agency/requests/${auctionId}`), 200);
    const company = detail.companies[0]?.id ?? "";
    const offer = {
      annualGrossPremiumCents: 50500,
      companyId: company,
      productId: detail.products.find((p) => p.companyId === company)?.id,
      coverage: {
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
      },
      guaranteeUntil: "2026-12-20",
      notes: null,
      binding: true,
    };
    const response = await fetch(`${h.baseUrl}/auctions/${auctionId}/offers`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${operator.token}`,
        "x-astax-context": operator.context ?? "",
        "x-offer": Buffer.from(JSON.stringify(offer)).toString("base64url"),
        "content-type": "application/pdf",
      },
      body: new TextEncoder().encode("%PDF-1.7 preventivo"),
    });
    expect(response.status).toBe(201);
    const sent = (await response.json()) as { id: string; coverageWarnings: string[] };
    offerId = sent.id;
    // OFF-06: a declaration below the package is accepted with a warning, and excluded at the closing.
    const roadside = detail.package?.requirements.roadsideAssistance?.required === true;
    if (roadside) expect(sent.coverageWarnings).toContain("roadsideAssistance");
    else expect(sent.coverageWarnings).toEqual([]);
  });

  it("BC-04 the agency's copy: author, owner, supervisor and operators with canSeeColleagueOffers; the others 403; every reading logged", async () => {
    const read = async (key: UserKey) =>
      (await r.call(await who(key, "agenzia-uno"), `/offers/${offerId}`)).status;
    const before = (await audit("OFFER_OWNER_COPY_READ", offerId)).length;
    expect(await read("agenzia-uno-operator")).toBe(200);
    expect(await read("agenzia-uno-owner")).toBe(200);
    expect(await read("agenzia-uno-supervisor")).toBe(200);
    // Marco, operator of Agenzia Uno too: not without the permission of the owner.
    await acceptAllLegal(h, "marco-rossi");
    expect(await read("marco-rossi")).toBe(403);
    await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.membership.update({
        where: { id: membershipId("marco-rossi", "agenzia-uno") },
        data: { canSeeColleagueOffers: true },
      }),
    );
    // The permission reaches a new token: the flags are read at each call.
    expect(await read("marco-rossi")).toBe(200);
    await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.membership.update({
        where: { id: membershipId("marco-rossi", "agenzia-uno") },
        data: { canSeeColleagueOffers: false },
      }),
    );
    expect((await audit("OFFER_OWNER_COPY_READ", offerId)).length - before).toBe(4);
    // Phase 8: «Le mie offerte» opens all the own sealed copies at once and logs
    // them in one entry on the organization, with the list of the offers.
    const listedBefore = (await audit("OFFER_OWNER_COPY_READ", orgId("agenzia-uno"))).length;
    const mine = await r.json<{ id: string; annualGrossPremiumCents: number | null }[]>(
      await r.call(await who("agenzia-uno-owner", "agenzia-uno"), "/agency/offers"),
      200,
    );
    expect(mine.find((o) => o.id === offerId)?.annualGrossPremiumCents).not.toBeNull();
    const listed = await audit("OFFER_OWNER_COPY_READ", orgId("agenzia-uno"));
    expect(listed).toHaveLength(listedBefore + 1);
    expect((listed.at(-1)?.after as { offerIds: string[] }).offerIds).toContain(offerId);
  });

  it("OFF-02 OFF-03 a claim is not given to a colleague who already works on the request for another agency", async () => {
    const marcoTre = await who("marco-rossi", "agenzia-tre");
    await r.json(await r.call(marcoTre, `/auctions/${auctionId}/claim`, { body: {} }), 200);
    const supervisor = await who("agenzia-uno-supervisor", "agenzia-uno");
    const refused = await r.json<{ errors: { issue: string }[] }>(
      await r.call(supervisor, `/agency/requests/${auctionId}/assign`, {
        body: { membershipId: membershipId("marco-rossi", "agenzia-uno") },
      }),
      409,
    );
    expect(refused.errors.map((e) => e.issue)).toEqual(["ONE_PERSON_ONE_AGENCY"]);
    // Nothing changed for Agenzia Uno: the operator keeps the claim.
    const claims = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.claim.findMany({
        where: { auctionId, organizationId: orgId("agenzia-uno"), releasedAt: null },
      }),
    );
    expect(claims.map((c) => c.membershipId)).toEqual([
      membershipId("agenzia-uno-operator", "agenzia-uno"),
    ]);
    await r.json(await r.call(marcoTre, `/auctions/${auctionId}/release`, { body: {} }), 200);
  });

  it("VIS-01 every answer of the agency area holds no phone or email of the customer", async () => {
    // The customer has a phone too, for this check.
    await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.user.updateMany({
        where: {
          emailHash: new LocalFieldCipher(
            TEST_CIPHER_KEYS.encryption,
            TEST_CIPHER_KEYS.blindIndex,
          ).blindIndex("email", CUSTOMER_EMAIL),
        },
        data: {
          phoneEnc: new LocalFieldCipher(
            TEST_CIPHER_KEYS.encryption,
            TEST_CIPHER_KEYS.blindIndex,
          ).encrypt("+39 333 1234567"),
        },
      }),
    );
    const detail = await r.json<{ documents: { id: string }[] }>(
      await r.call(await who("agenzia-uno-owner", "agenzia-uno"), `/agency/requests/${auctionId}`),
      200,
    );
    const paths = [
      "/agency/dashboard",
      "/agency/requests",
      `/agency/requests/${auctionId}`,
      "/agency/offers",
      "/agency/filters",
      "/agency/products",
      "/agency/access-log",
      `/offers/${offerId}`,
      `/auctions/${auctionId}/offers`,
      "/me/notifications",
      ...detail.documents.map((d) => `/agency/requests/${auctionId}/documents/${d.id}`),
    ];
    for (const key of [
      "agenzia-uno-owner",
      "agenzia-uno-supervisor",
      "agenzia-uno-operator",
    ] as const) {
      const agent = await who(key, "agenzia-uno");
      for (const path of paths) {
        const response = await r.call(agent, path);
        // A refusal proves nothing: every answer here is a real one, but the access log
        // is the owner's only (VIS-08).
        const expected = path === "/agency/access-log" && key !== "agenzia-uno-owner" ? 403 : 200;
        expect(response.status, `${key} ${path}`).toBe(expected);
        const text = new TextDecoder("latin1").decode(await response.arrayBuffer());
        for (const contact of [CUSTOMER_EMAIL, "333 1234567", "3331234567", "+39"]) {
          expect(text, `${key} ${path}`).not.toContain(contact);
        }
      }
    }
  });
});
