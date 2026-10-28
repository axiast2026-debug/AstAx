import { describe, expect, it } from "vitest";
import { ManualClock } from "../clock/manual-clock.js";
import { FakeAniaReader, type AniaReaderPort } from "../ania/ania-reader.js";
import { HttpAniaReader, type BotScheda } from "../ania/http-ania-reader.js";

// Dan, 2026-10-28: what every ANIA reader must do, then the real one against a
// simulated bot (invented data only, rule 11).
const ids = { requestId: "01a1826d-daed-77d6-86b9-3b0bf39a4c83", operatorId: "op-1" };

function aniaContract(make: () => AniaReaderPort) {
  it("contract: a known plate gives the record; an unknown one NOT_FOUND; a malformed one INVALID_PLATE", async () => {
    const reader = make();
    const found = await reader.read({ ...ids, plate: "GN123AB" });
    expect(found.found).toBe(true);
    if (found.found) {
      expect(found.record.plate).toBe("GN123AB");
      expect(found.record.vehicle.description).not.toBe("");
    }
    expect(await reader.read({ ...ids, plate: "ZZ000ZZ" })).toEqual({
      found: false,
      reason: "NOT_FOUND",
    });
    expect(await reader.read({ ...ids, plate: "??" })).toEqual({
      found: false,
      reason: "INVALID_PLATE",
    });
  });
}

const scheda: BotScheda = {
  targa: "GN123AB",
  consultatoIl: "2026-10-28T10:00:00.000+01:00",
  datiPreventivo: { modello: "MODELLO UNO", allestimento: "1.2 BASE" },
  veicolo: {
    descrizione: "MARCA PROVA",
    categoriaUso: "AUTOVETTURA PER TRASPORTO DI PERSONE / PROPRIO",
    alimentazione: "BENZINA",
    cilindrataCc: 1199,
    potenzaMaxKw: 51,
    pesoPienoCaricoKg: 1500,
  },
  intestatario: {
    codiceFiscale: "PRVMRA80A01H501X",
    comuneResidenza: "ROMA",
    provinciaResidenza: "RM",
  },
  immatricolazione: {
    primaImmatricolazione: "2018-05-02",
    storico: [{ dataEmissione: "2020-02-01", codiceFiscaleIntestatario: "PRVMRA80A01H501X" }],
  },
  coperture: {
    ultima: {
      impresa: { codice: "901", nome: "COMPAGNIA ALFA" },
      contraenteCf: "PRVMRA80A01H501X",
      scadenzaCopertura: "2027-03-31",
      scadenzaContratto: "2027-03-31",
    },
  },
  attestati: {
    ultimo: {
      impresa: { codice: "901", nome: null },
      contraenteCf: "PRVMRA80A01H501X",
      tipoVeicolo: "AUTOVETTURA",
      aventeDirittoNome: "PROVA MARIO",
      aventeDirittoCf: "PRVMRA80A01H501X",
      classeAssegnazione: "1",
      classeAssegnazioneCu: "1",
      sinistrosita: [
        { anno: 2026, gruppo: "principale", totale: null, cose: 0, persone: 0, personeECose: "--" },
        {
          anno: 2026,
          gruppo: "paritaria",
          totale: null,
          cose: "N.D.",
          persone: 0,
          personeECose: 0,
        },
      ],
    },
  },
};

/** The bot: answers at once, or 202 first and then the result, or an error code. */
function simulatedBot(mode: "now" | "queue" = "now") {
  const calls: { url: string; auth: string | null; body: unknown }[] = [];
  const fetchStub = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({
      url: u,
      auth: new Headers(init?.headers).get("authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (u.endsWith("/ania/consultazioni/job-7")) {
      return Response.json({ jobId: "job-7", stato: "completato", scheda });
    }
    const targa = (JSON.parse(String(init?.body ?? "{}")) as { targa?: string }).targa;
    if (targa === "ZZ000ZZ") {
      return Response.json({ stato: "errore", codice: "NOT_FOUND" }, { status: 404 });
    }
    if (targa === "SS000SS") {
      return Response.json({ stato: "errore", codice: "SESSION_EXPIRED" }, { status: 503 });
    }
    if (mode === "queue")
      return Response.json({ jobId: "job-7", stato: "in_coda" }, { status: 202 });
    return Response.json({ stato: "completato", daCache: false, scheda });
  }) as typeof fetch;
  return { calls, fetch: fetchStub };
}

describe("ANIA readers", () => {
  describe("fake", () =>
    aniaContract(() => new FakeAniaReader(new ManualClock("2026-10-28T08:00:00Z"))));
  describe("HTTP, simulated bot", () =>
    aniaContract(
      () => new HttpAniaReader({ baseUrl: "http://bot", token: "t", fetch: simulatedBot().fetch }),
    ));

  it("sends plate, request and operator with the token, and turns the scheda into the record", async () => {
    const bot = simulatedBot();
    const reader = new HttpAniaReader({
      baseUrl: "http://bot",
      token: "secret-token",
      fetch: bot.fetch,
    });
    const result = await reader.read({ ...ids, plate: "gn 123 ab" });
    expect(bot.calls[0]).toEqual({
      url: "http://bot/ania/consultazioni?attendi=1",
      auth: "Bearer secret-token",
      body: { targa: "GN123AB", praticaId: ids.requestId, operatoreId: "op-1" },
    });
    if (!result.found) throw new Error("expected a record");
    expect(result.record.vehicle).toMatchObject({
      description: "MARCA PROVA",
      model: "MODELLO UNO",
    });
    expect(result.record.latestCover?.company).toEqual({ code: "901", name: "COMPAGNIA ALFA" });
    expect(result.record.latestCertificate?.claims[1]).toEqual({
      year: 2026,
      group: "SHARED",
      total: null,
      things: "N.D.",
      people: 0,
      peopleAndThings: 0,
    });
  });

  it("waits for a reading still in the queue; tells an expired session", async () => {
    const queued = new HttpAniaReader({
      baseUrl: "http://bot",
      token: "t",
      fetch: simulatedBot("queue").fetch,
      pauseMs: 1,
    });
    expect((await queued.read({ ...ids, plate: "GN123AB" })).found).toBe(true);
    const reader = new HttpAniaReader({
      baseUrl: "http://bot",
      token: "t",
      fetch: simulatedBot().fetch,
    });
    expect(await reader.read({ ...ids, plate: "SS000SS" })).toEqual({
      found: false,
      reason: "SESSION_EXPIRED",
    });
  });

  it("a bot that does not answer is a provider error", async () => {
    const down = new HttpAniaReader({
      baseUrl: "http://bot",
      token: "t",
      fetch: (async () => {
        throw new Error("connection refused");
      }) as typeof fetch,
    });
    expect(await down.read({ ...ids, plate: "GN123AB" })).toEqual({
      found: false,
      reason: "PROVIDER_ERROR",
    });
  });
});
