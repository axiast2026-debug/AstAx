import { randomUUID } from "node:crypto";
import { registerComplaint, SYSTEM_CONTEXT, withContext } from "@astax/db";
import { createLogger } from "@astax/shared/logging";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeRuiRegistry } from "@astax/adapters/rui-registry";
import {
  importRuiIfDue,
  remindComplaintsIfDue,
  issueBrokerInvoicesIfDue,
  prepareRemittancesIfDue,
} from "../../src/schedules.js";
import { WorkerNotifier } from "../../src/notifier.js";
import { harness, orgId, userId, type Harness } from "./fixtures.js";

// ADR 0010: the Monday remittances and the brokers' monthly invoices follow
// the application clock and catch up when the worker was stopped that day.
let h: Harness;

beforeAll(() => {
  h = harness("2026-11-18T09:00:00.000Z");
});

afterAll(async () => {
  await h.db.$disconnect();
});

describe("ADR 0010 the schedules", () => {
  it("CONT-01 on Wednesday the remittances of Monday are prepared (catch-up), once", async () => {
    // Wednesday 18/11/2026: the latest run day is Monday 16/11.
    const first = await prepareRemittancesIfDue(h.db, h.clock.now());
    expect(first.runDate).toBe("2026-11-16");
    const again = await prepareRemittancesIfDue(h.db, h.clock.now());
    expect(again).toEqual({ runDate: "2026-11-16", created: 0 });
  });

  it("decision 24 on the 3rd the invoices of the month before are issued (catch-up), each policy once", async () => {
    const issuedAt = new Date("2026-10-20T09:00:00.000Z");
    const policyId = await withContext(h.db, SYSTEM_CONTEXT, async (tx) => {
      const request = await tx.quoteRequest.create({
        data: {
          code: `AX-S-${randomUUID().slice(0, 8)}`,
          channel: "BROKER",
          requesterUserId: userId("broker-owner"),
          ownerOrganizationId: orgId("broker-demo"),
        },
      });
      const acceptance = await tx.acceptance.create({
        data: {
          quoteRequestId: request.id,
          offerId: randomUUID(),
          ownerOrganizationId: orgId("broker-demo"),
          acceptedByUserId: userId("broker-owner"),
          premiumCents: 61_000,
          feeCents: 0,
          feeRule: "BROKER",
          brokerFeeCents: 3000,
          aiUsed: false,
          status: "PAID",
        },
      });
      const policy = await tx.policy.create({
        data: {
          quoteRequestId: request.id,
          offerId: acceptance.offerId,
          acceptanceId: acceptance.id,
          organizationId: orgId("agenzia-uno"),
          companyId: randomUUID(),
          ownerOrganizationId: orgId("broker-demo"),
          policyNumber: `SCH-${randomUUID().slice(0, 8)}`,
          startDate: new Date("2026-10-25"),
          endDate: new Date("2027-10-24"),
          premiumCents: 61_000,
          issuedAt,
          issuedByUserId: randomUUID(),
        },
      });
      return policy.id;
    });
    const at = new Date("2026-11-03T09:00:00.000Z");
    const first = await issueBrokerInvoicesIfDue(h.db, h.cipher, at, "Fee");
    expect(first.period).toBe("2026-10");
    expect(first.created).toBeGreaterThanOrEqual(1);
    const policy = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.policy.findUniqueOrThrow({ where: { id: policyId } }),
    );
    expect(policy.brokerInvoiceId).not.toBeNull();
    expect(await issueBrokerInvoicesIfDue(h.db, h.cipher, at, "Fee")).toEqual({
      period: "2026-10",
      created: 0,
    });
  });

  it("phase 7 the RUI is imported once a day; a cancelled intermediary leaves the copy", async () => {
    const day = new Date("2031-03-03T09:00:00.000Z");
    const first = await importRuiIfDue(h.db, new FakeRuiRegistry(), day);
    expect(first).toMatchObject({ runDate: "2031-03-03", skipped: false });
    expect(first.imported).toBeGreaterThan(10);
    expect(await importRuiIfDue(h.db, new FakeRuiRegistry(), day)).toMatchObject({ skipped: true });

    const smaller = new FakeRuiRegistry(
      "number;section;name;linked;companies\nA000000001;A;Agenzia Uno;;Compagnia Alfa",
    );
    const next = await importRuiIfDue(h.db, smaller, new Date("2031-03-04T09:00:00.000Z"));
    expect(next.imported).toBe(1);
    const left = await withContext(h.db, SYSTEM_CONTEXT, (tx) => tx.ruiRecord.findMany());
    expect(left.map((r) => r.number)).toEqual(["A000000001"]);
    expect(left[0]?.companies).toEqual(["Compagnia Alfa"]);
  });

  it("spec 06 the supervisors are told 5 days before a complaint is due, once", async () => {
    // Received on 13/10/2026: due 45 days later, on 27/11; reminded from 22/11.
    const complaint = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      registerComplaint(
        tx,
        {
          receivedAt: new Date("2026-10-13T10:00:00.000Z"),
          channel: "PEC",
          complainantUserId: null,
          complainantName: "Reclamante di prova",
          complainantEmailEnc: null,
          complainantLocale: "it",
          customerId: null,
          quoteRequestId: null,
          organizationId: null,
          subject: "Ritardo",
          description: "Risposta lenta del supporto.",
          createdByUserId: null,
        },
        new Date("2026-10-13T10:00:00.000Z"),
      ),
    );
    expect(complaint.protocol).toMatch(/^R-2026-\d{6}$/);
    expect(complaint.dueAt.toISOString()).toBe("2026-11-27T10:00:00.000Z");
    const notifier = new WorkerNotifier(h.email, createLogger({ name: "t", level: "silent" }), {
      clock: h.clock,
      cipher: h.cipher,
    });
    const deps = { db: h.db, cipher: h.cipher, notifier, adminUrl: "http://admin.test" };
    expect(await remindComplaintsIfDue(deps, new Date("2026-11-21T09:00:00.000Z"))).toEqual({
      reminded: 0,
    });
    const first = await remindComplaintsIfDue(deps, new Date("2026-11-22T11:00:00.000Z"));
    expect(first.reminded).toBeGreaterThanOrEqual(1);
    const inApp = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.notification.findMany({
        where: { eventKey: "complaint.due_soon.bo", userId: userId("bo-supervisor") },
      }),
    );
    expect(inApp.some((n) => n.title.includes(complaint.protocol))).toBe(true);
    expect(await remindComplaintsIfDue(deps, new Date("2026-11-23T09:00:00.000Z"))).toEqual({
      reminded: 0,
    });
  });
});
