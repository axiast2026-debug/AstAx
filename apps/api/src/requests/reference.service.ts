import type { Clock } from "@astax/adapters/clock";
import { withContext, type DbClient, type DbTransaction } from "@astax/db";
import { CUSTOM_PACKAGE, PACKAGE_CODES, type ExclusionCase } from "@astax/shared/domain";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthContext } from "../auth/auth-context.js";
import { CLOCK, DB } from "../infra/tokens.js";
import { settingsAt } from "./request-support.js";

/** Editable lists the request wizard and the verification card use (spec 09 §4). */
export const REQUEST_LISTS = [
  "contractorType",
  "vehicleType",
  "vehicleUse",
  "fuel",
  "drivingFormula",
  "provenance",
  "paymentFrequency",
  "exclusionCase",
  "annualKmBand",
  "nightParking",
  "maritalStatus",
  "profession",
  "licenceCategory",
  "claimResponsibility",
  "integrationRequestReason",
] as const;

export interface ReferenceSnapshot {
  exclusionCases: ExclusionCase[];
  istatOfCadastral: (cadastral: string) => string | null;
}

/** Reference data for the requests: options in force, lists, packages, municipalities. */
@Injectable()
export class ReferenceService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Wizard options: durations and validity from the parameters (rule 7), lists and packages. */
  async requestOptions(auth: AuthContext) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const settings = await settingsAt(
        tx,
        [
          "auction.durationsWorkingHours",
          "auction.defaultDurationWorkingHours",
          "guarantee.minValidityDaysOptions",
          "guarantee.defaultMinValidityDays",
          "drivingFormula.expertMinAge",
          "documents.maxUploadMb",
        ],
        now,
      );
      const values = await tx.listValue.findMany({
        where: { listKey: { in: [...REQUEST_LISTS] }, active: true },
        orderBy: [{ listKey: "asc" }, { sortOrder: "asc" }],
      });
      const lists: Record<string, { code: string; label: string }[]> = {};
      for (const key of REQUEST_LISTS) lists[key] = [];
      for (const v of values) lists[v.listKey]?.push({ code: v.code, label: v.labelIt });
      const rules = await tx.exclusionRule.findMany({
        where: { active: true },
        orderBy: { code: "asc" },
      });
      const packages = await tx.coveragePackage.findMany({
        include: {
          versions: { where: { validFrom: { lte: now } }, orderBy: { version: "desc" }, take: 1 },
        },
      });
      const order: readonly string[] = PACKAGE_CODES;
      return {
        auctionDurationsHours: settings["auction.durationsWorkingHours"],
        defaultAuctionDurationHours: settings["auction.defaultDurationWorkingHours"],
        minValidityDaysOptions: settings["guarantee.minValidityDaysOptions"],
        defaultMinValidityDays: settings["guarantee.defaultMinValidityDays"],
        expertMinAge: settings["drivingFormula.expertMinAge"],
        maxUploadMb: settings["documents.maxUploadMb"],
        lists,
        /** Uses the wizard asks about: excluded cases that block the submission (ASTA-10). */
        specialUses: rules
          .filter((r) => r.blockingInWizard && r.code !== "FOREIGN_OR_TEMPORARY_PLATE")
          .map((r) => ({ code: r.code, label: r.messageIt })),
        packages: packages
          .sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code))
          .flatMap((p) => {
            const version = p.versions[0];
            if (!version) return [];
            return [
              {
                code: p.code,
                name: p.name,
                version: version.version,
                description: version.customerTextIt,
                requirements: version.requirements,
              },
            ];
          }),
      };
    });
  }

  async searchMunicipalities(auth: AuthContext, query: string, cadastral?: string) {
    if (cadastral && /^[A-Z]\d{3}$/.test(cadastral)) {
      return withContext(this.db, auth.db, (tx) =>
        tx.municipality.findMany({
          where: { cadastralCode: cadastral },
          select: { istatCode: true, name: true, province: true },
        }),
      );
    }
    const q = query.trim();
    if (q.length < 2) return [];
    return withContext(this.db, auth.db, (tx) =>
      tx.municipality.findMany({
        where: /^\d{6}$/.test(q)
          ? { istatCode: q }
          : { name: { startsWith: q, mode: "insensitive" } },
        orderBy: { name: "asc" },
        take: 20,
        select: { istatCode: true, name: true, province: true },
      }),
    );
  }

  /** Exclusion cases and the cadastral → ISTAT lookup for the automatic check. */
  async snapshot(tx: DbTransaction, cadastralCodes: readonly string[]): Promise<ReferenceSnapshot> {
    const rules = await tx.exclusionRule.findMany({ where: { active: true } });
    const municipalities = await tx.municipality.findMany({
      where: { cadastralCode: { in: [...new Set(cadastralCodes)] } },
      select: { cadastralCode: true, istatCode: true },
    });
    const istat = new Map(municipalities.map((m) => [m.cadastralCode, m.istatCode]));
    return {
      exclusionCases: rules.map((r) => ({ code: r.code, blockingInWizard: r.blockingInWizard })),
      istatOfCadastral: (cadastral) => istat.get(cadastral) ?? null,
    };
  }

  /**
   * Spec 09 §3: the market value is asked when theft and fire are required with
   * it; for «CUSTOM», only if the customer chose them (Dan, 2026-10-21).
   */
  async packageIncludesTheft(
    tx: DbTransaction,
    code: string,
    version: number,
    chosen: readonly string[] = [],
  ): Promise<boolean> {
    const found = await tx.coveragePackageVersion.findUnique({
      where: { packageCode_version: { packageCode: code, version } },
    });
    const requirements = (found?.requirements ?? {}) as {
      theftFire?: { required?: boolean; requiresMarketValue?: boolean };
    };
    const theft = requirements.theftFire;
    if (code === CUSTOM_PACKAGE) {
      return chosen.includes("theftFire") && theft?.requiresMarketValue === true;
    }
    return theft?.required === true;
  }

  async packageExists(tx: DbTransaction, code: string, version: number): Promise<boolean> {
    return (await tx.coveragePackageVersion.count({ where: { packageCode: code, version } })) > 0;
  }

  /** Codes of the active values of each list, to validate quoteData against them. */
  async activeCodes(tx: DbTransaction): Promise<Map<string, Set<string>>> {
    const values = await tx.listValue.findMany({
      where: { active: true },
      select: { listKey: true, code: true },
    });
    const map = new Map<string, Set<string>>();
    for (const v of values) {
      const set = map.get(v.listKey) ?? new Set<string>();
      set.add(v.code);
      map.set(v.listKey, set);
    }
    return map;
  }
}
