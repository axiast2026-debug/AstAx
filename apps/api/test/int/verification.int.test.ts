import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { buildFiscalCode, type QuoteData } from "@astax/shared/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
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
  for (const key of ["private-davide-galli", "bo-verifier", "agenzia-due-owner"] as const) {
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
  withContext(h.db, SYSTEM_CONTEXT, (tx) => tx.auditLog.findMany({ where: { action, targetId } }));

interface Card {
  status: string;
  quoteData: QuoteData;
  quoteDataVersion: number;
  verification: { autoOutcome: string; checklist: { code: string }[]; decision: string | null };
  documents: { id: string; kind: string; extraction: { fields: Record<string, unknown> } }[];
  timeline: { type: string }[];
}

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
    await r.json(
      await r.call(verifier, `/verification/requests/${request.id}/approve`, { body: {} }),
      200,
    );
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

  it("LEG-04: a correction cannot change the policy holder into someone else", async () => {
    const request = await r.submittedPrivateRequest(davide, DAVIDE_EMAIL);
    const card = await r.json<Card>(
      await r.call(verifier, `/verification/requests/${request.id}`),
      200,
    );
    const holder = card.quoteData.policyHolder;
    if (holder.kind !== "PERSON") throw new Error("sample holder is a person");
    const other = buildFiscalCode({
      surname: holder.surname,
      givenName: holder.givenName,
      birthDate: "1991-05-12",
      sex: "F",
      birthPlaceCadastralCode: "F205",
    });
    const changed = {
      ...card.quoteData,
      policyHolder: { ...holder, fiscalCode: other, birthDate: "1991-05-12" },
    };
    const refused = await r.json<{ errors: { issue: string }[] }>(
      await r.call(verifier, `/verification/requests/${request.id}/corrections`, {
        body: { quoteData: changed, reason: "Altro contraente" },
      }),
      400,
    );
    expect(refused.errors).toContainEqual({
      path: "policyHolder.fiscalCode",
      issue: "HOLDER_NOT_CUSTOMER",
    });
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
});
