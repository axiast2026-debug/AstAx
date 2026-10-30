import type { DbTransaction } from "@astax/db";
import type { AniaSheet, QuoteData } from "@astax/shared/domain";

/**
 * Dan, 2026-10-29 (docs/piano-agenzia-filtri-richiesta.md): an agency sees the
 * request, the confirmed ANIA data and the documents. No vehicle, persons or
 * insurance history sections, and no name, email or phone of the customer
 * before the purchase: only the fiscal code (or VAT number) and the address the
 * customer wrote.
 */
export interface AgencyRequestView {
  plate: string;
  drivingFormula: QuoteData["drivingFormula"];
  blackBox: boolean;
  startDate: string;
  startMode: QuoteData["request"]["startMode"] | null;
  minValidityDays: number;
  auctionDurationHours: number;
  holder: {
    kind: "PERSON" | "COMPANY";
    /** The fiscal code of a person, the VAT number of a company. */
    taxCode: string;
    address: { street: string; postalCode: string; municipality: string; province: string };
  };
}

export async function agencyRequestView(
  tx: DbTransaction,
  q: QuoteData,
): Promise<AgencyRequestView> {
  const holder = q.policyHolder;
  const address = holder.kind === "PERSON" ? holder.residence : holder.registeredOffice;
  const municipality = await tx.municipality.findUnique({
    where: { istatCode: address.municipalityIstat },
    select: { name: true },
  });
  return {
    plate: q.vehicle.plate,
    drivingFormula: q.drivingFormula,
    blackBox: q.request.blackBox,
    startDate: q.request.startDate,
    startMode: q.request.startMode ?? null,
    minValidityDays: q.request.minValidityDays,
    auctionDurationHours: q.request.auctionDurationHours,
    holder: {
      kind: holder.kind,
      taxCode: holder.kind === "PERSON" ? holder.fiscalCode : holder.vatNumber,
      address: {
        street: address.street,
        postalCode: address.postalCode,
        municipality: municipality?.name ?? "",
        province: address.province,
      },
    },
  };
}

/** The ANIA sheet for an agency: every datum but the owner's name, the cover expiry and (Dan, 2026-10-30) the contract expiry. */
export function agencySheet(sheet: AniaSheet): AniaSheet {
  return {
    ...sheet,
    fullName: null,
    surname: null,
    givenName: null,
    coverExpiry: null,
    contractExpiry: null,
  };
}
