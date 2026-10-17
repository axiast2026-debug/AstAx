import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SYSTEM_CONTEXT, withContext, type DbClient } from "../src/index.js";
import { appDb, asMember, asPrivate, createWorld, type World } from "./fixtures.js";

// Phase 5: the database is the second line for acceptances, payments, AI
// suggestions and the complaints index (rule 3).
let db: DbClient;
let w: World;
let requestId: string;
let companyId: string;
const tag = Math.random().toString(36).slice(2, 8).toUpperCase();

beforeAll(async () => {
  db = appDb();
  w = await createWorld(db);
  ({ requestId, companyId } = await withContext(db, SYSTEM_CONTEXT, async (tx) => {
    const request = await tx.quoteRequest.create({
      data: {
        code: `A-${tag}`,
        channel: "PRIVATE",
        ownerUserId: w.giuliaNeri,
        requesterUserId: w.giuliaNeri,
        status: "OFFERS_AVAILABLE",
      },
    });
    const company = await tx.insuranceCompany.create({ data: { name: `Compagnia ${tag}` } });
    await tx.acceptance.create({
      data: {
        quoteRequestId: request.id,
        offerId: randomUUID(),
        ownerUserId: w.giuliaNeri,
        acceptedByUserId: w.giuliaNeri,
        premiumCents: 52000,
        feeCents: 3500,
        feeRule: "PRIVATE_AI",
        aiUsed: true,
      },
    });
    return { requestId: request.id, companyId: company.id };
  }));
});

afterAll(async () => {
  await db.$disconnect();
});

describe("phase 5: acceptance, payment, complaints index, row level security", () => {
  it("the requester reads their acceptance; an agency does not", async () => {
    const own = await withContext(db, asPrivate(w.giuliaNeri), (tx) =>
      tx.acceptance.count({ where: { quoteRequestId: requestId } }),
    );
    expect(own).toBe(1);
    const agency = await withContext(db, asMember(w.ownerUno, w.agenziaUno), (tx) =>
      tx.acceptance.count({ where: { quoteRequestId: requestId } }),
    );
    expect(agency).toBe(0);
  });

  it("only the system writes acceptances and payments, never the requester directly", async () => {
    await expect(
      withContext(db, asPrivate(w.giuliaNeri), (tx) =>
        tx.acceptance.updateMany({ where: { quoteRequestId: requestId }, data: { feeCents: 0 } }),
      ),
    ).resolves.toEqual({ count: 0 });
    await expect(
      withContext(db, asPrivate(w.giuliaNeri), (tx) =>
        tx.payment.createMany({
          data: [
            {
              acceptanceId: randomUUID(),
              ownerUserId: w.giuliaNeri,
              provider: "fake",
              premiumCents: 1,
              feeCents: 0,
              idempotencyKey: randomUUID(),
            },
          ],
        }),
      ),
    ).rejects.toThrow();
  });

  it("FEE-07 amounts are whole positive cents; one live acceptance per request (decision 22)", async () => {
    await expect(
      withContext(db, SYSTEM_CONTEXT, (tx) =>
        tx.acceptance.create({
          data: {
            quoteRequestId: requestId,
            offerId: randomUUID(),
            ownerUserId: w.giuliaNeri,
            acceptedByUserId: w.giuliaNeri,
            premiumCents: 50500,
            feeCents: 3000,
            feeRule: "PRIVATE",
            aiUsed: false,
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withContext(db, SYSTEM_CONTEXT, (tx) =>
        tx.acceptance.updateMany({
          where: { quoteRequestId: requestId },
          data: { premiumCents: 0 },
        }),
      ),
    ).rejects.toThrow();
  });

  it("PRES-07 the complaints index is read by everybody and written by AstAx only", async () => {
    await expect(
      withContext(db, asMember(w.ownerUno, w.agenziaUno), (tx) =>
        tx.companyComplaintsIndex.createMany({
          data: [{ companyId, year: 2025, value: 0.3, source: "x", createdByUserId: w.ownerUno }],
        }),
      ),
    ).rejects.toThrow();
    await withContext(db, asMember(w.boVerifier, w.astax, true, "BO_SUPERVISOR"), (tx) =>
      tx.companyComplaintsIndex.create({
        data: {
          companyId,
          year: 2025,
          value: 0.3,
          source: "IVASS 2025",
          createdByUserId: w.boVerifier,
        },
      }),
    );
    const seen = await withContext(db, asPrivate(w.giuliaNeri), (tx) =>
      tx.companyComplaintsIndex.count({ where: { companyId } }),
    );
    expect(seen).toBe(1);
  });

  it("PRES-08 an AI suggestion is never changed after it was shown", async () => {
    const id = await withContext(
      db,
      SYSTEM_CONTEXT,
      async (tx) =>
        (
          await tx.aiSuggestion.create({
            data: {
              quoteRequestId: requestId,
              ownerUserId: w.giuliaNeri,
              offerIds: [],
              weights: {},
              inputs: {},
              scores: {},
              recommendedOfferId: randomUUID(),
              text: "testo",
              textSource: "FALLBACK",
              model: "fake",
              promptVersion: "fake-1",
              shownAt: new Date("2026-11-16T12:00:00.000Z"),
            },
          })
        ).id,
    );
    await expect(
      withContext(db, SYSTEM_CONTEXT, (tx) =>
        tx.aiSuggestion.update({ where: { id }, data: { text: "altro" } }),
      ),
    ).rejects.toThrow();
  });
});
