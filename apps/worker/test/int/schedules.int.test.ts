import { randomUUID } from "node:crypto";
import { kmsEventSource, registerComplaint, SYSTEM_CONTEXT, withContext } from "@astax/db";
import { createLogger } from "@astax/shared/logging";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeRuiRegistry } from "@astax/adapters/rui-registry";
import type { KeycloakEvent } from "@astax/adapters/identity";
import {
  checkKeysIfDue,
  importLoginEventsIfDue,
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
    // 45 calendar days later, at the end of the Rome day (CET: 23:59:59.999 is 22:59:59.999Z).
    expect(complaint.dueAt.toISOString()).toBe("2026-11-27T22:59:59.999Z");
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

  it("phase 8 Keycloak's login events reach the audit log, once; our apps' logins and unknown users do not", async () => {
    const keycloakId = randomUUID();
    const user = userId("bo-supervisor");
    await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.user.update({ where: { id: user }, data: { keycloakId } }),
    );
    const t0 = new Date("2026-11-18T08:00:00.000Z").getTime();
    const events: KeycloakEvent[] = [
      {
        time: t0 + 1000,
        type: "LOGIN_ERROR",
        userId: keycloakId,
        clientId: "astax-admin",
        ipAddress: "203.0.113.7",
        error: "invalid_user_credentials",
      },
      {
        time: t0 + 2000,
        type: "LOGIN",
        userId: keycloakId,
        clientId: "astax-admin",
        ipAddress: "203.0.113.7",
      },
      {
        time: t0 + 3000,
        type: "LOGIN",
        userId: keycloakId,
        clientId: "account-console",
        ipAddress: "203.0.113.8",
      },
      {
        time: t0 + 4000,
        type: "LOGIN_ERROR",
        clientId: "astax-web-pro",
        ipAddress: "198.51.100.1",
        error: "user_not_found",
      },
    ];
    const identity = {
      listEvents: async (_types: string[], sinceMs: number) =>
        events.filter((e) => e.time > sinceMs),
    };
    const at = new Date("2026-11-18T09:00:00.000Z");
    expect(await importLoginEventsIfDue(h.db, identity, at)).toEqual({ imported: 2, anonymous: 1 });
    const rows = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.auditLog.findMany({
        where: { targetId: user, action: { in: ["LOGIN", "LOGIN_FAILED"] } },
        orderBy: { seq: "asc" },
      }),
    );
    expect(rows.map((r) => [r.action, r.ip])).toEqual([
      ["LOGIN_FAILED", "203.0.113.7"],
      ["LOGIN", "203.0.113.8"],
    ]);
    expect(rows[0]?.after).toMatchObject({ source: "keycloak", error: "invalid_user_credentials" });
    // The cursor: nothing twice.
    expect(await importLoginEventsIfDue(h.db, identity, at)).toEqual({ imported: 0, anonymous: 0 });
  });

  it("phase 8 BC-03 a simulated early decryption raises the alarm: audit, administrators, once", async () => {
    const auction = await withContext(h.db, SYSTEM_CONTEXT, async (tx) => {
      const request = await tx.quoteRequest.create({
        data: {
          code: `AX-K-${randomUUID().slice(0, 8)}`,
          channel: "BROKER",
          requesterUserId: userId("broker-owner"),
          ownerOrganizationId: orgId("broker-demo"),
        },
      });
      return tx.auction.create({
        data: {
          quoteRequestId: request.id,
          ownerOrganizationId: orgId("broker-demo"),
          kind: "MAIN",
          round: 1,
          openedAt: new Date("2031-05-05T08:00:00Z"),
          scheduledCloseAt: new Date("2031-05-05T12:00:00Z"),
          originalCloseAt: new Date("2031-05-05T12:00:00Z"),
          minGuaranteeDate: new Date("2031-06-01"),
          durationHours: 2,
          settingsSnapshot: {},
          publicKey: "x",
          wrappedPrivateKey: "x",
          kmsKeyRef: "astax-sealed-bids",
        },
      });
    });
    // The simulated anomaly: the key used two hours before the closing.
    await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.kmsEvent.create({
        data: {
          at: new Date("2031-05-05T10:00:00Z"),
          keyId: "astax-sealed-bids",
          operation: "DECRYPT",
          context: { purpose: "sealed-bid", auctionId: auction.id },
          ok: true,
          process: "worker",
        },
      }),
    );
    const notifier = new WorkerNotifier(h.email, createLogger({ name: "t", level: "silent" }), {
      clock: h.clock,
      cipher: h.cipher,
    });
    const deps = { db: h.db, cipher: h.cipher, notifier, adminUrl: "http://admin.test" };
    const sources = [{ name: "app-test", source: kmsEventSource(h.db), principals: ["worker"] }];
    const night = new Date("2031-05-06T02:00:00Z");
    const result = await checkKeysIfDue(deps, sources, night);
    expect(result.anomalies).toBeGreaterThanOrEqual(1);
    const logged = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.auditLog.findMany({ where: { action: "KMS_ANOMALY", targetId: auction.id } }),
    );
    expect(logged.map((l) => (l.after as { kind: string }).kind)).toEqual(["EARLY"]);
    const told = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.notification.count({
        where: { eventKey: "security.kms_anomaly.admin", userId: userId("admin") },
      }),
    );
    expect(told).toBeGreaterThanOrEqual(1);
    // The next night starts where this one stopped: the same event is not reported again.
    expect(await checkKeysIfDue(deps, sources, new Date("2031-05-07T02:00:00Z"))).toEqual({
      checked: 0,
      anomalies: 0,
    });
  });
});
