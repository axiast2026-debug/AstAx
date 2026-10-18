import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { romeCalendarDate } from "@astax/shared/format";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 7, spec 07: the administrator's dashboard with the filters, the
// state of the integrations, and the exports, each one in the audit log
// («Le esportazioni del registro attività sono a loro volta registrate»).
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let admin: Who;
let today = "";
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  await acceptAllLegal(h, "admin");
  admin = { token: await h.tokenFor("admin"), context: membershipId("admin", "astax") };
  today = romeCalendarDate(h.clock.now());
});

afterAll(async () => {
  await h.close();
});

describe("phase 7 administrator reports", () => {
  it("the dashboard counts the period, also by channel", async () => {
    await acceptAllLegal(h, "private-elena-sala");
    await r.submittedPrivateRequest(
      { token: await h.tokenFor("private-elena-sala") },
      "elena.sala@example.test",
    );
    const all = await r.json<{
      volumes: { created: number; submitted: number };
      economy: object;
      risk: object;
    }>(await r.call(admin, `/admin/dashboard?from=${today}&to=${today}`), 200);
    expect(all.volumes.created).toBeGreaterThanOrEqual(1);
    expect(all.volumes.submitted).toBeGreaterThanOrEqual(1);
    expect(all).toHaveProperty("economy.privateFeesCents");
    expect(all).toHaveProperty("risk.activeSuspensions");
    const brokers = await r.json<{ volumes: { submitted: number } }>(
      await r.call(admin, `/admin/dashboard?from=${today}&to=${today}&channel=BROKER`),
      200,
    );
    expect(brokers.volumes.submitted).toBeLessThan(all.volumes.submitted);
  });

  it("lists every integration with its adapter", async () => {
    const list = await r.json<{ key: string; adapter: string }[]>(
      await r.call(admin, "/admin/integrations"),
      200,
    );
    expect(list.map((i) => i.key)).toEqual(
      expect.arrayContaining([
        "vehicleData",
        "payments",
        "signature",
        "eInvoicing",
        "rui",
        "whatsapp",
      ]),
    );
    expect(list.find((i) => i.key === "whatsapp")?.adapter).toBe("OFF");
  });

  it("exporting the audit log is itself recorded, and so is every report", async () => {
    const file = await r.call(admin, `/admin/audit/export?from=${today}&to=${today}`);
    expect(file.status).toBe(200);
    expect((await file.text()).split("\r\n")[0]).toBe(
      "seq;at;action;actor_user;actor_membership;actor_organization;target_type;target_id;reason;hash",
    );
    const exported = await system((tx) =>
      tx.auditLog.findFirst({ where: { action: "AUDIT_LOG_EXPORTED" }, orderBy: { seq: "desc" } }),
    );
    expect(exported?.after).toMatchObject({ from: today, to: today });

    const requests = await r.call(admin, `/admin/reports/requests?from=${today}&to=${today}`);
    expect(requests.status).toBe(200);
    expect((await requests.text()).startsWith("codice;canale;stato")).toBe(true);
    const accounting = await r.call(admin, `/admin/reports/accounting?from=${today}&to=${today}`);
    expect(accounting.status).toBe(200);
    const reports = await system((tx) =>
      tx.auditLog.findMany({
        where: { action: "REPORT_EXPORTED" },
        orderBy: { seq: "desc" },
        take: 2,
      }),
    );
    expect(reports.map((x) => (x.after as { report: string }).report).sort()).toEqual([
      "accounting",
      "requests",
    ]);
  });

  it("the back office supervisor reads the log but not the administrator's reports", async () => {
    await acceptAllLegal(h, "bo-supervisor");
    const supervisor: Who = {
      token: await h.tokenFor("bo-supervisor"),
      context: membershipId("bo-supervisor", "astax"),
    };
    expect((await r.call(supervisor, `/admin/dashboard?from=${today}&to=${today}`)).status).toBe(
      403,
    );
    expect((await r.call(supervisor, `/admin/audit/export?from=${today}&to=${today}`)).status).toBe(
      200,
    );
  });
});
