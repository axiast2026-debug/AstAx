import { LocalFieldCipher } from "@astax/adapters/crypto";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { buildFiscalCode, sampleQuoteData, type QuoteData } from "@astax/shared/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acceptAllLegal,
  membershipId,
  startHarness,
  TEST_CIPHER_KEYS,
  userId,
  type Harness,
} from "./fixtures.js";

// Fase 2: requests of private users and brokers up to the back office queue.
// The private account is Luca Ferri (other files rely on Giulia Neri having
// legal texts still to accept, as auth.int.test.ts relies on Sara Conti); the
// data of the request are the sample ones.
let h: Harness;
let luca: string;
let paolo: string;
let laura: string;
const paoloContext = () => membershipId("broker-operator", "broker-demo");
const lauraContext = () => membershipId("broker-owner", "broker-demo");
const cipher = new LocalFieldCipher(TEST_CIPHER_KEYS.encryption, TEST_CIPHER_KEYS.blindIndex);

beforeAll(async () => {
  h = await startHarness();
  for (const key of ["private-luca-ferri", "broker-operator", "broker-owner"] as const) {
    await acceptAllLegal(h, key);
  }
  luca = await h.tokenFor("private-luca-ferri");
  paolo = await h.tokenFor("broker-operator");
  laura = await h.tokenFor("broker-owner");
});

afterAll(async () => {
  await h.close();
});

type Who = { token: string; context?: string };
const asLuca = (): Who => ({ token: luca });
const asPaolo = (): Who => ({ token: paolo, context: paoloContext() });

async function call(who: Who, path: string, options: { method?: string; body?: unknown } = {}) {
  return h.call(path, { ...who, ...options });
}

async function json<T>(response: Response, status: number): Promise<T> {
  const text = await response.text();
  expect(response.status, text).toBe(status);
  return (text ? JSON.parse(text) : null) as T;
}

async function upload(
  who: Who,
  requestId: string,
  kind: string,
  fileName: string,
  driverIndex?: number,
) {
  const query = `kind=${kind}${driverIndex === undefined ? "" : `&driverIndex=${driverIndex}`}`;
  return fetch(`${h.baseUrl}/requests/${requestId}/documents?${query}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${who.token}`,
      ...(who.context ? { "x-astax-context": who.context } : {}),
      "content-type": fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
      "x-file-name": encodeURIComponent(fileName),
    },
    body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]),
  });
}

/** Giulia's data, with the vehicle as the fake plate lookup describes it. */
async function giuliaQuote(who: Who, plate = "GN123AB"): Promise<QuoteData> {
  const quote = sampleQuoteData();
  const lookup = await json<{
    found: true;
    vehicle: { make: string; model: string; firstRegistrationDate: string };
  }>(await call(who, "/vehicle-data/lookup", { body: { plate } }), 200);
  return {
    ...quote,
    vehicle: {
      ...quote.vehicle,
      plate,
      make: lookup.vehicle.make,
      model: lookup.vehicle.model,
      firstRegistrationDate: lookup.vehicle.firstRegistrationDate,
      purchaseDate: lookup.vehicle.firstRegistrationDate,
    },
  };
}

async function saveAll(who: Who, id: string, quote: QuoteData) {
  const sections: [string, unknown][] = [
    ["policyHolder", quote.policyHolder],
    ["vehicleOwner", quote.vehicleOwner],
    ["vehicle", quote.vehicle],
    ["history", quote.history],
    ["driving", { drivers: quote.drivers, drivingFormula: quote.drivingFormula }],
    ["request", quote.request],
  ];
  for (const [section, value] of sections) {
    await json(
      await call(who, `/requests/${id}/draft/${section}`, { method: "PUT", body: { value } }),
      200,
    );
  }
}

function lastCode(to: string): string {
  const message = [...h.email.sent].reverse().find((m) => m.to === to);
  const code = /\b(\d{6})\b/.exec(message?.text ?? "")?.[1];
  if (!code) throw new Error(`no code sent to ${to}`);
  return code;
}

async function privateRequestReady(
  plate = "GN123AB",
  files = ["giulia-neri", "giulia-neri", "giulia-neri"],
) {
  const created = await json<{ id: string; code: string }>(
    await call(asLuca(), "/requests", { body: {} }),
    201,
  );
  const quote = await giuliaQuote(asLuca(), plate);
  await saveAll(asLuca(), created.id, quote);
  await json(
    await upload(asLuca(), created.id, "REGISTRATION_CERTIFICATE", `libretto-${files[0]}.jpg`),
    201,
  );
  await json(
    await upload(asLuca(), created.id, "DRIVING_LICENCE", `patente-${files[1]}.jpg`, 0),
    201,
  );
  await json(
    await upload(asLuca(), created.id, "RISK_CERTIFICATE", `attestato-${files[2]}.pdf`),
    201,
  );
  return { ...created, quote };
}

async function giveConsent(id: string) {
  await json(await call(asLuca(), `/requests/${id}/consent/code`, { body: {} }), 204);
  await json(
    await call(asLuca(), `/requests/${id}/consent/confirm`, {
      body: { code: lastCode("luca.ferri@example.test") },
    }),
    200,
  );
}

describe("fase 2: options from the parameters", () => {
  it("rule 7: auction durations and minimum validity come from the parameters in force", async () => {
    const options = await json<{
      auctionDurationsHours: number[];
      minValidityDaysOptions: number[];
      packages: { code: string }[];
      specialUses: { code: string }[];
    }>(await call(asLuca(), "/reference/request-options"), 200);
    expect(options.auctionDurationsHours).toEqual([1, 2, 5, 24]);
    expect(options.minValidityDaysOptions).toEqual([7, 15, 30]);
    expect(options.packages.map((p) => p.code)).toEqual(["BASE", "PLUS", "COMPLETE"]);
    expect(options.specialUses.map((s) => s.code)).toContain("TAXI");
  });

  it("finds municipalities by name", async () => {
    const found = await json<{ istatCode: string; name: string }[]>(
      await call(asLuca(), "/reference/municipalities?q=Milan"),
      200,
    );
    expect(found).toContainEqual(expect.objectContaining({ istatCode: "015146", name: "Milano" }));
  });
});

describe("fase 2: a private request from draft to the verification queue", () => {
  it("Luca completes the wizard (Giulia's sample data), confirms the consent with a code and submits: GREEN in the queue", async () => {
    const request = await privateRequestReady();

    // LEG-04: no submission without consent.
    const noConsent = await json<{ errors: { issue: string }[] }>(
      await call(asLuca(), `/requests/${request.id}/submit`, { body: {} }),
      400,
    );
    expect(noConsent.errors).toEqual([{ path: "consent", issue: "CONSENT_REQUIRED" }]);

    await json(await call(asLuca(), `/requests/${request.id}/consent/code`, { body: {} }), 204);
    const wrong = await call(asLuca(), `/requests/${request.id}/consent/confirm`, {
      body: { code: "000000" },
    });
    expect(wrong.status).toBe(lastCode("luca.ferri@example.test") === "000000" ? 200 : 400);
    await giveConsent(request.id);

    const submitted = await json<{ status: string; autoOutcome: string }>(
      await call(asLuca(), `/requests/${request.id}/submit`, { body: {} }),
      200,
    );
    expect(submitted).toMatchObject({ status: "IN_VERIFICATION", autoOutcome: "GREEN" });

    const detail = await json<{
      status: string;
      editable: boolean;
      quoteData: QuoteData;
      timeline: { type: string }[];
    }>(await call(asLuca(), `/requests/${request.id}`), 200);
    expect(detail.editable).toBe(false);
    expect(detail.quoteData.vehicle.plate).toBe("GN123AB");
    expect(detail.timeline.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        "CREATED",
        "DOCUMENT_ADDED",
        "CONSENT_GIVEN",
        "SUBMITTED",
        "AUTO_CHECKED",
      ]),
    );

    // The back office verifiers are told, in the app.
    const notifications = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.notification.findMany({
        where: {
          eventKey: "request.submitted.bo",
          payload: { path: ["requestId"], equals: request.id },
        },
      }),
    );
    expect(notifications.map((n) => n.userId)).toContain(userId("bo-verifier"));
    expect(notifications.find((n) => n.userId === userId("bo-verifier"))?.title).toBe(
      "Kërkesë e re për verifikim",
    );
  });

  it("after submission the requester cannot change the data (409)", async () => {
    const request = await privateRequestReady();
    await giveConsent(request.id);
    await json(await call(asLuca(), `/requests/${request.id}/submit`, { body: {} }), 200);
    const response = await call(asLuca(), `/requests/${request.id}/draft/vehicle`, {
      method: "PUT",
      body: { value: request.quote.vehicle },
    });
    expect(response.status).toBe(409);
    expect((await upload(asLuca(), request.id, "OTHER", "altro.pdf")).status).toBe(409);
  });

  it("ASTA-10 a special use declared in the wizard (taxi) blocks the submission with its reason", async () => {
    const request = await privateRequestReady();
    await giveConsent(request.id);
    const declared = await json<{ blockingExclusions: string[] }>(
      await call(asLuca(), `/requests/${request.id}/draft/special-uses`, {
        method: "PUT",
        body: { specialUses: ["TAXI"] },
      }),
      200,
    );
    expect(declared.blockingExclusions).toEqual(["TAXI"]);
    const refused = await json<{ errors: { issue: string }[] }>(
      await call(asLuca(), `/requests/${request.id}/submit`, { body: {} }),
      400,
    );
    expect(refused.errors).toEqual([{ path: "specialUses", issue: "EXCLUDED_CASE:TAXI" }]);
  });

  it("a vehicle of more than thirty years reaches the queue RED, with the reason", async () => {
    const request = await privateRequestReady("EP111AA", ["epoca", "giulia-neri", "giulia-neri"]);
    await giveConsent(request.id);
    const submitted = await json<{ autoOutcome: string }>(
      await call(asLuca(), `/requests/${request.id}/submit`, { body: {} }),
      200,
    );
    expect(submitted.autoOutcome).toBe("RED");
    const verification = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.verification.findFirstOrThrow({ where: { quoteRequestId: request.id } }),
    );
    expect(verification.checklist).toContainEqual(
      expect.objectContaining({ code: "EXCLUDED_CASES", outcome: "RED", reasons: ["VINTAGE"] }),
    );
  });

  it("a document read with low confidence turns the request YELLOW, with the fields highlighted", async () => {
    const request = await privateRequestReady("GN123AB", [
      "giulia-neri",
      "giulia-neri-low-confidence",
      "giulia-neri",
    ]);
    await giveConsent(request.id);
    const submitted = await json<{ autoOutcome: string }>(
      await call(asLuca(), `/requests/${request.id}/submit`, { body: {} }),
      200,
    );
    expect(submitted.autoOutcome).toBe("YELLOW");
    const verification = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.verification.findFirstOrThrow({ where: { quoteRequestId: request.id } }),
    );
    const documents = (verification.checklist as { code: string; fields: string[] }[]).find(
      (i) => i.code === "DOCUMENTS",
    );
    expect(documents?.fields).toContain("documents.DRIVING_LICENCE.0.number");
  });

  it("another private user never sees Giulia's request", async () => {
    const request = await privateRequestReady();
    const elena = await h.tokenFor("private-elena-sala");
    await acceptAllLegal(h, "private-elena-sala");
    expect((await call({ token: elena }, `/requests/${request.id}`)).status).toBe(404);
    const list = await json<{ id: string }[]>(await call({ token: elena }, "/requests"), 200);
    expect(list.map((r) => r.id)).not.toContain(request.id);
  });
});

describe("fase 2: broker requests and the customer's consent", () => {
  const annaFiscalCode = buildFiscalCode({
    surname: "Riva",
    givenName: "Anna",
    birthDate: "1985-09-03",
    sex: "F",
    birthPlaceCadastralCode: "H501",
  });
  let annaId: string;

  it("Paolo creates the customer Anna Riva: fiscal code, phone and email encrypted, exact search by fiscal code", async () => {
    const created = await json<{ id: string }>(
      await call(asPaolo(), "/customers", {
        body: {
          kind: "PERSON",
          surname: "Riva",
          givenName: "Anna",
          fiscalCode: annaFiscalCode,
          email: "anna.riva@example.test",
          phone: "+39 333 000 0042",
        },
      }),
      201,
    );
    annaId = created.id;
    const stored = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.customer.findUniqueOrThrow({ where: { id: annaId }, include: { person: true } }),
    );
    expect(stored.emailEnc).not.toContain("anna");
    expect(stored.phoneEnc).not.toContain("333");
    expect(stored.person.fiscalCodeEnc).not.toContain(annaFiscalCode);
    expect(cipher.decrypt(stored.person.fiscalCodeEnc ?? "")).toBe(annaFiscalCode);

    const found = await json<{ id: string }[]>(
      await call(asPaolo(), `/customers?q=${annaFiscalCode.toLowerCase()}`),
      200,
    );
    expect(found.map((c) => c.id)).toEqual([annaId]);
    const duplicate = await call(asPaolo(), "/customers", {
      body: { kind: "PERSON", surname: "Riva", givenName: "Anna", fiscalCode: annaFiscalCode },
    });
    expect(duplicate.status).toBe(409);
  });

  it("Paolo sends the consent link; Anna opens it, gets a code and confirms; the request goes to the queue", async () => {
    const request = await json<{ id: string }>(
      await call(asPaolo(), "/requests", { body: { customerId: annaId } }),
      201,
    );
    const base = await giuliaQuote(asPaolo(), "AR456CD");
    const anna = {
      kind: "PERSON" as const,
      surname: "Riva",
      givenName: "Anna",
      fiscalCode: annaFiscalCode,
      birthDate: "1985-09-03",
      birthPlace: "058091",
      sex: "F" as const,
      residence: {
        street: "Via degli Esempi 22",
        postalCode: "00184",
        municipalityIstat: "058091",
        province: "RM",
      },
    };
    const quote: QuoteData = {
      ...base,
      policyHolder: anna,
      drivers: base.drivers.map((d) => ({ ...d, person: anna })),
      history: { ...base.history, cuClass: 4 },
    };
    await saveAll(asPaolo(), request.id, quote);
    await json(
      await upload(asPaolo(), request.id, "REGISTRATION_CERTIFICATE", "libretto-anna-riva.jpg"),
      201,
    );
    await json(
      await upload(asPaolo(), request.id, "DRIVING_LICENCE", "patente-anna-riva.jpg", 0),
      201,
    );
    await json(
      await upload(asPaolo(), request.id, "RISK_CERTIFICATE", "attestato-anna-riva.pdf"),
      201,
    );

    await json(await call(asPaolo(), `/requests/${request.id}/consent/link`, { body: {} }), 200);
    const email = [...h.email.sent].reverse().find((m) => m.to === "anna.riva@example.test");
    expect(email?.subject).toContain("ti chiede il consenso");
    expect(h.email.sent.some((m) => m.to === "393330000042@sms.astax.test")).toBe(true);
    const token = /\/consenso\/([A-Za-z0-9_-]+)/.exec(email?.text ?? "")?.[1] ?? "";

    const summary = await json<{ status: string; broker: string; text: { contentMd: string } }>(
      await h.call(`/consent-links/${token}`),
      200,
    );
    expect(summary.status).toBe("SENT");
    expect(JSON.stringify(summary)).not.toContain("anna.riva@example.test");
    expect(JSON.stringify(summary)).not.toContain("333");

    await json(await h.call(`/consent-links/${token}/code`, { body: {} }), 204);
    const confirmed = await json<{ method: string }>(
      await h.call(`/consent-links/${token}/confirm`, {
        body: { code: lastCode("anna.riva@example.test") },
      }),
      200,
    );
    expect(confirmed.method).toBe("OTP_LINK");
    expect((await h.call(`/consent-links/${token}/code`, { body: {} })).status).toBe(409);

    const submitted = await json<{ status: string }>(
      await call(asPaolo(), `/requests/${request.id}/submit`, { body: {} }),
      200,
    );
    expect(submitted.status).toBe("IN_VERIFICATION");
  });

  it("Paolo uploads a consent already collected: the back office checks it (CONSENT item yellow)", async () => {
    const other = await json<{ id: string }>(
      await call(asPaolo(), "/customers", {
        body: {
          kind: "PERSON",
          surname: "Neri",
          givenName: "Giulia",
          fiscalCode: buildFiscalCode({
            surname: "Neri",
            givenName: "Giulia",
            birthDate: "1990-05-12",
            sex: "F",
            birthPlaceCadastralCode: "F205",
          }),
        },
      }),
      201,
    );
    const request = await json<{ id: string }>(
      await call(asPaolo(), "/requests", { body: { customerId: other.id } }),
      201,
    );
    await saveAll(asPaolo(), request.id, await giuliaQuote(asPaolo()));
    await json(
      await upload(asPaolo(), request.id, "REGISTRATION_CERTIFICATE", "libretto-giulia-neri.jpg"),
      201,
    );
    await json(
      await upload(asPaolo(), request.id, "DRIVING_LICENCE", "patente-giulia-neri.jpg", 0),
      201,
    );
    await json(
      await upload(asPaolo(), request.id, "RISK_CERTIFICATE", "attestato-giulia-neri.pdf"),
      201,
    );
    const consentDoc = await json<{ id: string }>(
      await upload(asPaolo(), request.id, "CONSENT_FORM", "consenso-firmato.pdf"),
      201,
    );
    await json(
      await call(asPaolo(), `/requests/${request.id}/consent/uploaded`, {
        body: { documentId: consentDoc.id },
      }),
      200,
    );
    const submitted = await json<{ autoOutcome: string }>(
      await call(asPaolo(), `/requests/${request.id}/submit`, { body: {} }),
      200,
    );
    expect(submitted.autoOutcome).toBe("YELLOW");
    const verification = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.verification.findFirstOrThrow({ where: { quoteRequestId: request.id } }),
    );
    expect(verification.checklist).toContainEqual(
      expect.objectContaining({
        code: "CONSENT",
        outcome: "YELLOW",
        reasons: ["CONSENT_UPLOADED_TO_CHECK"],
      }),
    );
  });

  it("VIS-13 an operator sees only own customers; the owner sees all of the broker", async () => {
    const lauras = await json<{ id: string }>(
      await call({ token: laura, context: lauraContext() }, "/customers", {
        body: { kind: "COMPANY", companyName: "Ditta Prova Srl", vatNumber: "12345678903" },
      }),
      201,
    );
    const paoloSees = await json<{ id: string }[]>(await call(asPaolo(), "/customers"), 200);
    expect(paoloSees.map((c) => c.id)).not.toContain(lauras.id);
    expect((await call(asPaolo(), `/customers/${lauras.id}`)).status).toBe(404);
    const lauraSees = await json<{ id: string }[]>(
      await call({ token: laura, context: lauraContext() }, "/customers"),
      200,
    );
    expect(lauraSees.map((c) => c.id)).toEqual(expect.arrayContaining([lauras.id, annaId]));
  });

  it("the customer card shows contacts and consents to the broker, and the opening is logged", async () => {
    const card = await json<{ contacts: { email: string }; consents: { method: string }[] }>(
      await call(asPaolo(), `/customers/${annaId}`),
      200,
    );
    expect(card.contacts.email).toBe("anna.riva@example.test");
    expect(card.consents.map((c) => c.method)).toContain("OTP_LINK");
    const logged = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.auditLog.count({ where: { action: "CUSTOMER_VIEWED", targetId: annaId } }),
    );
    expect(logged).toBeGreaterThan(0);
  });
});
