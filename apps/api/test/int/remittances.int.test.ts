import { randomInt, randomUUID } from "node:crypto";
import { LocalFieldCipher } from "@astax/adapters/crypto";
import { validateXml } from "@astax/adapters/xml";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { addCalendarDays, buildSyntheticIban } from "@astax/shared/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acceptAllLegal,
  membershipId,
  startHarness,
  TEST_CIPHER_KEYS,
  userId,
  type Harness,
} from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 6, step 7: the weekly remittance of an agency (CONT-01, CONT-02,
// EMI-05, PAG-04, proposal C) and its fee invoice A (CONT-03). The test
// database is shared: a new agency each run, on a Monday of its own.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);
const cipher = new LocalFieldCipher(TEST_CIPHER_KEYS.encryption, TEST_CIPHER_KEYS.blindIndex);

const agencyId = randomUUID();
const ownerMembership = randomUUID();
// A Monday far ahead, different at each run: 2030-01-07 plus some weeks.
const runDate = addCalendarDays("2030-01-07", 7 * randomInt(0, 5000));
const premiums = [41_000, 52_550, 38_920];
let penaltyId: string;
let refundId: string;
let remittanceId: string;

const who = async (key: Parameters<Harness["tokenFor"]>[0], context: string): Promise<Who> => ({
  token: await h.tokenFor(key),
  context,
});
const accounting = () => who("bo-accounting", membershipId("bo-accounting", "astax"));
const owner = () => who("agenzia-otto-owner", ownerMembership);

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  // Monday 09:00 in Rome: the policies of the week before are due.
  h.clock.set(new Date(`${runDate}T08:00:00Z`));
  for (const key of [
    "bo-accounting",
    "bo-support",
    "agenzia-otto-owner",
    "agenzia-nove-owner",
  ] as const) {
    await acceptAllLegal(h, key);
  }
  const issuedAt = new Date(`${addCalendarDays(runDate, -4)}T10:00:00Z`);
  await system(async (tx) => {
    await tx.organization.create({
      data: {
        id: agencyId,
        type: "AGENCY",
        legalName: `Agenzia Rimesse ${runDate}`,
        vatNumber: "12345678903",
        ruiNumber: `A9${String(randomInt(0, 99_999_999)).padStart(8, "0")}`,
        ruiSection: "A",
        pec: "rimesse@pec.example.test",
        status: "ACTIVE",
        address: {
          street: "Via degli Esempi 1",
          postalCode: "00184",
          municipalityIstat: "058091",
          province: "RM",
        },
        ibanEnc: cipher.encrypt(buildSyntheticIban(900 + randomInt(0, 99))),
      },
    });
    await tx.membership.create({
      data: {
        id: ownerMembership,
        userId: userId("agenzia-otto-owner"),
        organizationId: agencyId,
        role: "OWNER",
      },
    });
    for (const [i, premiumCents] of premiums.entries()) {
      await tx.policy.create({
        data: {
          quoteRequestId: randomUUID(),
          offerId: randomUUID(),
          acceptanceId: randomUUID(),
          organizationId: agencyId,
          companyId: randomUUID(),
          ownerUserId: userId("private-elena-ferri"),
          policyNumber: `RIM-${runDate}-${i}`,
          startDate: new Date(addCalendarDays(runDate, -3)),
          endDate: new Date(addCalendarDays(runDate, 362)),
          premiumCents,
          issuedAt,
          issuedByUserId: userId("agenzia-otto-owner"),
        },
      });
    }
    // A policy issued after the Friday cutoff: next week.
    await tx.policy.create({
      data: {
        quoteRequestId: randomUUID(),
        offerId: randomUUID(),
        acceptanceId: randomUUID(),
        organizationId: agencyId,
        companyId: randomUUID(),
        policyNumber: `RIM-${runDate}-late`,
        startDate: new Date(runDate),
        endDate: new Date(addCalendarDays(runDate, 365)),
        premiumCents: 47_000,
        issuedAt: new Date(`${addCalendarDays(runDate, -2)}T09:00:00Z`),
        issuedByUserId: userId("agenzia-otto-owner"),
      },
    });
    penaltyId = (
      await tx.penalty.create({
        data: {
          organizationId: agencyId,
          type: "LATE_ISSUANCE",
          amountCents: 2500,
          status: "APPLIED",
          reason: "Ritardo",
          proposedAt: issuedAt,
          appliedAt: issuedAt,
        },
      })
    ).id;
    refundId = (
      await tx.refund.create({
        data: {
          paymentId: randomUUID(),
          quoteRequestId: randomUUID(),
          reason: "WITHDRAWAL",
          premiumCents: 12_000,
          feeCents: 0,
          recoverFromOrganizationId: agencyId,
          requestedAt: issuedAt,
          status: "EXECUTED",
          executedAt: issuedAt,
        },
      })
    ).id;
  });
});

afterAll(async () => {
  await h.close();
});

describe("CONT-01 the weekly remittance", () => {
  it("CONT-01 prepared on Monday: premiums less fees, stamp duty, recovery and penalty", async () => {
    const support = await who("bo-support", membershipId("bo-support", "astax"));
    expect((await r.call(support, "/back-office/remittances/prepare", { body: {} })).status).toBe(
      403,
    );
    const prepared = await r.json<{ runDate: string }>(
      await r.call(await accounting(), "/back-office/remittances/prepare", { body: {} }),
      200,
    );
    expect(prepared.runDate).toBe(runDate);
    const remittance = await system((tx) =>
      tx.remittance.findFirstOrThrow({
        where: { organizationId: agencyId },
        include: { lines: true },
      }),
    );
    remittanceId = remittance.id;
    const gross = premiums.reduce((a, b) => a + b, 0);
    // Three fees of 15 â‚¬; invoice of 45 â‚¬ under the stamp duty threshold.
    expect(remittance).toMatchObject({
      status: "DRAFT",
      grossCents: gross,
      feesCents: 3 * 1500,
      netCents: gross - 4500 - 12_000 - 2500,
      carriedCents: 0,
    });
    expect(remittance.lines.filter((l) => l.kind === "POLICY")).toHaveLength(3);
    expect(remittance.lines.find((l) => l.kind === "PENALTY")?.ref).toBe(penaltyId);
    expect(remittance.lines.find((l) => l.kind === "RECOVERY")?.ref).toBe(refundId);
    expect(remittance.lines.some((l) => l.kind === "STAMP_DUTY")).toBe(false);
    // Preparing again adds nothing.
    await r.json(
      await r.call(await accounting(), "/back-office/remittances/prepare", { body: {} }),
      200,
    );
    expect(await system((tx) => tx.remittance.count({ where: { organizationId: agencyId } }))).toBe(
      1,
    );
  });

  it("CONT-03 the review issues the agency's invoice A, numbered and sent to SDI", async () => {
    await r.json(
      await r.call(await accounting(), `/back-office/remittances/${remittanceId}/review`, {
        body: {},
      }),
      200,
    );
    const remittance = await system((tx) =>
      tx.remittance.findUniqueOrThrow({ where: { id: remittanceId } }),
    );
    expect(remittance.status).toBe("READY");
    const invoice = await system((tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id: remittance.invoiceId ?? "" } }),
    );
    expect(invoice.code).toMatch(new RegExp(`^A-${runDate.slice(0, 4)}-\\d{6}$`));
    expect(invoice).toMatchObject({
      recipientType: "AGENCY",
      ownerOrganizationId: agencyId,
      exemptCents: 4500,
      stampDutyCents: 0,
      totalCents: 4500,
    });
    expect(invoice.sdiStatus).toBe("SENT");
    expect(invoice.pdfDocumentId).not.toBeNull();
    // A second review is refused.
    const again = await r.call(
      await accounting(),
      `/back-office/remittances/${remittanceId}/review`,
      { body: {} },
    );
    expect(again.status).toBe(409);
  });

  it("CONT-02 the SEPA file passes the pain.001 schema; the agency is told once executed", async () => {
    const file = await r.json<{ key: string; transfers: number }>(
      await r.call(await accounting(), "/back-office/remittances/file", { body: { runDate } }),
      201,
    );
    expect(file.transfers).toBeGreaterThanOrEqual(1);
    const xml = new TextDecoder().decode(await h.storage.get(file.key));
    expect((await validateXml("PAIN_001", xml)).valid).toBe(true);
    const net = premiums.reduce((a, b) => a + b, 0) - 4500 - 12_000 - 2500;
    expect(xml).toContain(`>${(net / 100).toFixed(2)}<`);
    expect(xml).toContain(remittanceId.replace(/-/g, ""));
    const download = await r.call(
      await accounting(),
      `/back-office/remittances/${remittanceId}/file`,
    );
    expect(download.status).toBe(200);

    await r.json(
      await r.call(await accounting(), `/back-office/remittances/${remittanceId}/execute`, {
        body: {},
      }),
      200,
    );
    const note = await system((tx) =>
      tx.notification.findFirstOrThrow({
        where: {
          eventKey: "remittance.executed",
          payload: { path: ["remittanceId"], equals: remittanceId },
        },
      }),
    );
    // Rule 8: no amount in the notification.
    expect(JSON.stringify(note)).not.toContain((net / 100).toFixed(2).replace(".", ","));
  });

  it("spec 04 the agency's statement: policies, remittance, invoice", async () => {
    const statement = await r.json<{
      policies: { policyNumber: string; feeCents: number | null; remittance: unknown }[];
      remittances: {
        id: string;
        status: string;
        penaltiesCents: number;
        recoveriesCents: number;
      }[];
      invoices: { id: string; code: string }[];
    }>(await r.call(await owner(), "/agency/statement"), 200);
    expect(statement.policies).toHaveLength(4);
    expect(statement.policies.find((p) => p.policyNumber.endsWith("late"))?.remittance).toBeNull();
    expect(statement.policies.filter((p) => p.feeCents === 1500)).toHaveLength(3);
    expect(statement.remittances).toEqual([
      expect.objectContaining({
        id: remittanceId,
        status: "EXECUTED",
        penaltiesCents: 2500,
        recoveriesCents: 12_000,
      }),
    ]);
    expect(statement.invoices).toHaveLength(1);
    const pdf = await r.call(await owner(), `/invoices/${statement.invoices[0]?.id ?? ""}/pdf`);
    expect(pdf.status).toBe(200);
    // Another agency's owner does not see it.
    const other = await r.call(
      await who("agenzia-nove-owner", membershipId("agenzia-nove-owner", "agenzia-nove")),
      `/invoices/${statement.invoices[0]?.id ?? ""}/pdf`,
    );
    expect(other.status).toBe(404);
  });

  it("CONT-01 a penalty bigger than the net is carried to the next week", async () => {
    const nextRun = addCalendarDays(runDate, 7);
    const big = await system((tx) =>
      tx.penalty.create({
        data: {
          organizationId: agencyId,
          type: "MISSED_ISSUANCE",
          amountCents: 100_000,
          status: "UPHELD",
          reason: "Mancata emissione",
          proposedAt: h.clock.now(),
          appliedAt: h.clock.now(),
        },
      }),
    );
    h.clock.set(new Date(`${nextRun}T08:00:00Z`));
    await r.json(
      await r.call(await accounting(), "/back-office/remittances/prepare", { body: {} }),
      200,
    );
    const next = await system((tx) =>
      tx.remittance.findFirstOrThrow({
        where: { organizationId: agencyId, runDate: new Date(nextRun) },
        include: { lines: true },
      }),
    );
    // Only the late policy: 470 â‚¬ less its fee; the rest of the penalty stays due.
    expect(next.netCents).toBe(0);
    expect(next.carriedCents).toBe(100_000 - (47_000 - 1500));
    expect(next.lines.find((l) => l.ref === big.id)?.appliedCents).toBe(47_000 - 1500);
  });
});

describe("proposal D the invoice to complete", () => {
  it("CONT-03 the back office completes the fiscal data and the invoice goes to SDI", async () => {
    const invoice = await system(async (tx) => {
      const [counter] = await tx.$queryRaw<{ last: number }[]>`
        INSERT INTO "InvoiceCounter" ("series", "year", "last") VALUES ('P', 2099, 1)
        ON CONFLICT ("series", "year") DO UPDATE SET "last" = "InvoiceCounter"."last" + 1
        RETURNING "last"`;
      return tx.invoice.create({
        data: {
          series: "P",
          year: 2099,
          number: counter?.last ?? 0,
          code: `P-2099-${String(counter?.last ?? 0).padStart(6, "0")}`,
          recipientType: "PRIVATE",
          ownerUserId: userId("private-elena-ferri"),
          recipientEnc: cipher.encrypt(JSON.stringify({ name: "Elena Ferri", sdiCode: "0000000" })),
          lines: [{ description: "Compenso", quantity: 1, unitCents: 3000 }],
          exemptCents: 3000,
          stampDutyCents: 0,
          totalCents: 3000,
          vatNature: "N4",
          legalReference: "Art. 10",
          issuedOn: new Date(runDate),
        },
      });
    });
    const list = await r.json<{ id: string; toComplete: boolean }[]>(
      await r.call(await accounting(), "/back-office/invoices?daCompletare=1"),
      200,
    );
    expect(list.find((i) => i.id === invoice.id)?.toComplete).toBe(true);
    const bad = await r.call(await accounting(), `/back-office/invoices/${invoice.id}/recipient`, {
      body: {
        address: {
          street: "Via Roma 1",
          postalCode: "00184",
          municipalityIstat: "058091",
          province: "RM",
        },
      },
    });
    expect(bad.status).toBe(400);
    const done = await r.json<{ toComplete: boolean; sdiStatus: string }>(
      await r.call(await accounting(), `/back-office/invoices/${invoice.id}/recipient`, {
        body: {
          fiscalCode: "FRRLNE80A41H501X",
          address: {
            street: "Via Roma 1",
            postalCode: "00184",
            municipalityIstat: "058091",
            province: "RM",
          },
        },
      }),
      200,
    );
    expect(done).toMatchObject({ toComplete: false, sdiStatus: "SENT" });
    // Rule 8: the audit names the fields completed, never their values.
    const audit = await system((tx) =>
      tx.auditLog.findFirstOrThrow({
        where: { action: "INVOICE_RECIPIENT_COMPLETED", targetId: invoice.id },
      }),
    );
    expect(JSON.stringify({ ...audit, seq: String(audit.seq) })).not.toContain("FRRLNE80A41H501X");
  });
});
