import type { KeycloakSession } from "@astax/adapters/identity";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";

let h: Harness;
let admin: string;
const adminContext = () => membershipId("admin", "astax");

beforeAll(async () => {
  h = await startHarness();
  await acceptAllLegal(h, "admin");
  await acceptAllLegal(h, "bo-support");
  admin = await h.tokenFor("admin");
});

afterAll(async () => {
  await h.close();
});

describe("fase 1 passo 10: parameters with history", () => {
  it("a change creates a new version with author and reason; reading at a date gives the right one", async () => {
    const changed = await h.call("/admin/settings/invitations.max", {
      token: admin,
      context: adminContext(),
      method: "PUT",
      body: { value: 6, reason: "Pilota con poche agenzie" },
    });
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({ key: "invitations.max", version: 2, value: 6 });

    const history = (await (
      await h.call("/admin/settings/invitations.max/history", {
        token: admin,
        context: adminContext(),
      })
    ).json()) as {
      version: number;
      value: number;
      reason: string | null;
      changedBy: string | null;
    }[];
    expect(history.map((v) => [v.version, v.value])).toEqual([
      [1, 8],
      [2, 6],
    ]);
    expect(history[1]?.reason).toBe("Pilota con poche agenzie");
    expect(history[1]?.changedBy).not.toBeNull();

    const before = (await (
      await h.call(`/admin/settings?at=${encodeURIComponent("2026-11-16T08:59:59.000Z")}`, {
        token: admin,
        context: adminContext(),
      })
    ).json()) as { key: string; value: unknown }[];
    expect(before.find((s) => s.key === "invitations.max")?.value).toBe(8);
    const now = (await (
      await h.call("/admin/settings", { token: admin, context: adminContext() })
    ).json()) as {
      key: string;
      value: unknown;
    }[];
    expect(now.find((s) => s.key === "invitations.max")?.value).toBe(6);

    const audit = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.auditLog.findFirst({ where: { action: "SETTING_CHANGED", targetId: "invitations.max" } }),
    );
    expect(audit?.before).toEqual({ version: 1, value: 8 });
    expect(audit?.after).toMatchObject({ version: 2, value: 6 });
    expect(audit?.reason).toBe("Pilota con poche agenzie");
  });

  it("refuses a change without reason and a decimal amount (FEE-07)", async () => {
    const noReason = await h.call("/admin/settings/fees.agency.amountCents", {
      token: admin,
      context: adminContext(),
      method: "PUT",
      body: { value: 1800 },
    });
    expect(noReason.status).toBe(400);
    const decimal = await h.call("/admin/settings/fees.agency.amountCents", {
      token: admin,
      context: adminContext(),
      method: "PUT",
      body: { value: 15.5, reason: "prova" },
    });
    expect(decimal.status).toBe(400);
  });

  it("refuses a change in the past: the history is evidence (ASTA-09)", async () => {
    const response = await h.call("/admin/settings/invitations.topUp.extra", {
      token: admin,
      context: adminContext(),
      method: "PUT",
      body: { value: 3, reason: "prova", validFrom: "2026-11-15T09:00:00.000Z" },
    });
    expect(response.status).toBe(400);
  });

  it("refuses a future date for session and OTP parameters, applied to Keycloak when saved", async () => {
    const response = await h.call("/admin/settings/session.privateDays", {
      token: admin,
      context: adminContext(),
      method: "PUT",
      body: { value: 20, reason: "prova", validFrom: "2026-12-01T00:00:00.000Z" },
    });
    expect(response.status).toBe(400);
  });

  it("refuses a value that breaks a rule tying parameters together", async () => {
    // The default duration must be one of the durations offered (ASTA-03).
    const response = await h.call("/admin/settings/auction.defaultDurationWorkingHours", {
      token: admin,
      context: adminContext(),
      method: "PUT",
      body: { value: 3, reason: "prova" },
    });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("auction.durationsWorkingHours");
  });

  it("SIC-05 a session parameter is applied to Keycloak at once", async () => {
    const response = await h.call("/admin/settings/session.staffIdleHours", {
      token: admin,
      context: adminContext(),
      method: "PUT",
      body: { value: 2, reason: "Turni lunghi del back office" },
    });
    expect(response.status).toBe(200);
    const call = h.identity.calls
      .filter((c) => c.method === "updateClientAttributes")
      .find((c) => c.args[0] === "astax-admin");
    expect(call?.args[1]).toEqual({ "client.session.idle.timeout": "7200" });
  });

  it("only the administrator changes parameters", async () => {
    const support = await h.tokenFor("bo-support");
    const response = await h.call("/admin/settings/invitations.max", {
      token: support,
      context: membershipId("bo-support", "astax"),
      method: "PUT",
      body: { value: 5, reason: "tentativo" },
    });
    expect(response.status).toBe(403);
  });
});

describe("profile sessions (spec 01, «Accesso e sicurezza»)", () => {
  it("lists and revokes only one's own sessions", async () => {
    const session = (id: string): KeycloakSession => ({
      id,
      ipAddress: "203.0.113.5",
      start: 0,
      lastAccess: 0,
      clients: { a: "astax-admin" },
    });
    h.identity.sessions.set("kc-admin", [session("s-admin")]);
    h.identity.sessions.set("kc-bo-support", [session("s-support")]);
    const list = (await (await h.call("/me/sessions", { token: admin })).json()) as {
      id: string;
    }[];
    expect(list.map((s) => s.id)).toEqual(["s-admin"]);
    expect(
      (await h.call("/me/sessions/s-support", { token: admin, method: "DELETE" })).status,
    ).toBe(404);
    expect((await h.call("/me/sessions/s-admin", { token: admin, method: "DELETE" })).status).toBe(
      204,
    );
    expect(h.identity.sessions.get("kc-bo-support")).toHaveLength(1);
  });
});

describe("rule 4: accesses and reads of the log are recorded", () => {
  it("a login is written with the browser's address passed on by the web app", async () => {
    const response = await fetch(`${h.baseUrl}/me/logins`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${admin}`,
        "x-forwarded-for": "198.51.100.23",
        "user-agent": "Browser di prova",
      },
    });
    expect(response.status).toBe(204);
    const entry = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.auditLog.findFirstOrThrow({ where: { action: "LOGIN" }, orderBy: { seq: "desc" } }),
    );
    expect(entry).toMatchObject({ ip: "198.51.100.23", userAgent: "Browser di prova" });
  });

  it("reading the whole audit log is itself recorded", async () => {
    await h.call("/admin/audit?limit=5", { token: admin, context: adminContext() });
    const entry = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.auditLog.findFirst({ where: { action: "AUDIT_LOG_READ" }, orderBy: { seq: "desc" } }),
    );
    expect(entry?.after).toMatchObject({ limit: 5 });
  });
});

describe("audit log page (fase 1, passo 12)", () => {
  it("the administrator reads the latest entries, including the denials", async () => {
    const support = await h.tokenFor("bo-support");
    await h.call("/admin/settings", {
      token: support,
      context: membershipId("bo-support", "astax"),
    });
    const page = (await (
      await h.call("/admin/audit?limit=20", { token: admin, context: adminContext() })
    ).json()) as {
      entries: { action: string }[];
    };
    expect(page.entries.map((e) => e.action)).toContain("ACCESS_DENIED");
    expect(page.entries.map((e) => e.action)).toContain("SETTING_CHANGED");
  });
});
