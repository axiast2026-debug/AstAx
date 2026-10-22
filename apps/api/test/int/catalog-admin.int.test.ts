import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 7, spec 07 «Pacchetti e casi esclusi», «Elenchi e festività»: new
// versions with a reason, audited with before and after; the holidays of the
// next year proposed with Easter Monday and confirmed by the administrator.
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

interface PackageView {
  code: string;
  versions: {
    version: number;
    requirements: Record<string, unknown>;
    customerTextIt: string;
    inForce: boolean;
  }[];
}

describe("phase 7 packages", () => {
  it("a new version starts at its date; the wizard keeps the one in force until then", async () => {
    const list = await r.json<PackageView[]>(await r.call(admin, "/admin/packages"), 200);
    const base = list.find((p) => p.code === "BASE");
    const current = base?.versions.find((v) => v.inForce);
    expect(current).toBeDefined();

    const invalid = await r.call(admin, "/admin/packages/BASE/versions", {
      method: "POST",
      body: {
        requirements: { ...current?.requirements, glass: { required: "sì" } },
        customerTextIt: "Testo nuovo",
        validFrom: "2030-01-01T00:00:00.000Z",
        reason: "Prova",
      },
    });
    expect(invalid.status).toBe(400);
    const past = await r.call(admin, "/admin/packages/BASE/versions", {
      method: "POST",
      body: {
        requirements: current?.requirements,
        customerTextIt: "Testo nuovo",
        validFrom: "2026-01-02T00:00:00.000Z",
        reason: "Prova",
      },
    });
    expect(past.status).toBe(400);

    const created = await r.json<{ version: number }>(
      await r.call(admin, "/admin/packages/BASE/versions", {
        method: "POST",
        body: {
          requirements: current?.requirements,
          customerTextIt: "La responsabilità civile obbligatoria, spiegata meglio.",
          validFrom: "2030-01-01T00:00:00.000Z",
          reason: "Testo più chiaro",
        },
      }),
      201,
    );
    expect(created.version).toBe((current?.version ?? 0) + 1);
    const logged = await system((tx) =>
      tx.auditLog.findFirstOrThrow({
        where: { action: "PACKAGE_VERSION_CREATED", targetId: "BASE" },
      }),
    );
    expect(logged.reason).toBe("Testo più chiaro");
    const after = await r.json<PackageView[]>(await r.call(admin, "/admin/packages"), 200);
    expect(after.find((p) => p.code === "BASE")?.versions.find((v) => v.inForce)?.version).toBe(
      current?.version,
    );
  });
});

describe("phase 7 excluded cases", () => {
  it("every change is a new version with the reason", async () => {
    const rules = await r.json<
      {
        code: string;
        version: number;
        blockingInWizard: boolean;
        messageIt: string;
        active: boolean;
      }[]
    >(await r.call(admin, "/admin/exclusion-rules"), 200);
    const rule = rules.find((x) => x.active);
    expect(rule).toBeDefined();
    if (!rule) return;
    const saved = await r.json<{ version: number }>(
      await r.call(admin, `/admin/exclusion-rules/${rule.code}`, {
        method: "PUT",
        body: {
          blockingInWizard: rule.blockingInWizard,
          messageIt: `${rule.messageIt} (riletto)`,
          active: true,
          reason: "Testo riletto",
        },
      }),
      200,
    );
    expect(saved.version).toBe(rule.version + 1);
    const versions = await system((tx) =>
      tx.exclusionRuleVersion.findMany({ where: { code: rule.code }, orderBy: { version: "asc" } }),
    );
    expect(versions.map((v) => v.version)).toEqual(
      Array.from({ length: saved.version }, (_, i) => i + 1),
    );
    expect(versions.at(-1)).toMatchObject({ reason: "Testo riletto" });

    const duplicate = await r.call(admin, "/admin/exclusion-rules", {
      method: "POST",
      body: {
        code: rule.code,
        blockingInWizard: false,
        messageIt: "x",
        active: true,
        reason: "Prova",
      },
    });
    expect(duplicate.status).toBe(409);
  });
});

describe("phase 7 lists", () => {
  it("edits a label, with before and after", async () => {
    const lists = await r.json<
      Record<string, { code: string; labelIt: string; active: boolean; sortOrder: number }[]>
    >(await r.call(admin, "/admin/lists"), 200);
    const value = lists.fuel?.[0];
    expect(value).toBeDefined();
    if (!value) return;
    const path = `/admin/lists/fuel/${value.code}`;
    await r.json(
      await r.call(admin, path, {
        method: "PUT",
        body: { ...value, code: undefined, labelIt: `${value.labelIt}!`, reason: "Correzione" },
      }),
      200,
    );
    const logged = await system((tx) =>
      tx.auditLog.findFirstOrThrow({
        where: { action: "LIST_VALUE_SAVED", targetId: `fuel.${value.code}` },
      }),
    );
    expect(logged).toMatchObject({
      before: { labelIt: value.labelIt },
      after: { labelIt: `${value.labelIt}!` },
    });
    await r.json(
      await r.call(admin, path, {
        method: "PUT",
        body: { ...value, code: undefined, reason: "Ripristino" },
      }),
      200,
    );
    const unknownList = await r.call(admin, "/admin/lists/nothing", {
      method: "POST",
      body: { code: "X", labelIt: "x", active: true, sortOrder: 1, reason: "Prova" },
    });
    expect(unknownList.status).toBe(404);
  });
});

describe("phase 7 holidays (ASTA-02)", () => {
  it("proposes the next year with Easter Monday and adds it when confirmed", async () => {
    const proposal = await r.json<{
      holidays: unknown[];
      missing: { date: string; name: string }[];
    }>(await r.call(admin, "/admin/holidays?year=2029"), 200);
    expect(proposal.holidays).toEqual([]);
    expect(proposal.missing).toContainEqual(
      expect.objectContaining({ date: "2029-04-02", name: "Lunedì dell'Angelo" }),
    );
    expect(proposal.missing).toContainEqual(expect.objectContaining({ date: "2029-12-25" }));
    const confirmed = await r.json<{ added: number }>(
      await r.call(admin, "/admin/holidays/confirm-year", {
        method: "POST",
        body: { year: 2029, reason: "Calendario 2029" },
      }),
      200,
    );
    expect(confirmed.added).toBe(proposal.missing.length);
    const after = await r.json<{ holidays: unknown[]; missing: unknown[] }>(
      await r.call(admin, "/admin/holidays?year=2029"),
      200,
    );
    expect(after.holidays).toHaveLength(proposal.missing.length);
    expect(after.missing).toEqual([]);
  });

  it("adds and removes a single holiday, with the reason", async () => {
    const added = await r.json<{ id: string }>(
      await r.call(admin, "/admin/holidays", {
        method: "POST",
        body: { date: "2099-06-29", name: "Santi Pietro e Paolo", reason: "Prova" },
      }),
      201,
    );
    const again = await r.call(admin, "/admin/holidays", {
      method: "POST",
      body: { date: "2099-06-29", name: "Doppio", reason: "Prova" },
    });
    expect(again.status).toBe(409);
    await r.json(
      await r.call(admin, `/admin/holidays/${added.id}/remove`, {
        method: "POST",
        body: { reason: "Inserita per errore" },
      }),
      200,
    );
    const logged = await system((tx) =>
      tx.auditLog.findFirstOrThrow({ where: { action: "HOLIDAY_REMOVED", targetId: added.id } }),
    );
    expect(logged.reason).toBe("Inserita per errore");
  });
});
