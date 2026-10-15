import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, userId, type Harness } from "./fixtures.js";

let h: Harness;

const deniedEntries = (user: string | null) =>
  withContext(h.db, SYSTEM_CONTEXT, (tx) =>
    tx.auditLog.findMany({
      where: { action: "ACCESS_DENIED", actorUserId: user },
      orderBy: { seq: "desc" },
    }),
  );

beforeAll(async () => {
  h = await startHarness();
});

afterAll(async () => {
  await h.close();
});

describe("SIC-01 authentication", () => {
  it("without a token: 401 problem+json", async () => {
    const response = await h.call("/me");
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(((await response.json()) as { code: string }).code).toBe("UNAUTHENTICATED");
  });

  it("a token signed by someone else, or expired, is refused", async () => {
    const forged = await h.token(
      { sub: "kc-private-giulia-neri", azp: "astax-web-private", roles: ["astax-private"] },
      true,
    );
    expect((await h.call("/me", { token: forged })).status).toBe(401);

    const token = await h.tokenFor("private-giulia-neri");
    h.clock.advanceMinutes(10);
    try {
      expect((await h.call("/me", { token })).status).toBe(401);
    } finally {
      h.clock.advanceMinutes(-10);
    }
  });

  it("SIC-05 a token from the wrong client for the user kind is refused and logged", async () => {
    // A private customer's token presented as if from the professional client.
    const token = await h.token({
      sub: "kc-private-giulia-neri",
      azp: "astax-web-pro",
      roles: ["astax-private"],
    });
    const response = await h.call("/me", { token });
    expect(response.status).toBe(403);
    const entry = (await deniedEntries(null)).find(
      (e) => (e.after as { reason?: string }).reason === "TOKEN_CLIENT_ROLE_MISMATCH",
    );
    expect(entry).toBeDefined();
  });

  it("a professional unknown to AstAx (no invitation) cannot get in", async () => {
    const token = await h.token({
      sub: "kc-stranger",
      azp: "astax-web-pro",
      roles: ["astax-professional"],
      email: "sconosciuto@example.test",
    });
    expect((await h.call("/me", { token, method: "GET" })).status).toBe(403);
  });

  it("a private customer is created at the first access (fase 1, passo 6)", async () => {
    const token = await h.token({
      sub: "kc-new-private",
      azp: "astax-web-private",
      roles: ["astax-private"],
      email: "nuovo.cliente@example.test",
      givenName: "Nuovo",
      familyName: "Cliente",
    });
    const response = await h.call("/me", { token });
    expect(response.status).toBe(200);
    const me = (await response.json()) as { kind: string; email: string; memberships: unknown[] };
    expect(me).toMatchObject({
      kind: "PRIVATE",
      email: "nuovo.cliente@example.test",
      memberships: [],
    });
    const provisioned = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.auditLog.findFirst({ where: { action: "USER_PROVISIONED" } }),
    );
    expect(provisioned).not.toBeNull();
  });
});

describe("LEG-01 LEG-02 legal documents gate", () => {
  it("blocks the platform until the texts in force are accepted, then records version, time and IP", async () => {
    const token = await h.tokenFor("agenzia-quattro-owner");
    const context = membershipId("agenzia-quattro-owner", "agenzia-quattro");

    const blocked = await h.call("/team", { token, context });
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { code: string }).code).toBe("LEGAL_ACCEPTANCE_REQUIRED");

    const pending = (await (await h.call("/legal/pending", { token })).json()) as {
      documentKey: string;
      versionId: string;
      contentMd: string;
    }[];
    expect(pending.map((p) => p.documentKey).sort()).toEqual([
      "agency-agreement",
      "cookie-policy",
      "data-processing-agreement",
      "terms-professional",
    ]);
    expect(pending.every((p) => p.contentMd.startsWith("[DA VALIDARE — LEGALE]"))).toBe(true);

    const accepted = await h.call("/legal/acceptances", {
      token,
      body: { versionIds: pending.map((p) => p.versionId) },
    });
    expect(accepted.status).toBe(201);
    expect((await h.call("/team", { token, context })).status).toBe(200);

    const rows = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.legalAcceptance.findMany({ where: { userId: userId("agenzia-quattro-owner") } }),
    );
    expect(rows).toHaveLength(4);
    expect(
      rows.every((r) => r.ip !== null && r.acceptedAt.toISOString() === "2026-11-16T09:00:00.000Z"),
    ).toBe(true);
  });

  it("a private customer accepts only what concerns privates", async () => {
    const token = await h.tokenFor("private-sara-conti");
    const pending = (await (await h.call("/legal/pending", { token })).json()) as {
      documentKey: string;
    }[];
    expect(pending.map((p) => p.documentKey).sort()).toEqual(["cookie-policy", "terms-private"]);
  });

  it("a new version must be accepted again (LEG-02)", async () => {
    await acceptAllLegal(h, "admin");
    await acceptAllLegal(h, "agenzia-cinque-owner");
    const admin = await h.tokenFor("admin");
    const adminContext = membershipId("admin", "astax");
    const created = await h.call("/admin/legal/documents/cookie-policy/versions", {
      token: admin,
      context: adminContext,
      body: { contentMd: "[DA VALIDARE — LEGALE]\n\n# Cookie policy\n\nVersione 2." },
    });
    expect(created.status).toBe(201);

    const owner = await h.tokenFor("agenzia-cinque-owner");
    const pending = (await (await h.call("/legal/pending", { token: owner })).json()) as {
      documentKey: string;
      versionNumber: number;
    }[];
    expect(pending).toEqual([
      expect.objectContaining({ documentKey: "cookie-policy", versionNumber: 2 }),
    ]);
  });

  it("LEG-03 a placeholder text cannot be marked as validated", async () => {
    await acceptAllLegal(h, "admin");
    const admin = await h.tokenFor("admin");
    const version = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.legalDocumentVersion.findFirstOrThrow({ where: { document: { key: "terms-private" } } }),
    );
    const response = await h.call(`/admin/legal/versions/${version.id}/validate`, {
      token: admin,
      context: membershipId("admin", "astax"),
      body: {},
    });
    expect(response.status).toBe(409);
  });
});

describe("SIC-02 active context (X-AstAx-Context)", () => {
  beforeAll(async () => {
    await acceptAllLegal(h, "marco-rossi");
    await acceptAllLegal(h, "agenzia-uno-owner");
  });

  it("a professional call without context is refused with 403 and logged", async () => {
    const token = await h.tokenFor("agenzia-uno-owner");
    const response = await h.call("/team", { token });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe("CONTEXT_REQUIRED");
    const entries = await deniedEntries(userId("agenzia-uno-owner"));
    expect(entries.some((e) => (e.after as { code: string }).code === "CONTEXT_REQUIRED")).toBe(
      true,
    );
  });

  it("the context of another user, or a malformed one, is refused", async () => {
    const token = await h.tokenFor("agenzia-uno-owner");
    for (const context of [membershipId("agenzia-due-owner", "agenzia-due"), "not-a-uuid"]) {
      const response = await h.call("/team", { token, context });
      expect(response.status).toBe(403);
      expect(((await response.json()) as { code: string }).code).toBe("CONTEXT_INVALID");
    }
  });

  it("Marco Rossi switches from Agenzia Uno to Agenzia Tre and sees only the active context", async () => {
    const token = await h.tokenFor("marco-rossi");
    const me = (await (await h.call("/me", { token })).json()) as {
      memberships: { organization: { name: string } }[];
    };
    expect(me.memberships.map((m) => m.organization.name)).toEqual(["Agenzia Uno", "Agenzia Tre"]);

    const inUno = await h.call("/context", {
      token,
      context: membershipId("marco-rossi", "agenzia-uno"),
    });
    expect(((await inUno.json()) as { organization: { name: string } }).organization.name).toBe(
      "Agenzia Uno",
    );
    const inTre = await h.call("/context", {
      token,
      context: membershipId("marco-rossi", "agenzia-tre"),
    });
    expect(((await inTre.json()) as { organization: { name: string } }).organization.name).toBe(
      "Agenzia Tre",
    );
  });

  it("an operator cannot manage the team: 403 FORBIDDEN, logged with the action", async () => {
    const token = await h.tokenFor("marco-rossi");
    const response = await h.call("/team", {
      token,
      context: membershipId("marco-rossi", "agenzia-uno"),
    });
    expect(response.status).toBe(403);
    const entries = await deniedEntries(userId("marco-rossi"));
    expect(entries[0]?.after).toMatchObject({ code: "FORBIDDEN", action: "team.manage" });
    expect(entries[0]?.actorOrganizationId).not.toBeNull();
  });

  it("a suspended membership stops working at the next call", async () => {
    await acceptAllLegal(h, "agenzia-uno-operator");
    const token = await h.tokenFor("agenzia-uno-operator");
    const context = membershipId("agenzia-uno-operator", "agenzia-uno");
    expect((await h.call("/context", { token, context })).status).toBe(200);
    await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.membership.update({ where: { id: context }, data: { status: "SUSPENDED" } }),
    );
    try {
      expect((await h.call("/context", { token, context })).status).toBe(403);
    } finally {
      await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
        tx.membership.update({ where: { id: context }, data: { status: "ACTIVE" } }),
      );
    }
  });
});
