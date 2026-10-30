import { createHash } from "node:crypto";
import type { Clock } from "../clock/clock.js";
import { FAKE_INSURERS, FakePlateLookup } from "../vehicle-data/plate-lookup.js";

/**
 * The Banca Dati ANIA read by plate (Dan, 2026-10-28,
 * docs/piano-back-office-verifica.md). The real reader is the bot of the
 * agencies' portal, in a private repository, reached over HTTP
 * (`HttpAniaReader`), with the written consent of the portal's owner;
 * development and tests use only the fake (rule 9). The API checks every
 * answer with `AniaRecordSchema` (@astax/shared/domain) and derives the
 * sheet from it.
 */
type SpecialCode = "N.A." | "N.D." | "--";
type Company = { code: string | null; name: string | null } | null;
type ClaimCell = number | SpecialCode | null;

export interface AniaRecordData {
  plate: string;
  readAt: string;
  vehicle: {
    description: string | null;
    categoryUse: string | null;
    fuel: string | null;
    displacementCc: number | null;
    maxPowerKw: number | null;
    fullLoadWeightKg: number | null;
    /** Model and trim from the public quote form of Prima, when read. */
    model?: string | null;
    version?: string | null;
  };
  owner: {
    fiscalCode: string | null;
    residenceMunicipality: string | null;
    residenceProvince: string | null;
  };
  registration: {
    firstRegistrationDate: string | null;
    history: { issuedOn: string | null; ownerFiscalCode: string | null }[];
  };
  latestCover: {
    company: Company;
    policyHolderFiscalCode: string | null;
    coverExpiry: string | null;
    contractExpiry: string | null;
  } | null;
  latestCertificate: {
    company: Company;
    policyHolderFiscalCode: string | null;
    vehicleType: string | null;
    entitledName: string | null;
    entitledFiscalCode: string | null;
    assignedClass: string | null;
    assignedClassCu: string | null;
    claims: {
      year: number;
      group: "MAIN" | "SHARED";
      total: ClaimCell;
      things: ClaimCell;
      people: ClaimCell;
      peopleAndThings: ClaimCell;
    }[];
  } | null;
}

export type AniaReadResult =
  { found: true; record: AniaRecordData } | { found: false; reason: AniaFailure };

/** SESSION_EXPIRED: the portal wants a new manual login before any reading. */
export type AniaFailure = "NOT_FOUND" | "INVALID_PLATE" | "PROVIDER_ERROR" | "SESSION_EXPIRED";

export interface AniaReadInput {
  plate: string;
  /** For the reader's own register: the request and the operator, identifiers only. */
  requestId: string;
  operatorId: string;
  owner?: { fiscalCode: string; fullName: string } | null;
}

export interface AniaReaderPort {
  /**
   * `owner` is what the request says of the vehicle owner. A real reader
   * ignores it; the fake answers with that person, so that the sheet of a
   * synthetic request agrees with it.
   */
  read(input: AniaReadInput): Promise<AniaReadResult>;
}

/**
 * Dan, 2026-10-28: the portal does not let a session saved elsewhere be
 * reused, so the back office logs in on the server, through a remote screen
 * of the reader's browser. Only the real reader has one.
 */
export type AniaLoginState = "LOGIN" | "READY" | "BLOCKED" | "UNKNOWN";
export type AniaLoginAction =
  | { kind: "click"; x: number; y: number }
  | { kind: "text"; text: string }
  | { kind: "key"; key: AniaLoginKey }
  | { kind: "scroll"; dy: number };
export const ANIA_LOGIN_KEYS = [
  "Enter",
  "Tab",
  "Backspace",
  "Delete",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
] as const;
export type AniaLoginKey = (typeof ANIA_LOGIN_KEYS)[number];

export interface AniaLoginPort {
  open(): Promise<{ state: AniaLoginState; screen: { width: number; height: number } } | null>;
  state(): Promise<AniaLoginState | null>;
  screen(): Promise<Uint8Array | null>;
  act(action: AniaLoginAction): Promise<AniaLoginState | null>;
}

export const FAKE_ANIA_NOT_FOUND = "ZZ000ZZ";
export const FAKE_ANIA_PROVIDER_ERROR = "XX999XX";
/** Fake plates starting with these letters have no certificate (first policy). */
export const FAKE_ANIA_NO_CERTIFICATE_PREFIX = "NV";

const FUELS: Record<string, string> = {
  PETROL: "BENZINA",
  DIESEL: "GASOLIO",
  HYBRID: "IBRIDO BENZINA/ELETTRICO",
  LPG: "BENZINA/GPL",
  ELECTRIC: "ELETTRICO",
};
const INSURER_CODES: Record<string, string> = {
  "Compagnia Alfa": "901",
  "Compagnia Beta": "902",
  "Compagnia Gamma": "903",
  "Compagnia Delta": "904",
};

/**
 * Fake: the vehicle, the insurer and the expiry are those of the fake plate
 * lookup, so the two readers agree; the owner is the one of the request (or
 * none); class, claims and residence come from a hash of the plate. The same
 * plate always gives the same answer.
 */
export class FakeAniaReader implements AniaReaderPort {
  readonly #plates: FakePlateLookup;

  constructor(
    private readonly clock: Clock,
    private readonly insurers: readonly string[] = FAKE_INSURERS,
  ) {
    this.#plates = new FakePlateLookup(clock, insurers);
  }

  async read(input: AniaReadInput): Promise<AniaReadResult> {
    const plate = input.plate.replace(/[\s.-]/g, "").toUpperCase();
    if (!/^[A-Z0-9]{4,10}$/.test(plate)) return { found: false, reason: "INVALID_PLATE" };
    if (plate === FAKE_ANIA_NOT_FOUND) return { found: false, reason: "NOT_FOUND" };
    if (plate === FAKE_ANIA_PROVIDER_ERROR) return { found: false, reason: "PROVIDER_ERROR" };
    const looked = await this.#plates.lookup({ plate });
    if (!looked.found) return looked;
    const hash = createHash("sha256").update(`ania:${plate}`).digest();
    const n = (i: number) => hash.readUInt16BE(i * 2);
    const vehicle = looked.vehicle;
    const first = vehicle.firstRegistrationDate ?? null;
    const owner = input.owner?.fiscalCode ?? null;
    const insurer = looked.insurance?.companyName ?? this.insurers[0] ?? "";
    const company = {
      code: INSURER_CODES[insurer] ?? String(900 + this.insurers.indexOf(insurer) + 1),
      name: insurer.toUpperCase(),
    };
    const expiry = looked.insurance?.expiryDate ?? null;
    const year = Number(this.clock.now().toISOString().slice(0, 4));
    // A used vehicle: the owner bought it some years after the first registration.
    const purchase = first
      ? `${Math.min(year - 1, Number(first.slice(0, 4)) + (n(0) % 4))}${first.slice(4)}`
      : null;
    const firstPolicy = plate.startsWith(FAKE_ANIA_NO_CERTIFICATE_PREFIX);
    const classCu = 1 + (n(1) % 4 === 0 ? n(2) % 14 : 0);
    const mainClaims = n(3) % 5 === 0 ? 1 : 0;
    return {
      found: true,
      record: {
        plate,
        readAt: this.clock.now().toISOString(),
        vehicle: {
          description: vehicle.make.toUpperCase(),
          categoryUse: "AUTOVETTURA PER TRASPORTO DI PERSONE / PROPRIO",
          fuel: vehicle.fuel ? (FUELS[vehicle.fuel] ?? null) : null,
          displacementCc: vehicle.displacementCc ?? null,
          maxPowerKw: vehicle.powerKw ?? null,
          fullLoadWeightKg: 1400 + (n(4) % 6) * 100,
          model: vehicle.model.toUpperCase(),
          version: vehicle.version?.toUpperCase() ?? null,
        },
        owner: {
          fiscalCode: owner,
          residenceMunicipality: owner ? "ROMA" : null,
          residenceProvince: owner ? "RM" : null,
        },
        registration: {
          firstRegistrationDate: first,
          history: [
            ...(first && purchase !== first ? [{ issuedOn: first, ownerFiscalCode: "N.D." }] : []),
            ...(purchase ? [{ issuedOn: purchase, ownerFiscalCode: owner }] : []),
          ],
        },
        latestCover: firstPolicy
          ? null
          : {
              company,
              policyHolderFiscalCode: owner,
              coverExpiry: expiry,
              contractExpiry: expiry,
            },
        latestCertificate: firstPolicy
          ? null
          : {
              company,
              policyHolderFiscalCode: owner,
              vehicleType: "AUTOVETTURA",
              entitledName: input.owner?.fullName.toUpperCase() ?? null,
              entitledFiscalCode: owner,
              assignedClass: String(classCu),
              assignedClassCu: String(classCu),
              claims: [0, 1, 2, 3, 4, 5].flatMap((back) => [
                {
                  year: year - back,
                  group: "MAIN" as const,
                  total: null,
                  things: back === 1 ? mainClaims : 0,
                  people: 0,
                  peopleAndThings: 0,
                },
                {
                  year: year - back,
                  group: "SHARED" as const,
                  total: null,
                  things: 0,
                  people: 0,
                  peopleAndThings: back === 5 ? ("N.A." as const) : 0,
                },
              ]),
            },
      },
    };
  }
}
