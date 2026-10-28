import { requesterExclusions, SYSTEM_CONTEXT, withContext } from "@astax/db";
import { buildFiscalCode } from "@astax/shared/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openTestAuction } from "./auction-helpers.js";
import {
  acceptAllLegal,
  membershipId,
  orgId,
  startHarness,
  type Harness,
  type UserKey,
} from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// ADR 0015 (Dan, 2026-10-21, docs/piano-agenzie.md E): an agency requests
// quotes for its own customers like a broker; the other agencies offer only
// with the companies it does not have (answer 3B).
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let requestId: string;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);
const who = async (key: UserKey, org: string): Promise<Who> => ({
  token: await h.tokenFor(key),
  context: membershipId(key, org),
});
const put = (w: Who, id: string, section: string, value: unknown) =>
  r.call(w, `/requests/${id}/draft/${section}`, { method: "PUT", body: { value } });

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  for (const key of [
    "agenzia-uno-owner",
    "agenzia-uno-supervisor",
    "agenzia-uno-operator",
    "agenzia-tre-owner",
    "bo-verifier",
  ] as const) {
    await acceptAllLegal(h, key);
  }
});

afterAll(async () => {
  await h.close();
});

describe("ADR 0015: the agency that requests quotes for its customers", () => {
  it("Agenzia Uno creates the customer and sends the request; its declaration covers the consent", async () => {
    const owner = await who("agenzia-uno-owner", "agenzia-uno");
    const fiscalCode = buildFiscalCode({
      surname: "Cliente",
      givenName: "Ugo",
      birthDate: "1979-06-21",
      sex: "M",
      birthPlaceCadastralCode: "H501",
    });
    const customer = await r.json<{ id: string }>(
      await r.call(owner, "/customers", {
        body: {
          kind: "PERSON",
          surname: "Cliente",
          givenName: "Ugo",
          fiscalCode,
          email: "ugo.cliente@example.test",
        },
      }),
      201,
    );
    requestId = (
      await r.json<{ id: string }>(
        await r.call(owner, "/requests", { body: { customerId: customer.id } }),
        201,
      )
    ).id;
    await r.json(
      await put(owner, requestId, "intake", {
        vehicleStatus: "INSURED",
        plate: "AG123UG",
        ownerBirthDate: "1979-06-21",
        residence: {
          street: "Via delle Agenzie 1",
          postalCode: "00184",
          municipalityIstat: "058091",
          province: "RM",
        },
        drivingFormula: "FREE",
      }),
      200,
    );
    await r.json(
      await put(owner, requestId, "request", {
        packageCode: "RECOMMENDED",
        packageVersion: 1,
        startDate: "2026-12-20",
        startMode: "DATE",
        blackBox: false,
        paymentFrequency: "ANNUAL",
        auctionDurationHours: 2,
        minValidityDays: 15,
      }),
      200,
    );
    await r.json(
      await r.upload(owner, requestId, "REGISTRATION_CERTIFICATE", "libretto-anna-riva.jpg"),
      201,
    );
    await r.json(
      await r.upload(owner, requestId, "IDENTITY_DOCUMENT", "identita-anna-riva.jpg"),
      201,
    );
    const sent = await r.json<{ status: string }>(
      await r.call(owner, `/requests/${requestId}/submit`, { body: {} }),
      200,
    );
    expect(sent.status).toBe("IN_VERIFICATION");
    const [request, consent] = await system((tx) =>
      Promise.all([
        tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
        tx.consent.findFirstOrThrow({ where: { customerId: customer.id } }),
      ]),
    );
    expect(request).toMatchObject({ channel: "BROKER", ownerOrganizationId: orgId("agenzia-uno") });
    expect(consent.method).toBe("BROKER_DECLARATION");
  });

  it("VIS-13: the supervisor sees the agency's customers, an operator only its own", async () => {
    const list = async (key: UserKey) =>
      (
        await r.json<{ id: string }[]>(
          await r.call(await who(key, "agenzia-uno"), "/requests/search", { body: {} }),
          200,
        )
      ).map((x) => x.id);
    expect(await list("agenzia-uno-supervisor")).toContain(requestId);
    expect(await list("agenzia-uno-operator")).not.toContain(requestId);
  });

  it("the owner sees the statement of the fees of its requests; an operator does not", async () => {
    const statement = await r.json<{ policies: unknown[] }>(
      await r.call(await who("agenzia-uno-owner", "agenzia-uno"), "/broker/statement"),
      200,
    );
    expect(Array.isArray(statement.policies)).toBe(true);
    expect(
      (await r.call(await who("agenzia-uno-operator", "agenzia-uno"), "/broker/statement")).status,
    ).toBe(403);
  });

  it("answer 3B: Uno is never invited, Tre offers only with a company Uno does not have", async () => {
    const uno = orgId("agenzia-uno");
    const tre = orgId("agenzia-tre");
    const [out, treMandates] = await system(async (tx) =>
      Promise.all([
        requesterExclusions(tx, uno),
        tx.agencyMandate.findMany({ where: { organizationId: tre, verifiedAt: { not: null } } }),
      ]),
    );
    expect(out.agencies).toContain(uno);
    const shared = treMandates.map((m) => m.companyId).filter((c) => out.companies.includes(c));
    expect(shared.length).toBeGreaterThan(0);

    const auctionId = await openTestAuction(h, requestId, ["agenzia-tre"]);
    // The work table (broker design): counters and working time, never a price or a name.
    const listed = await r.json<
      { id: string; operator: string | null; auction: Record<string, unknown> | null }[]
    >(await r.call(await who("agenzia-uno-owner", "agenzia-uno"), "/requests"), 200);
    const row = listed.find((x) => x.id === requestId);
    expect(row?.operator?.length).toBeGreaterThan(0);
    expect(row?.auction).toMatchObject({
      status: "OPEN",
      offers: 0,
      invited: 1,
      bestPremiumCents: null,
      live: { workingSecondsLeft: expect.any(Number) },
    });
    const treOwner = await who("agenzia-tre-owner", "agenzia-tre");
    // The request has no completed data here: the offer is checked on its own.
    const product = await system((tx) =>
      tx.insuranceProduct.findFirstOrThrow({
        where: { organizationId: tre, companyId: shared[0] ?? "", active: true },
      }),
    );
    const response = await fetch(`${h.baseUrl}/auctions/${auctionId}/offers`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${treOwner.token}`,
        "x-astax-context": treOwner.context ?? "",
        "x-offer": Buffer.from(
          JSON.stringify({
            annualGrossPremiumCents: 50500,
            companyId: shared[0],
            productId: product.id,
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
          }),
        ).toString("base64url"),
        "content-type": "application/pdf",
      },
      body: new TextEncoder().encode("%PDF-1.7 preventivo"),
    });
    const refused = await r.json<{ errors: { issue: string }[] }>(response, 400);
    expect(refused.errors.map((e) => e.issue)).toContain("COMPANY_OF_THE_REQUESTER");

    // The back office cannot invite the requesting agency by hand either.
    const invited = await r.call(
      await who("bo-verifier", "astax"),
      `/auctions/${auctionId}/invite`,
      { body: { organizationIds: [uno], reason: "Prova" } },
    );
    expect(invited.status).toBe(409);
  });
});
