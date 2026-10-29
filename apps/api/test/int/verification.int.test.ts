import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { buildFiscalCode, type QuoteData } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
import { openTestAuction } from "./auction-helpers.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Fase 2: the back office verification. The private account is Davide Galli,
// used by no other test file.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let davide: Who;
let verifier: Who;
let agency: Who;
const DAVIDE_EMAIL = "davide.galli@example.test";

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  for (const key of [
    "private-davide-galli",
    "bo-verifier",
    "agenzia-due-owner",
    "broker-operator",
  ] as const) {
    await acceptAllLegal(h, key);
  }
  davide = { token: await h.tokenFor("private-davide-galli") };
  verifier = {
    token: await h.tokenFor("bo-verifier"),
    context: membershipId("bo-verifier", "astax"),
  };
  agency = {
    token: await h.tokenFor("agenzia-due-owner"),
    context: membershipId("agenzia-due-owner", "agenzia-due"),
  };
});

afterAll(async () => {
  await h.close();
});

const audit = (action: string, targetId: string) =>
  withContext(h.db, SYSTEM_CONTEXT, (tx) =>
    tx.auditLog.findMany({ where: { action, targetId }, orderBy: { seq: "asc" } }),
  );

interface Card {
  status: string;
  quoteData: QuoteData;
  quoteDataVersion: number;
  verification: { autoOutcome: string; checklist: { code: string }[]; decision: string | null };
  documents: { id: string; kind: string; extraction: { fields: Record<string, unknown> } }[];
  timeline: { type: string }[];
}

describe("Dan, 2026-10-28: the request held by one operator and the five checks", () => {
  let supervisor: Who;
  beforeAll(async () => {
    await acceptAllLegal(h, "bo-supervisor");
    supervisor = {
      token: await h.tokenFor("bo-supervisor"),
      context: membershipId("bo-supervisor", "astax"),
    };
  });

  const put = (who: Who, id: string, step: string, body: unknown = {}) =>
    r.call(who, `/verification/requests/${id}/checks/${step}`, { method: "PUT", body });
  const issues = async (response: Response, status: number) =>
    (await r.json<{ errors: { path: string; issue: string }[] }>(response, status)).errors;

  it("the first action takes the request; a colleague sees it held and cannot decide; the supervisor takes it over", async () => {
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    await r.json(await put(verifier, request.id, "REGISTRATION"), 200);

    const queue = await r.json<
      { requestId: string; checksDone: number; assignedTo: { name: string; since: string } }[]
    >(await r.call(verifier, "/verification/queue"), 200);
    const row = queue.find((q) => q.requestId === request.id);
    expect(row?.assignedTo.name).toBe("Arta Hoxha");
    expect(row?.assignedTo.since).toBeTruthy();
    expect(row?.checksDone).toBe(1);
    expect(await audit("VERIFICATION_ASSIGNED", request.id)).toHaveLength(1);

    // The supervisor sees the holder but does not decide on a colleague's request.
    expect(await issues(await put(supervisor, request.id, "IDENTITY"), 409)).toEqual([
      { path: "assignedTo", issue: "ASSIGNED_TO_COLLEAGUE" },
    ]);
    expect(
      (
        await issues(
          await r.call(supervisor, `/verification/requests/${request.id}/approve`, { body: {} }),
          409,
        )
      )[0]?.issue,
    ).toBe("ASSIGNED_TO_COLLEAGUE");

    // The supervisor reassigns it to themself; the verifier cannot take it back.
    await r.json(
      await r.call(supervisor, `/verification/requests/${request.id}/assign`, { body: {} }),
      200,
    );
    expect(
      (
        await issues(
          await r.call(verifier, `/verification/requests/${request.id}/assign`, { body: {} }),
          409,
        )
      )[0]?.issue,
    ).toBe("ASSIGNED_TO_COLLEAGUE");
    expect((await issues(await put(verifier, request.id, "IDENTITY"), 409))[0]?.issue).toBe(
      "ASSIGNED_TO_COLLEAGUE",
    );

    // Released, the request is free again.
    await r.json(
      await r.call(supervisor, `/verification/requests/${request.id}/release`, { body: {} }),
      200,
    );
    expect(await audit("VERIFICATION_RELEASED", request.id)).toHaveLength(1);
    const card = await r.json<{ verification: { assignedTo: unknown; checks: object } }>(
      await r.call(verifier, `/verification/requests/${request.id}`),
      200,
    );
    expect(card.verification.assignedTo).toBeNull();
    expect(Object.keys(card.verification.checks)).toEqual(["REGISTRATION"]);
    await r.json(await r.approve(verifier, request.id), 200);
  });

  it("the approval goes only with the five checks; a corrected plate must be in the data", async () => {
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    await r.json(await put(verifier, request.id, "REGISTRATION"), 200);
    await r.json(await put(verifier, request.id, "IDENTITY"), 200);
    const missing = await issues(
      await r.call(verifier, `/verification/requests/${request.id}/approve`, { body: {} }),
      409,
    );
    expect(missing).toEqual([
      { path: "checks.PLATE", issue: "CHECKS_INCOMPLETE" },
      { path: "checks.BIRTH_DATE", issue: "CHECKS_INCOMPLETE" },
      { path: "checks.QUOTE_TYPE", issue: "CHECKS_INCOMPLETE" },
    ]);

    expect(await issues(await put(verifier, request.id, "PLATE", { value: "x" }), 400)).toEqual([
      { path: "value", issue: "INVALID_PLATE" },
    ]);
    expect(
      (
        await r.call(verifier, `/verification/requests/${request.id}/checks/QUOTE_TYPE`, {
          method: "PUT",
          body: { value: "OTHER" },
        })
      ).status,
    ).toBe(400);
    await r.json(await put(verifier, request.id, "PLATE", { value: "gn 124 ab" }), 200);
    await r.json(await put(verifier, request.id, "BIRTH_DATE"), 200);
    const checks = await r.json<Record<string, { value?: string }>>(
      await put(verifier, request.id, "QUOTE_TYPE", { value: "RENEWAL" }),
      200,
    );
    expect(checks.PLATE?.value).toBe("GN124AB");
    expect(
      await issues(
        await r.call(verifier, `/verification/requests/${request.id}/approve`, { body: {} }),
        409,
      ),
    ).toEqual([{ path: "checks.PLATE", issue: "CORRECTION_NOT_IN_DATA" }]);

    // The check taken back and confirmed as it is: the approval goes.
    await r.json(
      await r.call(verifier, `/verification/requests/${request.id}/checks/PLATE`, {
        method: "DELETE",
      }),
      200,
    );
    await r.json(await put(verifier, request.id, "PLATE"), 200);
    await r.json(
      await r.call(verifier, `/verification/requests/${request.id}/approve`, { body: {} }),
      200,
    );
    // The log keeps the step, never the corrected value (rule 8).
    const recorded = await audit("VERIFICATION_CHECK_RECORDED", request.id);
    expect(recorded).toHaveLength(6);
    expect(JSON.stringify(recorded.map((a) => a.after))).not.toContain("GN124AB");
  });
  it("«Leggi da ANIA»: the fake record of the plate fills the sheet; the log keeps no data; an unknown plate is told", async () => {
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    const view = await r.json<{
      plate: string;
      sheet: { birthDate: string; ownerFiscalCode: string; cuClass: string; make: string };
      warnings: string[];
    }>(await r.call(verifier, `/verification/requests/${request.id}/ania`, { body: {} }), 200);
    const owner =
      request.quote.vehicleOwner === "SAME_AS_POLICY_HOLDER"
        ? request.quote.policyHolder
        : request.quote.vehicleOwner;
    if (owner.kind !== "PERSON") throw new Error("expected a person");
    expect(view.plate).toBe("GN123AB");
    expect(view.sheet.ownerFiscalCode).toBe(owner.fiscalCode);
    expect(view.sheet.birthDate).toBe(owner.birthDate);
    expect(view.sheet.make).toBe(request.quote.vehicle.make.toUpperCase());
    const card = await r.json<{ verification: { ania: { sheet: { cuClass: string } } } }>(
      await r.call(verifier, `/verification/requests/${request.id}`),
      200,
    );
    expect(card.verification.ania.sheet.cuClass).toBe(view.sheet.cuClass);
    const read = await audit("ANIA_READ", request.id);
    expect(read).toHaveLength(1);
    expect(JSON.stringify(read.map((a) => [a.before, a.after]))).not.toContain(owner.fiscalCode);

    await r.json(await put(verifier, request.id, "PLATE", { value: "ZZ000ZZ" }), 200);
    expect(
      await issues(
        await r.call(verifier, `/verification/requests/${request.id}/ania`, { body: {} }),
        409,
      ),
    ).toEqual([{ path: "plate", issue: "ANIA_NOT_FOUND" }]);
  });
});

describe("Dan, 2026-10-28: one tick confirms the bots' data and opens the auction", () => {
  const put = (who: Who, id: string, step: string, body: unknown = {}) =>
    r.call(who, `/verification/requests/${id}/checks/${step}`, { method: "PUT", body });

  it("with the five checks and ANIA read, the confirmation makes a version, opens the auction, and the invited agency sees the ANIA data", async () => {
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    expect(
      (await r.call(verifier, `/verification/requests/${request.id}/bot-confirm`, { body: {} }))
        .status,
    ).toBe(409);
    for (const step of ["REGISTRATION", "IDENTITY", "PLATE", "BIRTH_DATE"]) {
      await r.json(await put(verifier, request.id, step), 200);
    }
    await r.json(await put(verifier, request.id, "QUOTE_TYPE", { value: "RENEWAL" }), 200);
    await r.json(
      await r.call(verifier, `/verification/requests/${request.id}/ania`, { body: {} }),
      200,
    );
    expect(
      await r.json(
        await r.call(verifier, `/verification/requests/${request.id}/bot-confirm`, { body: {} }),
        200,
      ),
    ).toEqual({ decision: "APPROVED" });
    const confirmed = await audit("VERIFICATION_BOT_DATA_CONFIRMED", request.id);
    expect(confirmed).toHaveLength(1);
    const card = await r.json<{ quoteDataVersion: number; quoteData: QuoteData }>(
      await r.call(verifier, `/verification/requests/${request.id}`),
      200,
    );
    // The fake ANIA's insurer and class are now the data of the request.
    expect(card.quoteDataVersion).toBe(2);
    expect(card.quoteData.history.currentInsurer).toMatch(/^COMPAGNIA /);

    const auctionId = await openTestAuction(h, request.id, ["agenzia-due"]);
    const seen = await r.json<{ ania: { sheet: { cuClass: string }; warnings: string[] } | null }>(
      await r.call(agency, `/agency/requests/${auctionId}`),
      200,
    );
    expect(seen.ania?.sheet.cuClass).toBe(String(card.quoteData.history.cuClass));
  });
});

describe("fase 2: verification queue and card", () => {
  it("the operator finds the GREEN request in the queue and opens it; card and document openings are logged", async () => {
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    expect(request.autoOutcome).toBe("GREEN");

    const queue = await r.json<{ requestId: string; autoOutcome: string }[]>(
      await r.call(verifier, "/verification/queue"),
      200,
    );
    expect(queue).toContainEqual(
      expect.objectContaining({ requestId: request.id, autoOutcome: "GREEN" }),
    );

    const card = await r.json<Card>(
      await r.call(verifier, `/verification/requests/${request.id}`),
      200,
    );
    expect(card.quoteData.vehicle.plate).toBe("GN123AB");
    expect(card.verification.checklist.map((i) => i.code)).toContain("DOCUMENTS");
    expect(
      card.documents.find((d) => d.kind === "REGISTRATION_CERTIFICATE")?.extraction.fields,
    ).toHaveProperty("ownerFiscalCode");
    expect(await audit("QUOTE_DATA_VIEWED", request.id)).toHaveLength(1);

    const document = card.documents[0];
    const file = await r.call(
      verifier,
      `/verification/requests/${request.id}/documents/${document?.id}/file`,
    );
    expect(file.status).toBe(200);
    expect(await audit("DOCUMENT_VIEWED", document?.id ?? "")).toHaveLength(1);
  });

  it("an agency cannot open the card of a request it is not invited to", async () => {
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    expect((await r.call(agency, `/verification/requests/${request.id}`)).status).toBe(403);
  });

  it("a correction by the back office is a new recorded version, with the changed paths and no values", async () => {
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    const card = await r.json<Card>(
      await r.call(verifier, `/verification/requests/${request.id}`),
      200,
    );
    const corrected = {
      ...card.quoteData,
      vehicle: { ...card.quoteData.vehicle, version: "Versione corretta" },
    };
    const result = await r.json<{ quoteDataVersion: number; changedFields: string[] }>(
      await r.call(verifier, `/verification/requests/${request.id}/corrections`, {
        body: { quoteData: corrected, reason: "Allestimento dal libretto" },
      }),
      200,
    );
    expect(result).toMatchObject({ quoteDataVersion: 2, changedFields: ["vehicle.version"] });

    const [entry] = await audit("QUOTE_DATA_CORRECTED", request.id);
    expect(entry?.before).toMatchObject({ quoteDataVersion: 1 });
    expect(entry?.after).toMatchObject({ quoteDataVersion: 2, changedFields: ["vehicle.version"] });
    expect(JSON.stringify({ ...entry, seq: null })).not.toContain("Versione corretta");

    const seen = await r.json<{ quoteDataVersion: number; quoteData: QuoteData }>(
      await r.call(davide, `/requests/${request.id}`),
      200,
    );
    expect(seen.quoteDataVersion).toBe(2);
    expect(seen.quoteData.vehicle.version).toBe("Versione corretta");
  });

  it("integration: the requester sees what is missing, changes only that, and the request comes back to the queue", async () => {
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    await r.json(
      await r.call(verifier, `/verification/requests/${request.id}/integration`, {
        body: {
          reasonCodes: ["UNREADABLE_DOCUMENT"],
          message: "Ricarica la patente, la foto è sfocata",
          sections: ["driving"],
          documents: ["DRIVING_LICENCE"],
        },
      }),
      200,
    );
    const email = [...h.email.sent].reverse().find((m) => m.to === DAVIDE_EMAIL);
    expect(email?.subject).toContain("serve un'integrazione");
    const inbox = await r.json<{
      unread: number;
      items: { id: string; eventKey: string; link: string }[];
    }>(await r.call(davide, "/me/notifications"), 200);
    const notice = inbox.items.find((n) => n.eventKey === "request.integration_requested");
    expect(notice?.link).toBe(`/preventivi/${request.id}`);
    await r.json(await r.call(davide, `/me/notifications/${notice?.id}/read`, { body: {} }), 204);
    const after = await r.json<{ unread: number }>(await r.call(davide, "/me/notifications"), 200);
    expect(after.unread).toBe(inbox.unread - 1);

    const detail = await r.json<{
      status: string;
      integration: { sections: string[]; documents: string[] };
    }>(await r.call(davide, `/requests/${request.id}`), 200);
    expect(detail).toMatchObject({
      status: "INTEGRATION_REQUESTED",
      integration: { sections: ["driving"], documents: ["DRIVING_LICENCE"] },
    });

    // Question 9: only what the back office asked for.
    const notAsked = await r.call(davide, `/requests/${request.id}/draft/history`, {
      method: "PUT",
      body: { value: { ...request.quote.history, cuClass: 9 } },
    });
    expect(notAsked.status).toBe(409);
    // The same section sent back unchanged (a step form sends all its sections) is accepted.
    const unchanged = await r.call(davide, `/requests/${request.id}/draft/policyHolder`, {
      method: "PUT",
      body: { value: request.quote.policyHolder },
    });
    expect(unchanged.status).toBe(200);
    expect((await r.upload(davide, request.id, "RISK_CERTIFICATE", "attestato.pdf")).status).toBe(
      409,
    );
    await r.json(
      await r.upload(davide, request.id, "DRIVING_LICENCE", "patente-giulia-neri.jpg", 0),
      201,
    );
    await r.json(
      await r.call(davide, `/requests/${request.id}/draft/driving`, {
        method: "PUT",
        body: { value: { drivers: request.quote.drivers, drivingFormula: "FREE" } },
      }),
      200,
    );
    const resubmitted = await r.json<{ status: string }>(
      await r.call(davide, `/requests/${request.id}/submit`, { body: {} }),
      200,
    );
    expect(resubmitted.status).toBe("IN_VERIFICATION");

    const card = await r.json<Card>(
      await r.call(verifier, `/verification/requests/${request.id}`),
      200,
    );
    expect(card.quoteData.drivingFormula).toBe("FREE");
    expect(card.verification.decision).toBeNull();
    expect(card.timeline.map((e) => e.type)).toEqual(
      expect.arrayContaining(["SUBMITTED", "INTEGRATION_REQUESTED", "RESUBMITTED"]),
    );
    const versions = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.quoteDataVersion.findMany({
        where: { quoteRequestId: request.id },
        orderBy: { version: "asc" },
      }),
    );
    expect(versions.map((v) => v.source)).toEqual(["SUBMISSION", "INTEGRATION"]);
  });

  it("exclusion: the request is closed and the requester is told why", async () => {
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    await r.json(
      await r.call(verifier, `/verification/requests/${request.id}/exclude`, {
        body: { reasonCode: "VINTAGE", message: "Il veicolo risulta storico" },
      }),
      200,
    );
    const detail = await r.json<{ status: string }>(
      await r.call(davide, `/requests/${request.id}`),
      200,
    );
    expect(detail.status).toBe("EXCLUDED");
    const email = [...h.email.sent].reverse().find((m) => m.to === DAVIDE_EMAIL);
    expect(email?.subject).toContain("non può andare all'asta");
    expect(email?.text).toContain("veicolo d'epoca o storico");
  });

  it("approval: decision APPROVED and the RequestApproved event for phase 3; a second decision is refused", async () => {
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    await r.json(
      await r.call(verifier, `/verification/requests/${request.id}/assign`, { body: {} }),
      200,
    );
    await r.json(await r.approve(verifier, request.id), 200);
    const events = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.domainEvent.findMany({ where: { aggregateId: request.id, type: "RequestApproved" } }),
    );
    expect(events).toHaveLength(1);
    expect(
      (await r.call(verifier, `/verification/requests/${request.id}/approve`, { body: {} })).status,
    ).toBe(409);
    const queue = await r.json<{ requestId: string }[]>(
      await r.call(verifier, "/verification/queue"),
      200,
    );
    expect(queue.map((q) => q.requestId)).not.toContain(request.id);
  });

  it("ASTA-05 ASTA-06 the card previews the agencies to invite; one left out with a reason is not invited", async () => {
    interface Preview {
      invited: { organizationId: string; name: string; companies: string[] }[];
      companies: string[];
      excluded: { organizationId: string; reason: string }[];
    }
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    expect((await r.call(agency, `/verification/requests/${request.id}/agencies`)).status).toBe(
      403,
    );
    const before = await r.json<Preview>(
      await r.call(verifier, `/verification/requests/${request.id}/agencies`),
      200,
    );
    expect(before.invited.length).toBeGreaterThan(0);
    // ADR 0024: every compatible agency gets the email, without the limit of 8.
    expect(before.invited.length).toBeGreaterThan(8);
    expect(before.companies).toEqual([
      "Compagnia Alfa",
      "Compagnia Beta",
      "Compagnia Delta",
      "Compagnia Gamma",
    ]);
    const first = before.invited[0];
    await r.json(
      await r.call(
        verifier,
        `/verification/requests/${request.id}/agencies/${first?.organizationId}/exclude`,
        { body: { reason: "Reclami recenti su questa zona" } },
      ),
      200,
    );
    const after = await r.json<Preview>(
      await r.call(verifier, `/verification/requests/${request.id}/agencies`),
      200,
    );
    expect(after.invited.map((a) => a.organizationId)).not.toContain(first?.organizationId);
    expect(after.excluded).toEqual([
      expect.objectContaining({
        organizationId: first?.organizationId,
        reason: "Reclami recenti su questa zona",
      }),
    ]);
    expect(await audit("AGENCY_EXCLUDED_FROM_AUCTION", request.id)).toHaveLength(1);
    await r.json(
      await r.call(
        verifier,
        `/verification/requests/${request.id}/agencies/${first?.organizationId}/include`,
        { body: {} },
      ),
      200,
    );
    const back = await r.json<Preview>(
      await r.call(verifier, `/verification/requests/${request.id}/agencies`),
      200,
    );
    expect(back.excluded).toEqual([]);
  });

  it("rule 7: a correction must pass the same checks as a submission", async () => {
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    const card = await r.json<Card>(
      await r.call(verifier, `/verification/requests/${request.id}`),
      200,
    );
    const odd = {
      ...card.quoteData,
      request: { ...card.quoteData.request, auctionDurationHours: 3 },
    };
    const refused = await r.json<{ errors: { issue: string }[] }>(
      await r.call(verifier, `/verification/requests/${request.id}/corrections`, {
        body: { quoteData: odd, reason: "Durata diversa" },
      }),
      400,
    );
    expect(refused.errors).toContainEqual({
      path: "quoteData",
      issue: "AUCTION_DURATION_NOT_ALLOWED",
    });
    const badCode = { ...card.quoteData, vehicle: { ...card.quoteData.vehicle, fuel: "STEAM" } };
    expect(
      (
        await r.call(verifier, `/verification/requests/${request.id}/corrections`, {
          body: { quoteData: badCode, reason: "Alimentazione" },
        })
      ).status,
    ).toBe(400);
  });

  it("rule 4: a correction or a note on the checklist is logged, without its words", async () => {
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    await r.json(
      await r.call(verifier, `/verification/requests/${request.id}/checklist/DOCUMENTS`, {
        method: "PUT",
        body: { note: "Patente letta bene" },
      }),
      200,
    );
    const [entry] = await audit("VERIFICATION_CHECKLIST_UPDATED", request.id);
    expect(entry?.after).toMatchObject({ item: "DOCUMENTS" });
    expect(JSON.stringify({ ...entry, seq: null })).not.toContain("Patente letta bene");
  });

  it("verification.autoApproveGreen switched on: a green request is approved by the system", async () => {
    const setValue = (value: boolean) =>
      withContext(h.db, SYSTEM_CONTEXT, async (tx) => {
        const count = await tx.setting.count({ where: { key: "verification.autoApproveGreen" } });
        await tx.setting.create({
          data: {
            key: "verification.autoApproveGreen",
            value,
            version: count + 1,
            validFrom: new Date(h.clock.now().getTime() - 1000),
            reason: "test",
          },
        });
      });
    await setValue(true);
    try {
      const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
      expect(request.autoOutcome).toBe("GREEN");
      const round = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
        tx.verification.findFirstOrThrow({ where: { quoteRequestId: request.id } }),
      );
      expect(round.decision).toBe("APPROVED");
      const events = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
        tx.domainEvent.count({ where: { aggregateId: request.id, type: "RequestApproved" } }),
      );
      expect(events).toBe(1);
    } finally {
      await setValue(false);
    }
  });

  it("LEG-04: a correction cannot change the holder of a broker's request; a private's may (question 12)", async () => {
    const otherHolder = (quote: QuoteData, birthDate = "1991-05-12") => {
      const holder = quote.policyHolder;
      if (holder.kind !== "PERSON") throw new Error("sample holder is a person");
      const fiscalCode = buildFiscalCode({
        surname: holder.surname,
        givenName: holder.givenName,
        birthDate,
        sex: "F",
        birthPlaceCadastralCode: "F205",
      });
      const person = { ...holder, fiscalCode, birthDate };
      return {
        ...quote,
        policyHolder: person,
        drivers: quote.drivers.map((d) => ({ ...d, person })),
      };
    };

    // A private user's request: the holder may be someone else.
    const own = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    const ownCard = await r.json<Card>(
      await r.call(verifier, `/verification/requests/${own.id}`),
      200,
    );
    await r.json(
      await r.call(verifier, `/verification/requests/${own.id}/corrections`, {
        body: { quoteData: otherHolder(ownCard.quoteData), reason: "Contraente dal libretto" },
      }),
      200,
    );

    // A broker's request: the holder is the customer who gave the consent.
    const broker: Who = {
      token: await h.tokenFor("broker-operator"),
      context: membershipId("broker-operator", "broker-demo"),
    };
    // A customer of this test only (the files share the database).
    const quote = otherHolder(await r.sampleQuote(broker), "1987-08-21");
    const holder = quote.policyHolder;
    if (holder.kind !== "PERSON") throw new Error("sample holder is a person");
    const customer = await r.json<{ id: string }>(
      await r.call(broker, "/customers", {
        body: {
          kind: "PERSON",
          surname: holder.surname,
          givenName: holder.givenName,
          fiscalCode: holder.fiscalCode,
        },
      }),
      201,
    );
    const created = await r.json<{ id: string }>(
      await r.call(broker, "/requests", { body: { customerId: customer.id } }),
      201,
    );
    await r.saveAll(broker, created.id, quote);
    const consent = await r.json<{ id: string }>(
      await r.upload(broker, created.id, "CONSENT_FORM", "consenso-firmato.pdf"),
      201,
    );
    await r.json(
      await r.call(broker, `/requests/${created.id}/consent/uploaded`, {
        body: { documentId: consent.id },
      }),
      200,
    );
    await r.json(await r.call(broker, `/requests/${created.id}/submit`, { body: {} }), 200);
    const card = await r.json<Card>(
      await r.call(verifier, `/verification/requests/${created.id}`),
      200,
    );
    const refused = await r.json<{ errors: { issue: string }[] }>(
      await r.call(verifier, `/verification/requests/${created.id}/corrections`, {
        body: { quoteData: otherHolder(card.quoteData), reason: "Altro contraente" },
      }),
      400,
    );
    expect(refused.errors).toContainEqual({
      path: "policyHolder.fiscalCode",
      issue: "HOLDER_NOT_CUSTOMER",
    });
  });

  // The revocation ends every consent of Davide given so far; later tests give a new one.
  it("LEG-04: once the customer revokes the consent, no auction opens: the approval is refused", async () => {
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    const consents = await r.json<
      { id: string; version: number | null; revokedAt: string | null }[]
    >(await r.call(davide, "/me/consents"), 200);
    const active = consents.find((c) => c.revokedAt === null);
    expect(active?.version).not.toBeNull();

    // ADR 0015: an agency revokes the consents of its own customers only; this one it does not see.
    expect((await r.call(agency, `/consents/${active?.id}/revoke`, { body: {} })).status).toBe(404);
    await r.json(await r.call(davide, `/consents/${active?.id}/revoke`, { body: {} }), 200);
    const after = await r.json<{ revokedAt: string | null }[]>(
      await r.call(davide, "/me/consents"),
      200,
    );
    expect(after.every((c) => c.revokedAt !== null)).toBe(true);
    const [customer] = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.quoteRequest.findMany({ where: { id: request.id }, select: { customerId: true } }),
    );
    expect(await audit("CONSENT_REVOKED", customer?.customerId ?? "")).toHaveLength(1);

    const refused = await r.json<{ errors: { path: string; issue: string }[] }>(
      await r.approve(verifier, request.id),
      409,
    );
    expect(refused.errors).toContainEqual({ path: "consent", issue: "CONSENT_REVOKED" });
  });

  it("a request still in the queue after its start date can be corrected, unless the date itself is changed to the past", async () => {
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    const card = await r.json<Card>(
      await r.call(verifier, `/verification/requests/${request.id}`),
      200,
    );
    // The sample starts on 2026-11-30: two weeks and more later.
    h.clock.advanceMinutes(20 * 24 * 60);
    davide = { token: await h.tokenFor("private-davide-galli") };
    verifier = { ...verifier, token: await h.tokenFor("bo-verifier") };
    const version = {
      ...card.quoteData,
      vehicle: { ...card.quoteData.vehicle, version: "Allestimento" },
    };
    await r.json(
      await r.call(verifier, `/verification/requests/${request.id}/corrections`, {
        body: { quoteData: version, reason: "Allestimento dal libretto" },
      }),
      200,
    );
    const pastStart = { ...version, request: { ...version.request, startDate: "2026-12-01" } };
    const refused = await r.json<{ errors: { issue: string }[] }>(
      await r.call(verifier, `/verification/requests/${request.id}/corrections`, {
        body: { quoteData: pastStart, reason: "Decorrenza" },
      }),
      400,
    );
    expect(refused.errors).toContainEqual({ path: "quoteData", issue: "START_DATE_IN_THE_PAST" });
  });

  it("Dan, 2026-10-29: a chosen start already past becomes the day the auction opens, once the checks pass", async () => {
    // A start chosen for tomorrow, three days later is past.
    const tomorrow = romeCalendarDate(new Date(h.clock.now().getTime() + 24 * 3600_000));
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL, (quote) => ({
      ...quote,
      request: { ...quote.request, startDate: tomorrow, startMode: "DATE" },
    }));
    h.clock.advanceMinutes(3 * 24 * 60);
    davide = { token: await h.tokenFor("private-davide-galli") };
    verifier = { ...verifier, token: await h.tokenFor("bo-verifier") };
    for (const step of ["REGISTRATION", "IDENTITY", "PLATE", "BIRTH_DATE"]) {
      await r.json(
        await r.call(verifier, `/verification/requests/${request.id}/checks/${step}`, {
          method: "PUT",
          body: {},
        }),
        200,
      );
    }
    await r.json(
      await r.call(verifier, `/verification/requests/${request.id}/checks/QUOTE_TYPE`, {
        method: "PUT",
        body: { value: "RENEWAL" },
      }),
      200,
    );
    await r.json(
      await r.call(verifier, `/verification/requests/${request.id}/ania`, { body: {} }),
      200,
    );
    expect(
      await r.json(
        await r.call(verifier, `/verification/requests/${request.id}/bot-confirm`, { body: {} }),
        200,
      ),
    ).toEqual({ decision: "APPROVED" });
    const card = await r.json<{ quoteData: QuoteData }>(
      await r.call(verifier, `/verification/requests/${request.id}`),
      200,
    );
    expect(card.quoteData.request.startDate).toBe(romeCalendarDate(h.clock.now()));
  });
});
