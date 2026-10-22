import type { Clock } from "@astax/adapters/clock";
import { withContext, type DbClient, type DbTransaction } from "@astax/db";
import {
  EASTER_MONDAY_NAME,
  PackageRequirementsSchema,
  proposedHolidays,
  romeLocal,
  type PackageRequirements,
} from "@astax/shared/domain";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB } from "../infra/tokens.js";

export interface ExclusionInput {
  blockingInWizard: boolean;
  messageIt: string;
  active: boolean;
  reason: string;
}

export interface ListValueInput {
  labelIt: string;
  active: boolean;
  sortOrder: number;
  reason: string;
}

const dayOf = (date: string) => new Date(`${date}T00:00:00.000Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Spec 07 «Pacchetti e casi esclusi» and «Elenchi e festività»
 * (admin.catalog.manage). A package changes with a new version from a date
 * (a request keeps the version it used); an excluded case keeps every version;
 * list labels and holidays are edited in Italian and Albanian. Every change
 * asks a reason and is in the audit log with before and after.
 */
@Injectable()
export class CatalogAdminService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // --- Packages ------------------------------------------------------------

  async packages(auth: AuthContext) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) =>
      (
        await tx.coveragePackage.findMany({
          include: { versions: { orderBy: { version: "desc" } } },
          orderBy: { code: "asc" },
        })
      ).map((p) => {
        const inForce = p.versions.find((v) => v.validFrom <= now);
        return {
          code: p.code,
          name: p.name,
          versions: p.versions.map((v) => ({
            id: v.id,
            version: v.version,
            requirements: v.requirements as PackageRequirements,
            customerTextIt: v.customerTextIt,
            validFrom: v.validFrom.toISOString(),
            reason: v.reason,
            inForce: v.id === inForce?.id,
          })),
        };
      }),
    );
  }

  async newPackageVersion(
    auth: AuthContext,
    code: string,
    input: {
      requirements: unknown;
      customerTextIt: string;
      validFrom: Date;
      reason: string;
    },
  ) {
    const parsed = PackageRequirementsSchema.safeParse(input.requirements);
    if (!parsed.success) {
      throw new ProblemError(
        "VALIDATION_FAILED",
        "Invalid requirements",
        parsed.error.issues.map((i) => ({
          path: ["requirements", ...i.path].join("."),
          issue: "INVALID_REQUIREMENTS",
        })),
      );
    }
    const now = this.clock.now();
    // Only new requests use it: never back in time (rule 7).
    if (input.validFrom < now) {
      throw new ProblemError("VALIDATION_FAILED", "validFrom in the past", [
        { path: "validFrom", issue: "IN_THE_PAST" },
      ]);
    }
    return withContext(this.db, auth.db, async (tx) => {
      const pkg = await tx.coveragePackage.findUnique({
        where: { code },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      });
      if (!pkg) throw new ProblemError("NOT_FOUND");
      const last = pkg.versions[0];
      if (last && input.validFrom <= last.validFrom) {
        throw new ProblemError("VALIDATION_FAILED", "validFrom before the last version", [
          { path: "validFrom", issue: "BEFORE_LAST_VERSION" },
        ]);
      }
      const created = await tx.coveragePackageVersion.create({
        data: {
          packageCode: code,
          version: (last?.version ?? 0) + 1,
          requirements: parsed.data,
          customerTextIt: input.customerTextIt,
          validFrom: input.validFrom,
          reason: input.reason,
          changedByUserId: auth.userId,
          createdAt: now,
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "PACKAGE_VERSION_CREATED",
        targetType: "CoveragePackage",
        targetId: code,
        before: last ? { version: last.version, requirements: last.requirements } : null,
        after: {
          version: created.version,
          requirements: parsed.data,
          validFrom: created.validFrom.toISOString(),
        },
        reason: input.reason,
      });
      return { code, version: created.version, validFrom: created.validFrom.toISOString() };
    });
  }

  // --- Excluded cases ------------------------------------------------------

  async exclusions(auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) => {
      const rules = await tx.exclusionRule.findMany({ orderBy: { code: "asc" } });
      const versions = await tx.exclusionRuleVersion.findMany({
        orderBy: [{ code: "asc" }, { version: "desc" }],
      });
      return rules.map((r) => ({
        code: r.code,
        version: r.version,
        blockingInWizard: r.blockingInWizard,
        automatic: r.condition !== null,
        messageIt: r.messageIt,
        active: r.active,
        history: versions
          .filter((v) => v.code === r.code)
          .map((v) => ({
            version: v.version,
            active: v.active,
            messageIt: v.messageIt,
            reason: v.reason,
            at: v.createdAt.toISOString(),
          })),
      }));
    });
  }

  async saveExclusion(auth: AuthContext, code: string, input: ExclusionInput, create: boolean) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const current = await tx.exclusionRule.findUnique({ where: { code } });
      if (create && current) {
        throw new ProblemError("CONFLICT", "Code in use", [{ path: "code", issue: "IN_USE" }]);
      }
      if (!create && !current) throw new ProblemError("NOT_FOUND");
      const version = (current?.version ?? 0) + 1;
      const data = {
        blockingInWizard: input.blockingInWizard,
        messageIt: input.messageIt,
        active: input.active,
        version,
        updatedAt: now,
      };
      const saved = current
        ? await tx.exclusionRule.update({ where: { code }, data })
        : await tx.exclusionRule.create({ data: { code, ...data, createdAt: now } });
      await tx.exclusionRuleVersion.create({
        data: {
          code,
          version,
          condition: saved.condition ?? undefined,
          blockingInWizard: saved.blockingInWizard,
          messageIt: saved.messageIt,
          active: saved.active,
          reason: input.reason,
          changedByUserId: auth.userId,
          createdAt: now,
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "EXCLUSION_RULE_SAVED",
        targetType: "ExclusionRule",
        targetId: code,
        before: current
          ? {
              version: current.version,
              blockingInWizard: current.blockingInWizard,
              messageIt: current.messageIt,
              active: current.active,
            }
          : null,
        after: {
          version,
          blockingInWizard: saved.blockingInWizard,
          messageIt: saved.messageIt,
          active: saved.active,
        },
        reason: input.reason,
      });
      return { code, version };
    });
  }

  // --- Lists ---------------------------------------------------------------

  async lists(auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) => {
      const values = await tx.listValue.findMany({
        orderBy: [{ listKey: "asc" }, { sortOrder: "asc" }],
      });
      const lists: Record<string, (Omit<ListValueInput, "reason"> & { code: string })[]> = {};
      for (const v of values) {
        (lists[v.listKey] ??= []).push({
          code: v.code,
          labelIt: v.labelIt,
          active: v.active,
          sortOrder: v.sortOrder,
        });
      }
      return lists;
    });
  }

  async saveListValue(
    auth: AuthContext,
    listKey: string,
    code: string,
    input: ListValueInput,
    create: boolean,
  ) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const current = await tx.listValue.findUnique({
        where: { listKey_code: { listKey, code } },
      });
      if (create) {
        if (current) {
          throw new ProblemError("CONFLICT", "Code in use", [{ path: "code", issue: "IN_USE" }]);
        }
        // New values only in an existing list: the code reads the lists by key.
        if ((await tx.listValue.count({ where: { listKey } })) === 0) {
          throw new ProblemError("NOT_FOUND");
        }
      } else if (!current) throw new ProblemError("NOT_FOUND");
      const data = {
        labelIt: input.labelIt,
        active: input.active,
        sortOrder: input.sortOrder,
        updatedAt: now,
      };
      const saved = current
        ? await tx.listValue.update({ where: { id: current.id }, data })
        : await tx.listValue.create({ data: { listKey, code, ...data, createdAt: now } });
      const view = (v: typeof saved) => ({
        labelIt: v.labelIt,
        active: v.active,
        sortOrder: v.sortOrder,
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "LIST_VALUE_SAVED",
        targetType: "ListValue",
        targetId: `${listKey}.${code}`,
        before: current ? view(current) : null,
        after: view(saved),
        reason: input.reason,
      });
      return { listKey, code };
    });
  }

  // --- Holidays (ASTA-02) ----------------------------------------------------

  /**
   * The holidays of a year, and the proposal for it: the fixed dates of the
   * year before plus Easter Monday, computed from Easter; the administrator
   * confirms it (seed/festivita.json).
   */
  async holidays(auth: AuthContext, requested?: number) {
    // By default the next year, the one to confirm (Rome calendar, rule 6).
    const year = requested ?? Number(romeLocal(this.clock.now()).date.slice(0, 4)) + 1;
    return withContext(this.db, auth.db, async (tx) => {
      const rows = await this.holidaysOf(tx, year);
      const proposal = await this.proposalFor(tx, year);
      const have = new Set(rows.map((r) => isoDay(r.date)));
      return {
        year,
        holidays: rows.map((r) => ({
          id: r.id,
          date: isoDay(r.date),
          name: r.name,
        })),
        missing: proposal.filter((p) => !have.has(p.date)),
      };
    });
  }

  private holidaysOf(tx: DbTransaction, year: number) {
    return tx.holiday.findMany({
      where: { date: { gte: dayOf(`${year}-01-01`), lte: dayOf(`${year}-12-31`) } },
      orderBy: { date: "asc" },
    });
  }

  private async proposalFor(tx: DbTransaction, year: number) {
    const before = await this.holidaysOf(tx, year - 1);
    const fixed = before
      .filter((h) => h.name !== EASTER_MONDAY_NAME)
      .map((h) => ({ monthDay: isoDay(h.date).slice(5), name: h.name }));
    return proposedHolidays(year, fixed);
  }

  async confirmYear(auth: AuthContext, year: number, reason: string) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const have = new Set((await this.holidaysOf(tx, year)).map((r) => isoDay(r.date)));
      const missing = (await this.proposalFor(tx, year)).filter((p) => !have.has(p.date));
      for (const p of missing) {
        await tx.holiday.create({
          data: { date: dayOf(p.date), name: p.name, createdAt: now },
        });
      }
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "HOLIDAYS_YEAR_CONFIRMED",
        targetType: "Holiday",
        targetId: String(year),
        after: { added: missing.map((m) => m.date) },
        reason,
      });
      return { year, added: missing.length };
    });
  }

  async addHoliday(
    auth: AuthContext,
    input: { date: string; name: string; nameSq: string | null; reason: string },
  ) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const date = dayOf(input.date);
      if (await tx.holiday.findUnique({ where: { date } })) {
        throw new ProblemError("CONFLICT", "Already a holiday", [
          { path: "date", issue: "IN_USE" },
        ]);
      }
      const created = await tx.holiday.create({
        data: { date, name: input.name, createdAt: now },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "HOLIDAY_ADDED",
        targetType: "Holiday",
        targetId: created.id,
        after: { date: input.date, name: input.name },
        reason: input.reason,
      });
      return { id: created.id, date: input.date };
    });
  }

  /** An open auction keeps the holidays of its opening (ASTA-09): only new auctions change. */
  async removeHoliday(auth: AuthContext, id: string, reason: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const current = await tx.holiday.findUnique({ where: { id } });
      if (!current) throw new ProblemError("NOT_FOUND");
      await tx.holiday.delete({ where: { id } });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "HOLIDAY_REMOVED",
        targetType: "Holiday",
        targetId: id,
        before: { date: isoDay(current.date), name: current.name },
        reason,
      });
      return { id };
    });
  }
}
