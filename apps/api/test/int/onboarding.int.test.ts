import { FakeRuiRegistry } from "@astax/adapters/rui-registry";
import { importRuiRecords, SYSTEM_CONTEXT, withContext } from "@astax/db";
import { buildSyntheticIban, buildVatNumber } from "@astax/shared/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 7: an agency enters from the site (company data, RUI, mandates,
// professional liability, IBAN confirmed by SMS, contracts), the back office
// supervisor approves it after the RUI check, the owner receives the
// invitation and finds the agency active with its mandates.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let supervisor: Who;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);
const PDF = new TextEncoder().encode("%PDF-1.4\n% polizza RC professionale di prova\n");
const OWNER_EMAIL = "giorgia.undici@agenzia-undici.test";
const OWNER_PHONE = "+393330001101";

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  await system((tx) =>
    (async () => {
      const records = await new FakeRuiRegistry().downloadLatest();
      return importRuiRecords(tx, "2026-01-01", records, h.clock.now());
    })(),
  );
  await acceptAllLegal(h, "bo-supervisor");
  supervisor = {
    token: await h.tokenFor("bo-supervisor"),
    context: membershipId("bo-supervisor", "astax"),
  };
});

afterAll(async () => {
  await h.close();
});

interface Options {
  companies: { id: string; name: string }[];
  documents: { key: string; versionId: string }[];
}

async function applicationFor(ruiNumber: string, legalName: string, email = OWNER_EMAIL) {
  const options = (await (await h.call("/onboarding/options?type=AGENCY")).json()) as Options;
  const alfa = options.companies.find((c) => c.name === "Compagnia Alfa");
  const gamma = options.companies.find((c) => c.name === "Compagnia Gamma");
  const delta = options.companies.find((c) => c.name === "Compagnia Delta");
  const body = {
    type: "AGENCY",
    legalName,
    vatNumber: buildVatNumber(Number(ruiNumber.slice(-4)), 1),
    fiscalCode: null,
    ruiNumber,
    pec: "agenzia@pec.test",
    address: {
      street: "Via Prova 11",
      postalCode: "00184",
      municipalityIstat: "058091",
      province: "RM",
    },
    iban: buildSyntheticIban(Number(ruiNumber.slice(-4))),
    owner: { firstName: "Giorgia", lastName: "Undici", email, phone: OWNER_PHONE },
    companyIds: [alfa?.id, gamma?.id, delta?.id],
  };
  const started = await r.json<{ token: string }>(await h.call("/onboarding", { body }), 201);
  return { token: started.token, options, body };
}

function lastSmsCode(): string {
  const message = [...h.email.sent].reverse().find((m) => m.to.startsWith(OWNER_PHONE.slice(1)));
  const code = /\b(\d{6})\b/.exec(message?.text ?? "")?.[1];
  if (!code) throw new Error("no SMS code");
  return code;
}

async function complete(token: string, options: Options) {
  expect((await h.call(`/onboarding/${token}/iban-code`, { body: {} })).status).toBe(204);
  const wrong = await h.call(`/onboarding/${token}/iban-confirm`, { body: { code: "000000" } });
  expect(wrong.status).toBe(400);
  await r.json(
    await h.call(`/onboarding/${token}/iban-confirm`, { body: { code: lastSmsCode() } }),
    200,
  );
  const upload = await fetch(
    `${h.baseUrl}/onboarding/${token}/prof-insurance?expiresOn=2030-12-31`,
    {
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: PDF,
    },
  );
  expect(upload.status).toBe(200);
  return options.documents.map((d) => d.versionId);
}

describe("phase 7 entry of a new agency", () => {
  it("is refused while incomplete, then checked on the RUI, approved and invited", async () => {
    const { token, options } = await applicationFor("A000000101", "Agenzia Undici");
    expect(options.documents.map((d) => d.key).sort()).toEqual([
      "agency-agreement",
      "data-processing-agreement",
      "terms-professional",
    ]);
    const early = await r.json<{ errors: { issue: string }[] }>(
      await h.call(`/onboarding/${token}/submit`, {
        body: { versionIds: options.documents.map((d) => d.versionId) },
      }),
      400,
    );
    expect(early.errors.map((e) => e.issue)).toEqual(
      expect.arrayContaining(["IBAN_NOT_CONFIRMED", "MISSING"]),
    );

    const versionIds = await complete(token, options);
    const view = await r.json<{ iban: string; ibanConfirmed: boolean }>(
      await h.call(`/onboarding/${token}`),
      200,
    );
    expect(view.ibanConfirmed).toBe(true);
    expect(view.iban).toMatch(/^IT\d\d •••• \d{4}$/);

    const notified = h.email.sent.length;
    await r.json(await h.call(`/onboarding/${token}/submit`, { body: { versionIds } }), 200);
    // The supervisors are told, with no personal data in the message (rule 8).
    expect(h.email.sent.slice(notified).some((m) => m.subject.includes("Agenzia Undici"))).toBe(
      true,
    );

    const queue = await r.json<{ id: string; legalName: string; ruiFound: boolean }[]>(
      await r.call(supervisor, "/bo/onboarding"),
      200,
    );
    const entry = queue.find((q) => q.legalName === "Agenzia Undici");
    expect(entry?.ruiFound).toBe(true);
    const detail = await r.json<{
      ruiCheck: { sectionMatches: boolean; nameMatches: boolean; unconfirmedCompanies: string[] };
      contracts: unknown[];
    }>(await r.call(supervisor, `/bo/onboarding/${entry?.id}`), 200);
    expect(detail.ruiCheck).toMatchObject({ sectionMatches: true, nameMatches: true });
    // Delta is declared but not on the RUI: the supervisor sees it.
    expect(detail.ruiCheck.unconfirmedCompanies).toEqual(["Compagnia Delta"]);
    expect(detail.contracts).toHaveLength(3);
    const viewed = await system((tx) =>
      tx.auditLog.findFirst({ where: { action: "ONBOARDING_VIEWED", targetId: entry?.id } }),
    );
    expect(viewed).not.toBeNull();

    const approved = await r.json<{ organizationId: string }>(
      await r.call(supervisor, `/bo/onboarding/${entry?.id}/approve`, {
        body: { reason: "RUI e documenti in ordine" },
      }),
      200,
    );
    const organization = await system((tx) =>
      tx.organization.findUniqueOrThrow({
        where: { id: approved.organizationId },
        include: { teamInvites: true },
      }),
    );
    expect(organization).toMatchObject({
      status: "ACTIVE",
      ruiSection: "A",
      ruiNumber: "A000000101",
    });
    const mandates = await system((tx) =>
      tx.agencyMandate.findMany({
        where: { organizationId: approved.organizationId },
        include: { company: true },
      }),
    );
    expect(Object.fromEntries(mandates.map((m) => [m.company.name, m.source]))).toEqual({
      "Compagnia Alfa": "RUI",
      "Compagnia Gamma": "RUI",
      "Compagnia Delta": "MANUAL",
    });
    // The first invitation: the Keycloak account and the welcome email.
    expect(h.identity.calls.some((c) => c.method === "createUser")).toBe(true);
    expect(h.email.sent.some((m) => m.to === OWNER_EMAIL && m.subject.includes("attiva"))).toBe(
      true,
    );

    // At the first access the owner finds the agency, the contracts already accepted.
    const owner = await h.token({
      sub: h.identity.users.get(OWNER_EMAIL) ?? "",
      azp: "astax-web-pro",
      roles: ["astax-professional"],
      email: OWNER_EMAIL,
      givenName: "Giorgia",
      familyName: "Undici",
    });
    const me = (await (await h.call("/me", { token: owner })).json()) as {
      memberships: { role: string; organization: { name: string } }[];
    };
    expect(me.memberships).toEqual([
      expect.objectContaining({
        role: "OWNER",
        organization: expect.objectContaining({ name: "Agenzia Undici" }),
      }),
    ]);
    const pending = (await (await h.call("/legal/pending", { token: owner })).json()) as {
      documentKey: string;
    }[];
    expect(pending.map((p) => p.documentKey)).not.toContain("agency-agreement");
  });

  it("a rejection reaches the applicant with the link; the entry is corrected and sent again", async () => {
    const email = "dodici@agenzia-dodici.test";
    const { token, options, body } = await applicationFor(
      "A000000102",
      "Agenzia Dodicesima",
      email,
    );
    const versionIds = await complete(token, options);
    await r.json(await h.call(`/onboarding/${token}/submit`, { body: { versionIds } }), 200);
    // Sent: no more changes until a decision.
    expect((await h.call(`/onboarding/${token}`, { method: "PUT", body })).status).toBe(409);
    const entry = (
      await r.json<{ id: string; legalName: string }[]>(
        await r.call(supervisor, "/bo/onboarding"),
        200,
      )
    ).find((q) => q.legalName === "Agenzia Dodicesima");
    const detail = await r.json<{ ruiCheck: { nameMatches: boolean } }>(
      await r.call(supervisor, `/bo/onboarding/${entry?.id}`),
      200,
    );
    expect(detail.ruiCheck.nameMatches).toBe(false);
    await r.json(
      await r.call(supervisor, `/bo/onboarding/${entry?.id}/reject`, {
        body: { reason: "La ragione sociale non è quella del RUI" },
      }),
      200,
    );
    const mail = [...h.email.sent].reverse().find((m) => m.to === email);
    expect(mail?.text).toContain("La ragione sociale non è quella del RUI");
    expect(mail?.text).toContain(`/ingresso/${token}`);

    // Corrected (same IBAN and phone: no new code needed) and sent again.
    await r.json(
      await h.call(`/onboarding/${token}`, {
        method: "PUT",
        body: { ...body, legalName: "Agenzia Dodici" },
      }),
      200,
    );
    await r.json(await h.call(`/onboarding/${token}/submit`, { body: { versionIds } }), 200);
    const again = await r.json<{ ruiCheck: { nameMatches: boolean } }>(
      await r.call(supervisor, `/bo/onboarding/${entry?.id}`),
      200,
    );
    expect(again.ruiCheck.nameMatches).toBe(true);
  });

  it("only a back office supervisor decides", async () => {
    await acceptAllLegal(h, "bo-verifier");
    const verifier: Who = {
      token: await h.tokenFor("bo-verifier"),
      context: membershipId("bo-verifier", "astax"),
    };
    expect((await r.call(verifier, "/bo/onboarding")).status).toBe(403);
  });

  it("a RUI number already on AstAx cannot enter twice", async () => {
    const { token, options } = await applicationFor("A000000001", "Agenzia Uno", "uno@doppio.test");
    const versionIds = await complete(token, options);
    const refused = await r.json<{ errors: { issue: string }[] }>(
      await h.call(`/onboarding/${token}/submit`, { body: { versionIds } }),
      400,
    );
    expect(refused.errors.map((e) => e.issue)).toContain("RUI_IN_USE");
  });
});
