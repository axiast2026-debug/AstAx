import { randomInt, randomUUID } from "node:crypto";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { addCalendarDays } from "@astax/shared/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, userId, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 6, step 8: the broker's monthly invoice B (decision 24, CONT-04) and
// its statement with the CSV (CONT-05). The test database is shared: a new
// broker each run, in a month of its own.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);

const brokerId = randomUUID();
const ownerMembership = randomUUID();
const year = 2040 + randomInt(0, 400);
const month = String(randomInt(1, 12)).padStart(2, "0");
const period = `${year}-${month}`;
const nextMonthFirst =
  month === "12" ? `${year + 1}-01-01` : `${year}-${String(Number(month) + 1).padStart(2, "0")}-01`;
const premiums = [61_000, 48_500, 55_250];

const who = async (key: Parameters<Harness["tokenFor"]>[0], context: string): Promise<Who> => ({
  token: await h.tokenFor(key),
  context,
});
const accounting = () => who("bo-accounting", membershipId("bo-accounting", "astax"));
const owner = () => who("broker-owner", ownerMembership);

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  h.clock.set(new Date(`${nextMonthFirst}T07:00:00Z`));
  for (const key of ["bo-accounting", "broker-owner", "broker-operator"] as const) {
    await acceptAllLegal(h, key);
  }
  await system(async (tx) => {
    const company = await tx.insuranceCompany.findFirstOrThrow({ select: { id: true } });
    await tx.organization.create({
      data: {
        id: brokerId,
        type: "BROKER",
        legalName: `Broker Mensile ${period}`,
        vatNumber: "12345678903",
        ruiNumber: `B9${String(randomInt(0, 99_999_999)).padStart(8, "0")}`,
        ruiSection: "B",
        pec: "mensile@pec.example.test",
        status: "ACTIVE",
        address: {
          street: "Via degli Esempi 2",
          postalCode: "20121",
          municipalityIstat: "015146",
          province: "MI",
        },
      },
    });
    await tx.membership.create({
      data: {
        id: ownerMembership,
        userId: userId("broker-owner"),
        organizationId: brokerId,
        role: "OWNER",
      },
    });
    for (const [i, premiumCents] of premiums.entries()) {
      // A request for the acceptance to point at (one live acceptance each).
      const request = await tx.quoteRequest.create({
        data: {
          code: `AX-${year}-${String(randomInt(0, 999_999)).padStart(6, "0")}`,
          channel: "BROKER",
          requesterUserId: userId("broker-owner"),
          ownerOrganizationId: brokerId,
        },
      });
      const acceptance = await tx.acceptance.create({
        data: {
          quoteRequestId: request.id,
          offerId: randomUUID(),
          ownerOrganizationId: brokerId,
          acceptedByUserId: userId("broker-owner"),
          premiumCents,
          feeCents: 0,
          feeRule: "BROKER",
          brokerFeeCents: 3000,
          aiUsed: false,
          status: "PAID",
        },
      });
      await tx.policy.create({
        data: {
          quoteRequestId: request.id,
          offerId: acceptance.offerId,
          acceptanceId: acceptance.id,
          organizationId: randomUUID(),
          companyId: company.id,
          ownerOrganizationId: brokerId,
          policyNumber: `BRK-${period}-${i}`,
          startDate: new Date(`${period}-10`),
          endDate: new Date(addCalendarDays(`${period}-10`, 365)),
          premiumCents,
          issuedAt: new Date(`${period}-${String(10 + i).padStart(2, "0")}T09:00:00Z`),
          issuedByUserId: randomUUID(),
        },
      });
    }
  });
});

afterAll(async () => {
  await h.close();
});

describe("decision 24 the broker's monthly invoice", () => {
  let invoiceCode: string;

  it("CONT-03 CONT-04 one invoice B for the month: 3 × 30 €, stamp duty above the threshold, due at 30 days", async () => {
    const operator = await who("broker-operator", membershipId("broker-operator", "broker-demo"));
    expect((await r.call(operator, "/broker/statement")).status).toBe(403);
    const out = await r.json<{ created: number }>(
      await r.call(await accounting(), "/back-office/invoices/broker-month", { body: { period } }),
      200,
    );
    expect(out.created).toBeGreaterThanOrEqual(1);
    const invoice = await system((tx) =>
      tx.invoice.findFirstOrThrow({ where: { ownerOrganizationId: brokerId, series: "B" } }),
    );
    invoiceCode = invoice.code;
    expect(invoice).toMatchObject({
      recipientType: "BROKER",
      period,
      exemptCents: 9000,
      stampDutyCents: 200,
      totalCents: 9200,
      sdiStatus: "SENT",
    });
    expect(invoice.lines).toEqual([expect.objectContaining({ quantity: 3, unitCents: 3000 })]);
    expect(invoice.dueOn?.toISOString().slice(0, 10)).toBe(addCalendarDays(nextMonthFirst, 30));
    // Again for the same month: nothing new.
    await r.json(
      await r.call(await accounting(), "/back-office/invoices/broker-month", { body: { period } }),
      200,
    );
    expect(
      await system((tx) => tx.invoice.count({ where: { ownerOrganizationId: brokerId } })),
    ).toBe(1);
    expect(
      await system((tx) =>
        tx.policy.count({ where: { ownerOrganizationId: brokerId, brokerInvoiceId: invoice.id } }),
      ),
    ).toBe(3);
  });

  it("decision 24 a policy not billed yet (issued after the invoice) goes in the next one, once", async () => {
    await system(async (tx) => {
      const request = await tx.quoteRequest.create({
        data: {
          code: `AX-${year}-${String(randomInt(0, 999_999)).padStart(6, "0")}`,
          channel: "BROKER",
          requesterUserId: userId("broker-owner"),
          ownerOrganizationId: brokerId,
        },
      });
      const acceptance = await tx.acceptance.create({
        data: {
          quoteRequestId: request.id,
          offerId: randomUUID(),
          ownerOrganizationId: brokerId,
          acceptedByUserId: userId("broker-owner"),
          premiumCents: 40_000,
          feeCents: 0,
          feeRule: "BROKER",
          brokerFeeCents: 3000,
          aiUsed: false,
          status: "PAID",
        },
      });
      await tx.policy.create({
        data: {
          quoteRequestId: request.id,
          offerId: acceptance.offerId,
          acceptanceId: acceptance.id,
          organizationId: randomUUID(),
          companyId: randomUUID(),
          ownerOrganizationId: brokerId,
          policyNumber: `BRK-${period}-late`,
          startDate: new Date(`${period}-28`),
          endDate: new Date(addCalendarDays(`${period}-28`, 365)),
          premiumCents: 40_000,
          issuedAt: new Date(`${period}-28T09:00:00Z`),
          issuedByUserId: randomUUID(),
        },
      });
    });
    for (let i = 0; i < 2; i += 1) {
      await r.json(
        await r.call(await accounting(), "/back-office/invoices/broker-month", {
          body: { period },
        }),
        200,
      );
    }
    const invoices = await system((tx) =>
      tx.invoice.findMany({ where: { ownerOrganizationId: brokerId }, orderBy: { number: "asc" } }),
    );
    expect(invoices).toHaveLength(2);
    expect(invoices[1]).toMatchObject({ exemptCents: 3000, stampDutyCents: 0 });
  });

  it("CONT-05 the statement: policies, premium, fee due and the invoice that bills it; the CSV", async () => {
    const statement = await r.json<{
      policies: {
        policyNumber: string;
        premiumCents: number;
        feeCents: number;
        invoiceCode: string | null;
      }[];
      invoices: { code: string; hasPdf: boolean }[];
    }>(await r.call(await owner(), "/broker/statement"), 200);
    // Three policies in the first invoice, the late one in the second.
    expect(statement.policies).toHaveLength(4);
    expect(statement.policies.every((p) => p.feeCents === 3000)).toBe(true);
    expect(statement.policies.filter((p) => p.invoiceCode === invoiceCode)).toHaveLength(3);
    expect(statement.policies.every((p) => p.invoiceCode !== null)).toBe(true);
    expect(statement.invoices).toHaveLength(2);
    expect(statement.invoices).toContainEqual(
      expect.objectContaining({ code: invoiceCode, hasPdf: true }),
    );
    const csv = await r.call(await owner(), "/broker/statement/csv");
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const text = await csv.text();
    expect(text.split("\r\n")[0]).toContain("richiesta;polizza;compagnia;emessa_il;premio");
    expect(text).toContain("610,00");
    expect(text).toContain(`"${invoiceCode}"`);
  });
});
