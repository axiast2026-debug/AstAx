import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 7, spec 06 «Clienti»: search by name, plate or fiscal code; the card
// with requests, consents and the log of who opened the data; the copy of
// the data; the requests about personal data with their legal term.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let support: Who;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);
let plate = "";
// The sample plate is the same for many test customers: the one of this file.
let galliId = "";

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  const owner: Who = { token: await h.tokenFor("private-davide-galli") };
  await acceptAllLegal(h, "private-davide-galli");
  const request = await r.submittedPrivateRequest(owner, "davide.galli@example.test");
  const stored = await system((tx) =>
    tx.quoteRequest.findUniqueOrThrow({ where: { id: request.id } }),
  );
  plate = stored.plate ?? "";
  galliId = stored.customerId ?? "";
  await acceptAllLegal(h, "bo-support");
  support = { token: await h.tokenFor("bo-support"), context: membershipId("bo-support", "astax") };
});

afterAll(async () => {
  await h.close();
});

interface Card {
  id: string;
  requests: { code: string }[];
  consents: unknown[];
  accessLog: { action: string; whoKind: string | null }[];
  dataRequests: { id: string; status: string; dueAt: string }[];
}

describe("phase 7 customers in the back office", () => {
  it("finds the customer by plate and by name; the search is logged", async () => {
    expect(plate).not.toBe("");
    const byPlate = await r.json<{ id: string; name: string }[]>(
      await r.call(support, "/back-office/customers/search", { body: { q: plate } }),
      200,
    );
    expect(byPlate.map((c) => c.id)).toContain(galliId);
    const byName = await r.json<{ id: string }[]>(
      await r.call(support, "/back-office/customers/search", { body: { q: "galli" } }),
      200,
    );
    expect(byName.map((c) => c.id)).toContain(galliId);
    const searched = await system((tx) =>
      tx.auditLog.findFirst({ where: { action: "CUSTOMERS_SEARCHED" } }),
    );
    expect(searched).not.toBeNull();
  });

  it("the card shows requests and consents, and the opening goes into its access log", async () => {
    const found = { id: galliId };
    const first = await r.json<Card>(
      await r.call(support, `/back-office/customers/${found?.id}`),
      200,
    );
    expect(first.requests.length).toBeGreaterThanOrEqual(1);
    expect(first.consents.length).toBeGreaterThanOrEqual(1);
    const second = await r.json<Card>(
      await r.call(support, `/back-office/customers/${found?.id}`),
      200,
    );
    expect(
      second.accessLog.some((a) => a.action === "CUSTOMER_VIEWED" && a.whoKind === "STAFF"),
    ).toBe(true);

    const file = await r.call(support, `/back-office/customers/${found?.id}/export`);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toContain("application/json");
    const data = (await file.json()) as { requests: unknown[]; accessLog?: unknown };
    expect(data.requests.length).toBeGreaterThanOrEqual(1);
    expect(data.accessLog).toBeUndefined();
    const exported = await system((tx) =>
      tx.auditLog.findFirst({ where: { action: "CUSTOMER_DATA_EXPORTED", targetId: found?.id } }),
    );
    expect(exported).not.toBeNull();
  });

  it("a request about personal data gets the legal term and is closed with the outcome", async () => {
    const found = { id: galliId };
    const opened = await r.json<{ id: string; dueAt: string }>(
      await r.call(support, `/back-office/customers/${found?.id}/data-requests`, {
        body: {
          kind: "ACCESS",
          description: "Chiede copia dei dati via email",
          receivedOn: "2026-10-01",
        },
      }),
      201,
    );
    // privacy.requestResponseDays (30) from the receipt.
    expect(opened.dueAt).toBe("2026-10-31T22:59:59.999Z");
    const queue = await r.json<{ id: string }[]>(
      await r.call(support, "/back-office/data-requests"),
      200,
    );
    expect(queue.map((q) => q.id)).toContain(opened.id);
    await r.json(
      await r.call(support, `/back-office/data-requests/${opened.id}/close`, {
        body: { done: true, outcome: "Copia inviata all'indirizzo verificato" },
      }),
      200,
    );
    const again = await r.call(support, `/back-office/data-requests/${opened.id}/close`, {
      body: { done: true, outcome: "Di nuovo" },
    });
    expect(again.status).toBe(409);
  });

  it("the verifier does not open the customers' cards", async () => {
    await acceptAllLegal(h, "bo-verifier");
    const verifier: Who = {
      token: await h.tokenFor("bo-verifier"),
      context: membershipId("bo-verifier", "astax"),
    };
    expect(
      (await r.call(verifier, "/back-office/customers/search", { body: { q: "galli" } })).status,
    ).toBe(403);
  });
});
