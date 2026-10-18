import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { buildFiscalCode, buildVatNumber, BULK_CSV_HEADER } from "@astax/shared/domain";
import { zipSync, strToU8 } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 7: the broker's bulk upload, a ZIP with the CSV and the documents:
// checked whole before writing; customers (new or existing) and drafts with
// their documents; the upload in the audit log.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let broker: Who;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  await acceptAllLegal(h, "broker-owner");
  broker = {
    token: await h.tokenFor("broker-owner"),
    context: membershipId("broker-owner", "broker-demo"),
  };
});

afterAll(async () => {
  await h.close();
});

const send = (body: Uint8Array) =>
  fetch(`${h.baseUrl}/broker/bulk-uploads`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${broker.token}`,
      "x-astax-context": broker.context ?? "",
      "content-type": "application/zip",
    },
    body,
  });

const cf = buildFiscalCode({
  surname: "Caricati",
  givenName: "Bruno",
  birthDate: "1975-03-04",
  sex: "M",
  birthPlaceCadastralCode: "F205",
});
const vat = buildVatNumber(7171, 3);

describe("phase 7 broker bulk upload", () => {
  it("refuses the whole file when a row is wrong or a document is missing", async () => {
    const before = await system((tx) => tx.quoteRequest.count());
    const csv = [
      BULK_CSV_HEADER,
      `persona;Caricati;Bruno;;${cf};;bruno.caricati@example.test;;FG123HL;libretto-bruno.jpg;;`,
      "persona;Sbagliato;;;NONVALIDO;;;;;;;",
    ].join("\n");
    const zip = zipSync({ "clienti.csv": strToU8(csv) });
    const refused = await r.json<{ errors: { path: string; issue: string }[] }>(
      await send(zip),
      400,
    );
    expect(refused.errors).toEqual(
      expect.arrayContaining([
        { path: "riga 2: libretto", issue: "NOT_IN_ZIP" },
        { path: "riga 3: codice_fiscale", issue: "INVALID_FISCAL_CODE" },
      ]),
    );
    expect(await system((tx) => tx.quoteRequest.count())).toBe(before);
  });

  it("creates customers and drafts with their documents; an existing customer is reused", async () => {
    const csv = [
      BULK_CSV_HEADER,
      `persona;Caricati;Bruno;;${cf};;bruno.caricati@example.test;+393331112233;FG123HL;libretto-bruno.jpg;patente-bruno.jpg;attestato-bruno.pdf`,
      `società;;;Trasporti Carico Srl;;${vat};;;FG456HL;;;`,
    ].join("\n");
    const zip = zipSync({
      "clienti.csv": strToU8(csv),
      "documenti/libretto-bruno.jpg": JPEG,
      "documenti/patente-bruno.jpg": JPEG,
      "documenti/attestato-bruno.pdf": JPEG,
    });
    const done = await r.json<{
      rows: number;
      results: {
        line: number;
        customer: string;
        code: string;
        documents: number;
        requestId: string;
      }[];
    }>(await send(zip), 201);
    expect(done.rows).toBe(2);
    expect(done.results[0]).toMatchObject({ line: 2, customer: "CREATED", documents: 3 });
    expect(done.results[1]).toMatchObject({ line: 3, customer: "CREATED", documents: 0 });
    const draft = await system((tx) =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: done.results[0]?.requestId ?? "" } }),
    );
    expect(draft).toMatchObject({ status: "DRAFT", channel: "BROKER", plate: "FG123HL" });
    const docs = await system((tx) =>
      tx.document.findMany({ where: { quoteRequestId: draft.id } }),
    );
    expect(docs.map((d) => d.kind).sort()).toEqual([
      "DRIVING_LICENCE",
      "REGISTRATION_CERTIFICATE",
      "RISK_CERTIFICATE",
    ]);

    // The same customer again: a new draft for the existing customer.
    const again = await r.json<{ results: { customer: string }[] }>(
      await send(
        strToU8([BULK_CSV_HEADER, `persona;Caricati;Bruno;;${cf};;;;FG789HL;;;`].join("\n")),
      ),
      201,
    );
    expect(again.results[0]?.customer).toBe("EXISTING");
    const logged = await system((tx) =>
      tx.auditLog.findFirst({
        where: { action: "BULK_UPLOAD_DONE", after: { path: ["rows"], equals: 2 } },
        orderBy: { seq: "desc" },
      }),
    );
    expect(logged?.after).toMatchObject({ rows: 2, newCustomers: 2, documents: 3 });
  });

  it("is only for brokers", async () => {
    await acceptAllLegal(h, "agenzia-uno-owner");
    const agency: Who = {
      token: await h.tokenFor("agenzia-uno-owner"),
      context: membershipId("agenzia-uno-owner", "agenzia-uno"),
    };
    expect((await r.call(agency, "/broker/bulk-uploads", { body: {} })).status).toBe(403);
  });
});
