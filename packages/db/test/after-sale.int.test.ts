import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SYSTEM_CONTEXT, withContext, type DbClient } from "../src/index.js";
import { appDb, asMember, asPrivate, createWorld, type World } from "./fixtures.js";

// Phase 6: the database is the second line for policies, penalties,
// remittances, invoices, refunds and flags (rule 3).
let db: DbClient;
let w: World;
let requestId: string;
const tag = Math.random().toString(36).slice(2, 8).toUpperCase();

beforeAll(async () => {
  db = appDb();
  w = await createWorld(db);
  requestId = await withContext(db, SYSTEM_CONTEXT, async (tx) => {
    const request = await tx.quoteRequest.create({
      data: {
        code: `S-${tag}`,
        channel: "PRIVATE",
        ownerUserId: w.giuliaNeri,
        requesterUserId: w.giuliaNeri,
        status: "ISSUED",
      },
    });
    const company = await tx.insuranceCompany.create({ data: { name: `Compagnia S${tag}` } });
    await tx.policy.create({
      data: {
        quoteRequestId: request.id,
        offerId: randomUUID(),
        acceptanceId: randomUUID(),
        organizationId: w.agenziaUno,
        companyId: company.id,
        ownerUserId: w.giuliaNeri,
        policyNumber: `POL-${tag}`,
        startDate: new Date("2026-11-20"),
        endDate: new Date("2027-11-19"),
        premiumCents: 52000,
        issuedAt: new Date("2026-11-16T14:00:00Z"),
        issuedByUserId: w.ownerUno,
      },
    });
    await tx.penalty.create({
      data: {
        organizationId: w.agenziaUno,
        type: "LATE_ISSUANCE",
        amountCents: 2500,
        quoteRequestId: request.id,
        reason: "Termine superato",
        proposedAt: new Date("2026-11-16T16:30:00Z"),
      },
    });
    await tx.invoice.create({
      data: {
        series: "P",
        year: 2026,
        number: 900_000 + Math.floor(Math.random() * 99_999),
        code: `P-TEST-${tag}`,
        recipientType: "PRIVATE",
        ownerUserId: w.giuliaNeri,
        recipientEnc: "x",
        lines: [],
        exemptCents: 3500,
        stampDutyCents: 0,
        totalCents: 3500,
        vatNature: "N4",
        legalReference: "esente",
        issuedOn: new Date("2026-11-16"),
        quoteRequestId: request.id,
      },
    });
    await tx.flag.create({
      data: { type: "CIRCUMVENTION", source: "SURVEY", quoteRequestId: request.id },
    });
    return request.id;
  });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("phase 6: policies, penalties, invoices, flags, row level security", () => {
  it("EMI-02 the policy: the requester and the issuing agency read it, another agency does not", async () => {
    const count = (ctx: Parameters<typeof withContext>[1]) =>
      withContext(db, ctx, (tx) => tx.policy.count({ where: { quoteRequestId: requestId } }));
    expect(await count(asPrivate(w.giuliaNeri))).toBe(1);
    expect(await count(asMember(w.ownerUno, w.agenziaUno))).toBe(1);
    expect(await count(asMember(w.ownerDue, w.agenziaDue))).toBe(0);
    expect(await count(asMember(w.boVerifier, w.astax, true, "BO_VERIFIER"))).toBe(1);
  });

  it("EMI-05 penalties: the agency reads its own, the customer never", async () => {
    const count = (ctx: Parameters<typeof withContext>[1]) =>
      withContext(db, ctx, (tx) => tx.penalty.count({ where: { quoteRequestId: requestId } }));
    expect(await count(asMember(w.ownerUno, w.agenziaUno))).toBe(1);
    expect(await count(asMember(w.ownerDue, w.agenziaDue))).toBe(0);
    expect(await count(asPrivate(w.giuliaNeri))).toBe(0);
  });

  it("CONT-03 the invoice: only its recipient and AstAx; never deleted", async () => {
    const count = (ctx: Parameters<typeof withContext>[1]) =>
      withContext(db, ctx, (tx) => tx.invoice.count({ where: { quoteRequestId: requestId } }));
    expect(await count(asPrivate(w.giuliaNeri))).toBe(1);
    expect(await count(asMember(w.ownerUno, w.agenziaUno))).toBe(0);
    await expect(
      withContext(db, SYSTEM_CONTEXT, (tx) =>
        tx.invoice.deleteMany({ where: { quoteRequestId: requestId } }),
      ),
    ).rejects.toThrow();
  });

  it("CONT-03 a credit note always points to the invoice it credits", async () => {
    await expect(
      withContext(db, SYSTEM_CONTEXT, (tx) =>
        tx.invoice.create({
          data: {
            series: "N",
            year: 2026,
            number: 900_001,
            code: `N-TEST-${tag}`,
            recipientType: "PRIVATE",
            ownerUserId: w.giuliaNeri,
            recipientEnc: "x",
            lines: [],
            exemptCents: 100,
            stampDutyCents: 0,
            totalCents: 100,
            vatNature: "N4",
            legalReference: "esente",
            issuedOn: new Date("2026-11-16"),
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("flags are for the back office only; only the system writes the after-sale tables", async () => {
    const flags = (ctx: Parameters<typeof withContext>[1]) =>
      withContext(db, ctx, (tx) => tx.flag.count({ where: { quoteRequestId: requestId } }));
    expect(await flags(asMember(w.boVerifier, w.astax, true, "BO_VERIFIER"))).toBe(1);
    expect(await flags(asMember(w.ownerUno, w.agenziaUno))).toBe(0);
    expect(await flags(asPrivate(w.giuliaNeri))).toBe(0);
    await expect(
      withContext(db, asMember(w.ownerUno, w.agenziaUno), (tx) =>
        tx.penalty.updateMany({ where: { quoteRequestId: requestId }, data: { amountCents: 1 } }),
      ),
    ).resolves.toEqual({ count: 0 });
    await expect(
      withContext(db, asMember(w.ownerUno, w.agenziaUno), (tx) =>
        tx.remittance.create({
          data: {
            organizationId: w.agenziaUno,
            runDate: new Date("2026-11-23"),
            cutoffAt: new Date("2026-11-20T22:59:59Z"),
            grossCents: 1,
            feesCents: 0,
            heldCents: 0,
            netCents: 1,
            carriedCents: 0,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("rule 5 a remittance is never negative", async () => {
    await expect(
      withContext(db, SYSTEM_CONTEXT, (tx) =>
        tx.remittance.create({
          data: {
            organizationId: w.agenziaDue,
            runDate: new Date("2026-11-23"),
            cutoffAt: new Date("2026-11-20T22:59:59Z"),
            grossCents: 1000,
            feesCents: 1500,
            heldCents: 0,
            netCents: -500,
            carriedCents: 0,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
