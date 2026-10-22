import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { addCalendarDays, BATCH_COLUMNS, buildFiscalCode, romeInstant } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BatchSchedulerService } from "../../src/requests/batch-scheduler.service.js";
import { readXlsx, writeXlsx } from "../../src/requests/xlsx.js";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// ADR 0014, Dan 2026-10-21 (docs/piano-broker.md C-E): the broker uploads
// the renewals of the month in AstAx's Excel format; each row becomes a draft
// scheduled 7 days before the expiry, with the documents asked 3 days before.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let broker: Who;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);

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
  fetch(`${h.baseUrl}/broker/batches`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${broker.token}`,
      "x-astax-context": broker.context ?? "",
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "x-file-name": encodeURIComponent("rinnovi dicembre.xlsx"),
    },
    body,
  });

const fiscalCode = (givenName: string, birthDate: string) =>
  buildFiscalCode({
    surname: "Lotto",
    givenName,
    birthDate,
    sex: "F",
    birthPlaceCadastralCode: "H501",
  });

const row = (
  plate: string,
  expiry: string,
  givenName: string,
  overrides: Record<number, string> = {},
) => {
  const base = [
    plate,
    expiry,
    "Lotto",
    givenName,
    fiscalCode(givenName, "1980-04-12"),
    "",
    "",
    "Via dei Lotti 1",
    "00184",
    "Roma",
    "RM",
    "Guida libera",
    "",
    "",
  ];
  return base.map((v, i) => overrides[i] ?? v);
};

describe("broker plan, step 4: lots from Excel (ADR 0014)", () => {
  it("the template has the columns and, on a second sheet, the accepted values", async () => {
    const response = await r.call(broker, "/broker/batches/template");
    expect(response.status).toBe(200);
    const table = readXlsx(new Uint8Array(await response.arrayBuffer()));
    expect(table[0]).toEqual([...BATCH_COLUMNS]);
  });

  it("a wrong row refuses the whole file and says where", async () => {
    const today = romeCalendarDate(h.clock.now());
    const before = await system((tx) => tx.quoteRequest.count());
    const file = writeXlsx([
      {
        name: "Richieste",
        rows: [
          [...BATCH_COLUMNS],
          row("LT100AA", addCalendarDays(today, 40), "Alba"),
          row("LT100AB", addCalendarDays(today, 40), "Bice", { 9: "Atlantide" }),
        ],
      },
    ]);
    const refused = await r.json<{ errors: { path: string; issue: string }[] }>(
      await send(file),
      400,
    );
    expect(refused.errors).toEqual([{ path: "riga 3: comune", issue: "MUNICIPALITY_NOT_FOUND" }]);
    expect(await system((tx) => tx.quoteRequest.count())).toBe(before);
  });

  it("each row becomes a scheduled draft of the lot, with its customer and essential data", async () => {
    const today = romeCalendarDate(h.clock.now());
    const expiry = addCalendarDays(today, 40);
    const soon = addCalendarDays(today, 5);
    const file = writeXlsx([
      {
        name: "Richieste",
        rows: [
          [...BATCH_COLUMNS],
          row("LT200AA", expiry, "Carla", { 12: "Cristalli" }),
          row("LT200AB", soon, "Dora"),
        ],
      },
    ]);
    const done = await r.json<{
      id: string;
      code: string;
      rows: number;
      results: { requestId: string }[];
    }>(await send(file), 201);
    expect(done.code).toMatch(/^LT-\d{4}-\d{6}$/);
    expect(done.rows).toBe(2);

    const [carla, dora] = await system((tx) =>
      Promise.all(
        done.results.map((x) => tx.quoteRequest.findUniqueOrThrow({ where: { id: x.requestId } })),
      ),
    );
    expect(carla).toMatchObject({
      status: "DRAFT",
      channel: "BROKER",
      batchId: done.id,
      batchLine: 2,
      plate: "LT200AA",
    });
    // Answer 6: the auction 7 days before the expiry, the documents 3 days before the auction.
    expect(carla?.scheduledSubmitAt).toEqual(romeInstant(addCalendarDays(expiry, -7), "09:00"));
    expect(carla?.documentsDueAt).toEqual(romeInstant(addCalendarDays(expiry, -10), "09:00"));
    // An expiry too close: as soon as possible.
    expect(dora?.scheduledSubmitAt).toEqual(romeInstant(today, "09:00"));

    const detail = await r.json<{
      draft: { intake: Record<string, unknown>; request: Record<string, unknown> };
    }>(await r.call(broker, `/requests/${carla?.id}`), 200);
    expect(detail.draft.intake).toMatchObject({
      vehicleStatus: "INSURED",
      plate: "LT200AA",
      ownerBirthDate: "1980-04-12",
      drivingFormula: "FREE",
      residence: { municipalityIstat: "058091", province: "RM" },
    });
    expect(detail.draft.request).toMatchObject({
      packageCode: "CUSTOM",
      coverages: ["glass"],
      startDate: expiry,
      startMode: "DATE",
    });

    const lots = await r.json<{ code: string; rows: number; statuses: Record<string, number> }[]>(
      await r.call(broker, "/broker/batches"),
      200,
    );
    expect(lots[0]).toMatchObject({ code: done.code, rows: 2, statuses: { DRAFT: 2 } });
    const found = await r.json<{ code: string; batch: string; scheduledSubmitAt: string }[]>(
      await r.call(broker, "/requests/search", { body: { batchId: done.id } }),
      200,
    );
    expect(found).toHaveLength(2);
    expect(found.every((x) => x.batch === done.code && x.scheduledSubmitAt)).toBe(true);
    const logged = await system((tx) =>
      tx.auditLog.findFirst({ where: { action: "BATCH_UPLOADED", targetId: done.id } }),
    );
    expect(logged).not.toBeNull();
  });

  it("answers 4 and 6: on its days the draft asks for the documents, then leaves without them", async () => {
    const today = romeCalendarDate(h.clock.now());
    const file = writeXlsx([
      {
        name: "Richieste",
        rows: [[...BATCH_COLUMNS], row("LT300AA", addCalendarDays(today, 5), "Elsa")],
      },
    ]);
    const done = await r.json<{ results: { requestId: string }[] }>(await send(file), 201);
    const id = done.results[0]?.requestId ?? "";
    const scheduler = h.app.get(BatchSchedulerService);
    const sent = h.email.sent.length;
    // Dora, of the lot above, is due today too.
    expect(await scheduler.run()).toMatchObject({ reminded: 2, submitted: 2, postponed: 0 });
    expect(h.email.sent.slice(sent).some((m) => m.subject.startsWith("Carica i documenti"))).toBe(
      true,
    );
    const request = await system((tx) => tx.quoteRequest.findUniqueOrThrow({ where: { id } }));
    expect(request).toMatchObject({ status: "IN_VERIFICATION", withoutDocuments: true });
    expect(request.documentsNotifiedAt).not.toBeNull();
    const logged = await system((tx) =>
      tx.auditLog.findFirst({ where: { action: "BATCH_REQUEST_SCHEDULED_SUBMIT", targetId: id } }),
    );
    expect(logged?.after).toMatchObject({ outcome: "SUBMITTED" });
    // Nothing twice.
    expect(await scheduler.run()).toMatchObject({ reminded: 0, submitted: 0 });
  });

  it("only a requester organization uploads lots (a broker or, ADR 0015, an agency)", async () => {
    await acceptAllLegal(h, "bo-verifier");
    const staff = {
      token: await h.tokenFor("bo-verifier"),
      context: membershipId("bo-verifier", "astax"),
    };
    expect((await r.call(staff, "/broker/batches")).status).toBe(403);
  });
});
