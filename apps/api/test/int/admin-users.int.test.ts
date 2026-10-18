import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, userId, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 7, spec 07 «Utenti e permessi» and «Contratti e documenti legali»:
// block and unblock, second factor reset, back office roles, every action with
// a reason in the audit log; legal versions as drafts, published apart.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let admin: Who;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  await acceptAllLegal(h, "admin");
  admin = { token: await h.tokenFor("admin"), context: membershipId("admin", "astax") };
});

afterAll(async () => {
  await h.close();
});

interface ListedUser {
  id: string;
  name: string;
  kind: string;
  status: string;
  memberships: { role: string; type: string }[];
}

describe("phase 7 users and permissions", () => {
  it("finds users by name and records the search", async () => {
    const list = await r.json<ListedUser[]>(await r.call(admin, "/admin/users?q=sala"), 200);
    expect(list.map((u) => u.id)).toContain(userId("private-elena-sala"));
    const logged = await system((tx) =>
      tx.auditLog.findFirst({ where: { action: "USERS_VIEWED" }, orderBy: { seq: "desc" } }),
    );
    expect(logged).not.toBeNull();
  });

  it("a blocked user is refused at once, and can be unblocked", async () => {
    await acceptAllLegal(h, "private-elena-sala");
    const id = userId("private-elena-sala");
    const before = await h.tokenFor("private-elena-sala");
    expect((await h.call("/legal/pending", { token: before })).status).toBe(200);

    expect(
      (await r.call(admin, `/admin/users/${id}/block`, { method: "POST", body: {} })).status,
    ).toBe(400);
    const blocked = await r.json<{ status: string }>(
      await r.call(admin, `/admin/users/${id}/block`, {
        method: "POST",
        body: { reason: "Segnalazione di frode" },
      }),
      200,
    );
    expect(blocked.status).toBe("BLOCKED");
    expect((await h.call("/legal/pending", { token: before })).status).toBe(403);
    const keycloak = h.identity.calls.filter(
      (c) => c.method === "setEnabled" || c.method === "logoutUser",
    );
    expect(keycloak.map((c) => c.method)).toEqual(
      expect.arrayContaining(["setEnabled", "logoutUser"]),
    );
    const logged = await system((tx) =>
      tx.auditLog.findFirstOrThrow({ where: { action: "USER_BLOCKED", targetId: id } }),
    );
    expect(logged).toMatchObject({
      reason: "Segnalazione di frode",
      before: { status: "ACTIVE" },
      after: { status: "BLOCKED" },
    });

    await r.json(
      await r.call(admin, `/admin/users/${id}/unblock`, {
        method: "POST",
        body: { reason: "Verifica conclusa" },
      }),
      200,
    );
    const after = await h.tokenFor("private-elena-sala");
    expect((await h.call("/legal/pending", { token: after })).status).toBe(200);
  });

  it("nobody blocks oneself", async () => {
    const res = await r.call(admin, `/admin/users/${userId("admin")}/block`, {
      method: "POST",
      body: { reason: "Prova" },
    });
    expect(res.status).toBe(409);
  });

  it("resets the second factor of a professional, not of a private (SIC-05)", async () => {
    const pro = await r.call(
      admin,
      `/admin/users/${userId("agenzia-sei-owner")}/reset-second-factor`,
      {
        method: "POST",
        body: { reason: "Telefono perso" },
      },
    );
    expect(pro.status).toBe(200);
    expect(
      h.identity.calls.some((c) => c.method === "removeCredentials" && c.args[1] === "otp"),
    ).toBe(true);
    const priv = await r.call(
      admin,
      `/admin/users/${userId("private-elena-sala")}/reset-second-factor`,
      { method: "POST", body: { reason: "Prova" } },
    );
    expect(priv.status).toBe(409);
  });

  it("changes a back office role, with before and after in the audit log", async () => {
    const id = userId("bo-support");
    const set = await r.json<{ role: string }>(
      await r.call(admin, `/admin/users/${id}/staff-role`, {
        method: "PUT",
        body: { role: "BO_ACCOUNTING", reason: "Passa alla contabilità" },
      }),
      200,
    );
    expect(set.role).toBe("BO_ACCOUNTING");
    const logged = await system((tx) =>
      tx.auditLog.findFirstOrThrow({ where: { action: "STAFF_ROLE_SET", targetId: id } }),
    );
    expect(logged).toMatchObject({
      before: { role: "BO_SUPPORT", status: "ACTIVE" },
      after: { role: "BO_ACCOUNTING" },
    });
    // Only AstAx staff get a back office role.
    const notStaff = await r.call(admin, `/admin/users/${userId("broker-owner")}/staff-role`, {
      method: "PUT",
      body: { role: "BO_VERIFIER", reason: "Prova" },
    });
    expect(notStaff.status).toBe(409);
    await r.json(
      await r.call(admin, `/admin/users/${id}/staff-role`, {
        method: "PUT",
        body: { role: "BO_SUPPORT", reason: "Torna al supporto" },
      }),
      200,
    );
  });

  it("a back office user cannot manage users", async () => {
    await acceptAllLegal(h, "bo-supervisor");
    const supervisor: Who = {
      token: await h.tokenFor("bo-supervisor"),
      context: membershipId("bo-supervisor", "astax"),
    };
    expect((await r.call(supervisor, "/admin/users")).status).toBe(403);
  });
});

describe("phase 7 legal documents (LEG-02)", () => {
  it("a draft is not in force; once published everyone concerned accepts it again", async () => {
    await acceptAllLegal(h, "agenzia-cinque-owner");
    const created = await r.json<{ id: string; number: number }>(
      await r.call(admin, "/admin/legal/documents/agency-agreement/versions", {
        method: "POST",
        body: {
          contentMd: "[DA VALIDARE — LEGALE]\n\n# Cookie policy\n\nVersione nuova.",
          reason: "Nuova clausola sui rimborsi",
        },
      }),
      201,
    );
    const owner = await h.tokenFor("agenzia-cinque-owner");
    const pendingOf = async () =>
      (await (await h.call("/legal/pending", { token: owner })).json()) as {
        documentKey: string;
        versionNumber: number;
      }[];
    expect(await pendingOf()).toEqual([]);

    const documents = await r.json<
      { key: string; versions: { id: string; publishedAt: string | null }[] }[]
    >(await r.call(admin, "/admin/legal/documents"), 200);
    const agreement = documents.find((d) => d.key === "agency-agreement");
    expect(agreement?.versions[0]).toMatchObject({ id: created.id, publishedAt: null });

    const sentBefore = h.email.sent.length;
    const published = await r.json<{ recipients: number }>(
      await r.call(admin, `/admin/legal/versions/${created.id}/publish`, {
        method: "POST",
        body: { reason: "In vigore da oggi", summary: "Rimborsi entro dieci giorni." },
      }),
      200,
    );
    expect(published.recipients).toBeGreaterThan(0);
    expect(await pendingOf()).toEqual([
      expect.objectContaining({ documentKey: "agency-agreement", versionNumber: created.number }),
    ]);
    const mails = h.email.sent.slice(sentBefore);
    expect(mails.length).toBeGreaterThan(0);
    expect(mails[0]?.subject).toContain("Accordo di collaborazione");
    expect(mails[0]?.text).toContain("Rimborsi entro dieci giorni.");

    // Published once only.
    const again = await r.call(admin, `/admin/legal/versions/${created.id}/publish`, {
      method: "POST",
      body: { reason: "Di nuovo", summary: "Di nuovo." },
    });
    expect(again.status).toBe(409);
    const logged = await system((tx) =>
      tx.auditLog.findFirstOrThrow({
        where: { action: "LEGAL_VERSION_PUBLISHED", targetId: created.id },
      }),
    );
    expect(logged.reason).toBe("In vigore da oggi");
  });
});
