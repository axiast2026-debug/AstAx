import { randomUUID } from "node:crypto";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { sampleQuoteData, type QuoteData } from "@astax/shared/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// ADR 0013, Dan 2026-10-21: the private customer gives the essential data and
// the photos; the back office completes the data from what the bot read, then
// approves. The private account is used by no other test file.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let customer: Who;
let verifier: Who;
let broker: Who;
const EMAIL = "privato.essenziale@example.test";
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);

const residence = {
  street: "Via delle Prove 1",
  postalCode: "20121",
  municipalityIstat: "015146",
  province: "MI",
};
const intake = {
  vehicleStatus: "INSURED",
  plate: "GN123AB",
  ownerBirthDate: "1990-05-12",
  residence,
  drivingFormula: "FREE",
};
const terms = {
  packageCode: "RECOMMENDED",
  packageVersion: 1,
  startDate: "2026-12-15",
  startMode: "DATE",
  blackBox: false,
  paymentFrequency: "ANNUAL",
  auctionDurationHours: 2,
  minValidityDays: 15,
};

let requestId: string;

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  for (const key of ["bo-verifier", "broker-operator"] as const) await acceptAllLegal(h, key);
  customer = {
    token: await h.token({
      sub: "kc-private-intake-test",
      azp: "astax-web-private",
      roles: ["astax-private"],
      email: EMAIL,
      givenName: "Giulia",
      familyName: "Essenziale",
    }),
  };
  const pending = (await (await h.call("/legal/pending", customer)).json()) as {
    versionId: string;
  }[];
  await h.call("/legal/acceptances", {
    ...customer,
    body: { versionIds: pending.map((p) => p.versionId) },
  });
  verifier = {
    token: await h.tokenFor("bo-verifier"),
    context: membershipId("bo-verifier", "astax"),
  };
  broker = {
    token: await h.tokenFor("broker-operator"),
    context: membershipId("broker-operator", "broker-demo"),
  };
});

afterAll(async () => {
  await h.close();
});

const put = (who: Who, id: string, section: string, value: unknown) =>
  r.call(who, `/requests/${id}/draft/${section}`, { method: "PUT", body: { value } });

describe("ADR 0013: the request in two stages", () => {
  it("the customer saves the essential data; a broker may not use it", async () => {
    requestId = (
      await r.json<{ id: string }>(await r.call(customer, "/requests", { body: {} }), 201)
    ).id;
    await r.json(await put(customer, requestId, "intake", intake), 200);
    await r.json(await put(customer, requestId, "request", terms), 200);
    // A new vehicle without where the class comes from is refused.
    expect(
      (await put(customer, requestId, "intake", { ...intake, vehicleStatus: "NEW" })).status,
    ).toBe(400);
    // The essential data is for the private customer only.
    expect((await put(broker, randomUUID(), "intake", intake)).status).toBe(403);
  });

  it("each photo says at once whether it can be read", async () => {
    const blurred = await r.json<{ readable: boolean }>(
      await r.upload(customer, requestId, "DRIVING_LICENCE", "patente-low-confidence.jpg", 0),
      201,
    );
    expect(blurred.readable).toBe(false);
    // Submitting with an unreadable photo is refused, with the document named.
    await r.json(
      await r.upload(customer, requestId, "REGISTRATION_CERTIFICATE", "libretto-giulia-neri.jpg"),
      201,
    );
    await r.json(await r.call(customer, `/requests/${requestId}/consent/code`, { body: {} }), 204);
    await r.json(
      await r.call(customer, `/requests/${requestId}/consent/confirm`, {
        body: { code: r.lastCode(EMAIL) },
      }),
      200,
    );
    const refused = await r.json<{ errors: { path: string; issue: string }[] }>(
      await r.call(customer, `/requests/${requestId}/submit`, { body: {} }),
      400,
    );
    expect(refused.errors).toEqual([
      { path: "documents.DRIVING_LICENCE", issue: "DOCUMENT_UNREADABLE" },
    ]);
    const sharp = await r.json<{ readable: boolean }>(
      await r.upload(customer, requestId, "DRIVING_LICENCE", "patente-giulia-neri.jpg", 0),
      201,
    );
    expect(sharp.readable).toBe(true);
  });

  it("the submission goes «In verifica» without quoteData, to complete", async () => {
    const submitted = await r.json<{ status: string; autoOutcome: string }>(
      await r.call(customer, `/requests/${requestId}/submit`, { body: {} }),
      200,
    );
    expect(submitted).toMatchObject({ status: "IN_VERIFICATION", autoOutcome: "YELLOW" });
    const request = await system((tx) =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
    );
    expect(request).toMatchObject({
      quoteDataVersion: null,
      plate: "GN123AB",
      packageCode: "RECOMMENDED",
    });
    expect(request.draftEnc).not.toBeNull();
  });

  it("the back office sees what the bot read, and cannot approve before completing", async () => {
    const card = await r.json<{
      quoteData: QuoteData | null;
      completion: {
        intake: { plate: string };
        candidate: { policyHolder: { surname?: string }; missing: string[] };
      };
      verification: { checklist: { code: string }[] };
    }>(await r.call(verifier, `/verification/requests/${requestId}`), 200);
    expect(card.quoteData).toBeNull();
    expect(card.completion.intake.plate).toBe("GN123AB");
    expect(card.completion.candidate.policyHolder.surname).toBe("Neri");
    expect(card.completion.candidate.missing).toContain("vehicle.purchaseDate");
    expect(card.verification.checklist.map((i) => i.code)).toEqual(["TO_COMPLETE"]);
    const early = await r.json<{ errors: { issue: string }[] }>(
      await r.call(verifier, `/verification/requests/${requestId}/approve`, { body: {} }),
      409,
    );
    expect(early.errors.map((e) => e.issue)).toEqual(["TO_COMPLETE"]);
  });

  it("the completion makes version 1 of quoteData; then the approval opens the auction", async () => {
    const sample = sampleQuoteData();
    const completed: QuoteData = {
      ...sample,
      policyHolder: { ...sample.policyHolder, residence } as QuoteData["policyHolder"],
      vehicle: { ...sample.vehicle, plate: "GN123AB" },
      request: terms as QuoteData["request"],
    };
    const result = await r.json<{ quoteDataVersion: number }>(
      await r.call(verifier, `/verification/requests/${requestId}/corrections`, {
        body: { quoteData: completed, reason: "Completamento dai documenti" },
      }),
      200,
    );
    expect(result.quoteDataVersion).toBe(1);
    const [version, request] = await system((tx) =>
      Promise.all([
        tx.quoteDataVersion.findFirstOrThrow({ where: { quoteRequestId: requestId } }),
        tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
      ]),
    );
    expect(version.source).toBe("BACK_OFFICE_COMPLETION");
    expect(request.draftEnc).toBeNull();
    expect(request.quoteDataVersion).toBe(1);
    await r.json(
      await r.call(verifier, `/verification/requests/${requestId}/approve`, { body: {} }),
      200,
    );
  });
});
