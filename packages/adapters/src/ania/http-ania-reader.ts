import type {
  AniaFailure,
  AniaReadInput,
  AniaReaderPort,
  AniaReadResult,
  AniaRecordData,
} from "./ania-reader.js";

/**
 * The real ANIA reader (Dan, 2026-10-28, written consent of Allianz): the bot
 * of the agencies' portal, kept in a private repository and running next to
 * the API on the internal network. It speaks the contract of the bot built
 * for CorteXa:
 *   POST /ania/consultazioni?attendi=1  { targa, praticaId, operatoreId }
 *   GET  /ania/consultazioni/:jobId     while the answer is 202
 * and answers with its «scheda», turned here into `AniaRecordData`. No plate,
 * no answer and no token reaches the logs.
 */
export interface HttpAniaReaderOptions {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
  /** Each call; the reading itself may take tens of seconds. */
  timeoutMs?: number;
  /** How long to keep asking for a reading still in the queue. */
  waitMs?: number;
  pauseMs?: number;
}

type Special = "N.A." | "N.D." | "--";
type Cell = number | Special | null;
type Company = { codice: string | null; nome: string | null } | null;

/** The part of the bot's «scheda» the sheet needs (connectors/ania/schema.ts). */
export interface BotScheda {
  targa: string;
  consultatoIl: string;
  datiPreventivo: { modello: string | null; allestimento: string | null };
  veicolo: {
    descrizione: string | null;
    categoriaUso: string | null;
    alimentazione: string | null;
    cilindrataCc: number | null;
    potenzaMaxKw: number | null;
    pesoPienoCaricoKg: number | null;
  };
  intestatario: {
    codiceFiscale: string | null;
    comuneResidenza: string | null;
    provinciaResidenza: string | null;
  };
  immatricolazione: {
    primaImmatricolazione: string | null;
    storico: { dataEmissione: string | null; codiceFiscaleIntestatario: string | null }[];
  };
  coperture: {
    ultima: {
      impresa: Company;
      contraenteCf: string | null;
      scadenzaCopertura: string | null;
      scadenzaContratto: string | null;
    } | null;
  };
  attestati: {
    ultimo: {
      impresa: Company;
      contraenteCf: string | null;
      tipoVeicolo: string | null;
      aventeDirittoNome: string | null;
      aventeDirittoCf: string | null;
      classeAssegnazione: string | null;
      classeAssegnazioneCu: string | null;
      sinistrosita: {
        anno: number;
        gruppo: "principale" | "paritaria";
        totale: Cell;
        cose: Cell;
        persone: Cell;
        personeECose: Cell;
      }[];
    } | null;
  };
}

const company = (c: Company) => (c ? { code: c.codice, name: c.nome } : null);

export function recordFromScheda(s: BotScheda): AniaRecordData {
  const cover = s.coperture.ultima;
  const certificate = s.attestati.ultimo;
  return {
    plate: s.targa,
    readAt: s.consultatoIl,
    vehicle: {
      description: s.veicolo.descrizione,
      categoryUse: s.veicolo.categoriaUso,
      fuel: s.veicolo.alimentazione,
      displacementCc: s.veicolo.cilindrataCc,
      maxPowerKw: s.veicolo.potenzaMaxKw,
      fullLoadWeightKg: s.veicolo.pesoPienoCaricoKg,
      model: s.datiPreventivo.modello,
      version: s.datiPreventivo.allestimento,
    },
    owner: {
      fiscalCode: s.intestatario.codiceFiscale,
      residenceMunicipality: s.intestatario.comuneResidenza,
      residenceProvince: s.intestatario.provinciaResidenza,
    },
    registration: {
      firstRegistrationDate: s.immatricolazione.primaImmatricolazione,
      history: s.immatricolazione.storico.map((r) => ({
        issuedOn: r.dataEmissione,
        ownerFiscalCode: r.codiceFiscaleIntestatario,
      })),
    },
    latestCover: cover
      ? {
          company: company(cover.impresa),
          policyHolderFiscalCode: cover.contraenteCf,
          coverExpiry: cover.scadenzaCopertura,
          contractExpiry: cover.scadenzaContratto,
        }
      : null,
    latestCertificate: certificate
      ? {
          company: company(certificate.impresa),
          policyHolderFiscalCode: certificate.contraenteCf,
          vehicleType: certificate.tipoVeicolo,
          entitledName: certificate.aventeDirittoNome,
          entitledFiscalCode: certificate.aventeDirittoCf,
          assignedClass: certificate.classeAssegnazione,
          assignedClassCu: certificate.classeAssegnazioneCu,
          claims: certificate.sinistrosita.map((r) => ({
            year: r.anno,
            group: r.gruppo === "principale" ? ("MAIN" as const) : ("SHARED" as const),
            total: r.totale,
            things: r.cose,
            people: r.persone,
            peopleAndThings: r.personeECose,
          })),
        }
      : null,
  };
}

/** The bot's error codes (connectors/ania/errors.ts) as the port's failures. */
export function failureOf(code: string | undefined): AniaFailure {
  if (code === "NOT_FOUND") return "NOT_FOUND";
  if (code === "INVALID_INPUT") return "INVALID_PLATE";
  if (code === "SESSION_EXPIRED") return "SESSION_EXPIRED";
  return "PROVIDER_ERROR";
}

interface BotAnswer {
  jobId?: string;
  stato?: string;
  codice?: string;
  scheda?: BotScheda;
}

export class HttpAniaReader implements AniaReaderPort {
  readonly #fetch: typeof fetch;

  constructor(private readonly options: HttpAniaReaderOptions) {
    this.#fetch = options.fetch ?? fetch;
  }

  private async call(path: string, body?: unknown): Promise<{ status: number; data: BotAnswer }> {
    try {
      const response = await this.#fetch(`${this.options.baseUrl}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          authorization: `Bearer ${this.options.token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "manual",
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 45_000),
      });
      const data = (await response.json().catch(() => ({}))) as BotAnswer;
      return { status: response.status, data };
    } catch {
      return { status: 0, data: {} };
    }
  }

  private answer(status: number, data: BotAnswer): AniaReadResult | null {
    if (status === 200 && data.scheda)
      return { found: true, record: recordFromScheda(data.scheda) };
    if (status === 202) return null;
    return { found: false, reason: failureOf(data.codice) };
  }

  async read(input: AniaReadInput): Promise<AniaReadResult> {
    const plate = input.plate.replace(/[\s.-]/g, "").toUpperCase();
    if (!/^[A-Z0-9]{4,10}$/.test(plate)) return { found: false, reason: "INVALID_PLATE" };
    const first = await this.call("/ania/consultazioni?attendi=1", {
      targa: plate,
      praticaId: input.requestId,
      operatoreId: input.operatorId,
    });
    const done = this.answer(first.status, first.data);
    if (done) return done;
    const jobId = first.data.jobId;
    if (!jobId || !/^[\w-]{1,100}$/.test(jobId)) return { found: false, reason: "PROVIDER_ERROR" };
    const pause = this.options.pauseMs ?? 2_000;
    for (let i = 0; i < Math.ceil((this.options.waitMs ?? 60_000) / pause); i++) {
      await new Promise((r) => setTimeout(r, pause));
      const next = await this.call(`/ania/consultazioni/${jobId}`);
      const result = this.answer(next.status, next.data);
      if (result) return result;
    }
    return { found: false, reason: "PROVIDER_ERROR" };
  }
}
