import type { DbTransaction } from "@astax/db";
import {
  decodeFiscalCode,
  runAutoCheck,
  type AutoCheckResult,
  type ExtractedDocument,
  type QuoteData,
} from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import type { PlateLookupPort } from "@astax/adapters/vehicle-data";
import { Inject, Injectable } from "@nestjs/common";
import { PLATE_LOOKUP } from "../infra/tokens.js";
import { ReferenceService } from "./reference.service.js";
import { settingsAt } from "./request-support.js";

/**
 * Runs the automatic check (green, yellow, red) of a request on its current
 * documents and the plate lookup, with the parameters in force.
 */
@Injectable()
export class AutoCheckService {
  constructor(
    @Inject(ReferenceService) private readonly reference: ReferenceService,
    @Inject(PLATE_LOOKUP) private readonly plates: PlateLookupPort,
  ) {}

  async check(
    tx: DbTransaction,
    requestId: string,
    quoteData: QuoteData,
    now: Date,
  ): Promise<AutoCheckResult> {
    const today = romeCalendarDate(now);
    const settings = await settingsAt(
      tx,
      ["documents.confidenceThreshold", "vehicle.vintageAgeYears", "drivingFormula.expertMinAge"],
      now,
    );
    const people = [
      quoteData.policyHolder,
      quoteData.vehicleOwner === "SAME_AS_POLICY_HOLDER" ? null : quoteData.vehicleOwner,
      ...quoteData.drivers.map((d) => d.person),
    ];
    const cadastral = people.flatMap((p) => {
      if (!p || p.kind !== "PERSON") return [];
      const decoded = decodeFiscalCode(p.fiscalCode, today);
      return decoded ? [decoded.birthPlaceCadastralCode] : [];
    });
    const snapshot = await this.reference.snapshot(tx, cadastral);
    const documents = await tx.document.findMany({
      where: { quoteRequestId: requestId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const extracted: ExtractedDocument[] = documents.map((d) => ({
      kind: d.kind,
      ...(d.driverIndex === null ? {} : { driverIndex: d.driverIndex }),
      fields: (d.extraction as { fields?: ExtractedDocument["fields"] } | null)?.fields ?? {},
    }));
    const lookup = await this.plates.lookup({ plate: quoteData.vehicle.plate });
    return runAutoCheck({
      quoteData,
      documents: extracted,
      plateLookup: lookup.found ? lookup.vehicle : null,
      today,
      confidenceThreshold: settings["documents.confidenceThreshold"],
      vintageAgeYears: settings["vehicle.vintageAgeYears"],
      expertMinAge: settings["drivingFormula.expertMinAge"],
      exclusionCases: snapshot.exclusionCases,
      istatOfCadastral: snapshot.istatOfCadastral,
    });
  }
}
