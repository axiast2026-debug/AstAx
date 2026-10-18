import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 7, spec 06 «Reclami» and spec 03: the protocol, the answer due within
// complaints.responseDays, the answer with its outcome, the IVASS export.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let privateUser: Who;
let supervisor: Who;
let support: Who;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  for (const key of ["private-elena-sala", "bo-supervisor", "bo-support"] as const) {
    await acceptAllLegal(h, key);
  }
  privateUser = { token: await h.tokenFor("private-elena-sala") };
  supervisor = {
    token: await h.tokenFor("bo-supervisor"),
    context: membershipId("bo-supervisor", "astax"),
  };
  support = { token: await h.tokenFor("bo-support"), context: membershipId("bo-support", "astax") };
});

afterAll(async () => {
  await h.close();
});

describe("phase 7 complaints", () => {
  it("a private files a complaint: protocol, due date, receipt and the supervisors told", async () => {
    const before = h.email.sent.length;
    const filed = await r.json<{ id: string; protocol: string; dueAt: string }>(
      await r.call(privateUser, "/me/complaints", {
        body: {
          subject: "Tempi di risposta",
          description: "Nessuno mi ha risposto per una settimana.",
        },
      }),
      201,
    );
    expect(filed.protocol).toMatch(/^R-\d{4}-\d{6}$/);
    expect(new Date(filed.dueAt).getTime() - h.clock.now().getTime()).toBe(45 * 86_400_000);
    const mails = h.email.sent.slice(before);
    expect(
      mails.some(
        (m) => m.subject.includes(filed.protocol) && m.subject.startsWith("Reclamo ricevuto"),
      ),
    ).toBe(true);
    expect(mails.some((m) => m.subject.startsWith("Nuovo reclamo"))).toBe(true);
    const own = await r.json<{ protocol: string; status: string }[]>(
      await r.call(privateUser, "/me/complaints"),
      200,
    );
    expect(own.map((c) => c.protocol)).toContain(filed.protocol);

    // The supervisor answers; the private reads it in the own area.
    await r.json(
      await r.call(supervisor, `/back-office/complaints/${filed.id}/answer`, {
        body: { responseText: "Ci scusiamo: il ritardo è stato corretto.", outcome: "ACCEPTED" },
      }),
      200,
    );
    const after = await r.json<{ protocol: string; status: string; responseText: string }[]>(
      await r.call(privateUser, "/me/complaints"),
      200,
    );
    expect(after.find((c) => c.protocol === filed.protocol)).toMatchObject({
      status: "ANSWERED",
      responseText: "Ci scusiamo: il ritardo è stato corretto.",
    });
    const twice = await r.call(supervisor, `/back-office/complaints/${filed.id}/answer`, {
      body: { responseText: "Di nuovo una risposta.", outcome: "REJECTED" },
    });
    expect(twice.status).toBe(409);
  });

  it("the support registers a complaint arrived by PEC; only the supervisor manages the register", async () => {
    const registered = await r.json<{ id: string; protocol: string }>(
      await r.call(support, "/back-office/complaints", {
        body: {
          channel: "PEC",
          receivedOn: "2026-10-01",
          complainantName: "Mario Bianchi",
          complainantEmail: "mario.bianchi@example.test",
          subject: "Rimborso del fee",
          description: "Chiedo il rimborso del fee dopo l'annullamento.",
        },
      }),
      201,
    );
    expect(registered.protocol).toMatch(/^R-2026-/);
    expect((await r.call(support, "/back-office/complaints")).status).toBe(403);
    // A private cannot register on behalf of others.
    expect((await r.call(privateUser, "/back-office/complaints", { body: {} })).status).toBe(403);
    const list = await r.json<{ protocol: string; late: boolean }[]>(
      await r.call(supervisor, "/back-office/complaints"),
      200,
    );
    expect(list.map((c) => c.protocol)).toContain(registered.protocol);
  });

  it("the IVASS export is a CSV and is itself in the audit log", async () => {
    const file = await r.call(
      supervisor,
      "/back-office/complaints/export?from=2026-01-01&to=2026-12-31",
    );
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toContain("text/csv");
    const text = await file.text();
    expect(text.split("\r\n")[0]).toBe(
      "protocollo;data_ricezione;canale;oggetto;intermediario;rui_intermediario;stato;esito;data_risposta;giorni_per_rispondere",
    );
    expect(text).toContain('"PEC"');
    const logged = await system((tx) =>
      tx.auditLog.findFirst({ where: { action: "COMPLAINTS_EXPORTED" } }),
    );
    expect(logged?.after).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
  });
});
