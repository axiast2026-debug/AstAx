import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acceptAllLegal,
  membershipId,
  orgId,
  startHarness,
  type Harness,
  type UserKey,
} from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Audit of 2026-10-30 (A3): the owner's «Impostazioni» (spec 02 and 04, docs/permessi.md).
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let owner: Who;

const who = async (key: UserKey, org: string): Promise<Who> => ({
  token: await h.tokenFor(key),
  context: membershipId(key, org),
});
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  for (const key of ["agenzia-sette-owner", "agenzia-dieci-operator"] as const) {
    await acceptAllLegal(h, key);
  }
  owner = await who("agenzia-sette-owner", "agenzia-sette");
});

afterAll(async () => {
  await h.close();
});

describe("audit 2026-10-30 A3: the owner's settings", () => {
  it("the owner sees the data, the mandates and the IBAN masked; an operator gets 403", async () => {
    const s = await r.json<{
      type: string;
      legalName: string;
      iban: string | null;
      mandates: { company: string }[];
    }>(await r.call(owner, "/organization/settings"), 200);
    expect(s.type).toBe("AGENCY");
    expect(s.legalName).toBe("Agenzia Sette");
    expect(s.mandates.length).toBeGreaterThan(0);
    if (s.iban) expect(s.iban).toMatch(/^[A-Z]{2}\d{2} •••• \d{4}$/);
    const operator = await who("agenzia-dieci-operator", "agenzia-dieci");
    expect((await r.call(operator, "/organization/settings")).status).toBe(403);
  });

  it("PEC and registered office change, with the province from the municipality", async () => {
    const s = await r.json<{ pec: string; address: { municipality: string; province: string } }>(
      await r.call(owner, "/organization/settings", {
        method: "PUT",
        body: {
          pec: "nuova.pec@pec.example.test",
          address: { street: "Via Nuova 1", postalCode: "00184", municipalityIstat: "058091" },
        },
      }),
      200,
    );
    expect(s.pec).toBe("nuova.pec@pec.example.test");
    expect(s.address).toMatchObject({ municipality: "Roma", province: "RM" });
    const unknown = await r.call(owner, "/organization/settings", {
      method: "PUT",
      body: { address: { street: "Via X 1", postalCode: "00100", municipalityIstat: "999999" } },
    });
    expect(unknown.status).toBe(400);
  });

  it("the IBAN changes only with the code sent to the owner's phone, and is logged", async () => {
    // An owner with no phone on the account: it is asked, and the code goes there.
    await system(async (tx) => {
      const m = await tx.membership.findUniqueOrThrow({
        where: { id: membershipId("agenzia-sette-owner", "agenzia-sette") },
      });
      await tx.user.update({
        where: { id: m.userId },
        data: { phoneEnc: null, phoneHash: null },
      });
    });
    expect((await r.call(owner, "/organization/iban/code", { body: {} })).status).toBe(400);
    expect(
      (await r.call(owner, "/organization/iban/code", { body: { phone: "+39 333 111 2233" } }))
        .status,
    ).toBe(204);
    const sms = [...h.email.sent].reverse().find((m) => m.to.startsWith("393331112233"));
    const code = /\b(\d{6})\b/.exec(sms?.text ?? "")?.[1] ?? "";
    const wrong = await r.call(owner, "/organization/iban", {
      body: { iban: "IT60X0542811101000000123456", code: "000000" },
    });
    expect(wrong.status).toBe(400);
    const changed = await r.json<{ iban: string }>(
      await r.call(owner, "/organization/iban", {
        body: { iban: "IT60 X054 2811 1010 0000 0123 456", code },
      }),
      200,
    );
    expect(changed.iban).toBe("IT60 •••• 3456");
    const logged = await system((tx) =>
      tx.auditLog.findMany({
        where: { action: "ORGANIZATION_IBAN_SET", targetId: orgId("agenzia-sette") },
      }),
    );
    expect(logged.length).toBeGreaterThan(0);
    expect(JSON.stringify(logged.map((l) => l.after))).not.toContain("IT60");
  });

  it("a change of mandates is a request to the back office: a note, the supervisors told", async () => {
    await r.json(
      await r.call(owner, "/organization/mandates/request", {
        body: { text: "Aggiungere il mandato di Compagnia Gamma" },
      }),
      201,
    );
    const note = await system((tx) =>
      tx.organizationNote.findFirst({
        where: { organizationId: orgId("agenzia-sette"), text: { contains: "Compagnia Gamma" } },
      }),
    );
    expect(note).not.toBeNull();
    const told = await system((tx) =>
      tx.notification.count({ where: { eventKey: "organization.mandates_requested.bo" } }),
    );
    expect(told).toBeGreaterThan(0);
  });
});
