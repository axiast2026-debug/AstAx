import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import { settingsAt, withContext, type DbClient, type DbTransaction } from "@astax/db";
import {
  BATCH_COLUMNS,
  batchSchedule,
  parseBatchRows,
  romeInstant,
  type BatchProblem,
  type BatchRow,
  type BatchVocabulary,
} from "@astax/shared/domain";
import { calendarDateToDbDate, romeCalendarDate } from "@astax/shared/format";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB, FIELD_CIPHER } from "../infra/tokens.js";
import { CustomersService } from "./customers.service.js";
import { ReferenceService } from "./reference.service.js";
import { isOrgRequester } from "./request-support.js";
import { RequestsService } from "./requests.service.js";
import { readXlsx, writeXlsx, XlsxError } from "./xlsx.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** The hour of the scheduled day (Rome) at which the request leaves (question 26). */
const SCHEDULED_TIME = "09:00";

/**
 * The broker's lots (ADR 0014, Dan 2026-10-21, docs/piano-broker.md C-E): an
 * Excel file in AstAx's format, one vehicle to renew per row. The whole file
 * is checked first and nothing is saved if a row is wrong; then each row gets
 * its customer (the existing one of the firm, or a new one) and a draft with
 * the essential data, the coverages and the start, through the same use
 * cases as the five screens. The draft leaves for the back office by itself
 * on its scheduled day, or earlier if the broker sends it.
 */
@Injectable()
export class BatchesService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CustomersService) private readonly customers: CustomersService,
    @Inject(RequestsService) private readonly requests: RequestsService,
    @Inject(ReferenceService) private readonly reference: ReferenceService,
  ) {}

  private broker(auth: AuthContext) {
    const membership = auth.membership;
    if (!isOrgRequester(membership)) throw new ProblemError("FORBIDDEN");
    return membership;
  }

  /** The values the broker may write, from the lists (editable by the administrator). */
  private async vocabulary(tx: DbTransaction): Promise<BatchVocabulary> {
    const [values, recommended] = await Promise.all([
      tx.listValue.findMany({
        where: { listKey: { in: ["drivingFormula", "coverage", "startMode"] }, active: true },
        orderBy: [{ listKey: "asc" }, { sortOrder: "asc" }],
      }),
      tx.coveragePackage.findUnique({ where: { code: "RECOMMENDED" } }),
    ]);
    const of = (key: string) =>
      values.filter((v) => v.listKey === key).map((v) => ({ code: v.code, label: v.labelIt }));
    return {
      drivingFormulas: of("drivingFormula"),
      coverages: of("coverage"),
      startModes: of("startMode"),
      recommendedName: recommended?.name ?? "Consigliato",
    };
  }

  /** The template: the columns, an example row, and the accepted values on a second sheet. */
  async template(auth: AuthContext) {
    this.broker(auth);
    const vocabulary = await withContext(this.db, auth.db, (tx) => this.vocabulary(tx));
    const values = [
      ["Tipo di guida", "Garanzie", "Decorrenza"],
      ...Array.from(
        {
          length: Math.max(
            vocabulary.drivingFormulas.length,
            vocabulary.coverages.length + 1,
            vocabulary.startModes.length,
          ),
        },
        (_v, i) => [
          vocabulary.drivingFormulas[i]?.label ?? "",
          i === 0 ? vocabulary.recommendedName : (vocabulary.coverages[i - 1]?.label ?? ""),
          vocabulary.startModes[i]?.label ?? "",
        ],
      ),
    ];
    return {
      body: writeXlsx([
        { name: "Richieste", rows: [[...BATCH_COLUMNS]] },
        { name: "Valori ammessi", rows: values },
      ]),
      mime: XLSX_MIME,
      fileName: "astax-modello-lotto.xlsx",
    };
  }

  async upload(auth: AuthContext, fileName: string, body: Uint8Array) {
    const membership = this.broker(auth);
    let table;
    try {
      table = readXlsx(body);
    } catch (error) {
      if (error instanceof XlsxError) {
        throw new ProblemError("VALIDATION_FAILED", undefined, [
          { path: "file", issue: error.issue },
        ]);
      }
      throw error;
    }
    const now = this.clock.now();
    const today = romeCalendarDate(now);
    const prepared = await withContext(this.db, auth.db, async (tx) => {
      // Rule 7: the limits and the days come from the parameters.
      const settings = await settingsAt(
        tx,
        [
          "requests.bulkMaxRows",
          "batch.auctionDaysBeforeExpiry",
          "batch.documentsDaysBeforeAuction",
        ],
        now,
      );
      const parsed = parseBatchRows(table, {
        maxRows: settings["requests.bulkMaxRows"],
        today,
        vocabulary: await this.vocabulary(tx),
      });
      // The municipality of residence, by its name and province.
      const istat = new Map<number, string>();
      const problems: BatchProblem[] = [...parsed.problems];
      for (const row of parsed.rows) {
        if (!row.municipality || !row.province) continue;
        const found = await tx.municipality.findFirst({
          where: {
            name: { equals: row.municipality, mode: "insensitive" },
            province: row.province,
          },
          select: { istatCode: true },
        });
        if (found) istat.set(row.line, found.istatCode);
        else problems.push({ line: row.line, field: "comune", issue: "MUNICIPALITY_NOT_FOUND" });
      }
      return { rows: parsed.rows, problems, istat, settings };
    });
    if (prepared.problems.length > 0) {
      throw new ProblemError(
        "VALIDATION_FAILED",
        "The file has errors: nothing was saved",
        prepared.problems
          .sort((a, b) => a.line - b.line)
          .slice(0, 100)
          .map((p) => ({ path: `riga ${p.line}: ${p.field}`, issue: p.issue })),
      );
    }

    const options = await this.reference.requestOptions(auth);
    const version = (code: string) => options.packages.find((p) => p.code === code)?.version ?? 1;
    const batch = await withContext(this.db, auth.db, async (tx) => {
      const [row] = await tx.$queryRaw<
        { n: bigint }[]
      >`SELECT nextval('request_batch_number_seq') AS n`;
      return tx.requestBatch.create({
        data: {
          code: `LT-${today.slice(0, 4)}-${String(row?.n ?? 0).padStart(6, "0")}`,
          ownerOrganizationId: membership.organizationId,
          requesterUserId: auth.userId,
          requesterMembershipId: membership.id,
          fileName: fileName.slice(0, 200),
          rows: prepared.rows.length,
          createdAt: now,
        },
      });
    });

    const results = [];
    for (const row of prepared.rows) {
      const customerId = await this.customerOf(auth, row);
      const draft = await this.requests.create(auth, { customerId });
      await this.requests.saveSection(auth, draft.id, "intake", {
        vehicleStatus: "INSURED",
        plate: row.plate,
        ownerBirthDate: row.ownerBirthDate,
        residence: {
          street: row.street,
          postalCode: row.postalCode,
          municipalityIstat: prepared.istat.get(row.line) ?? "",
          province: row.province,
        },
        drivingFormula: row.drivingFormula,
      });
      await this.requests.saveSection(auth, draft.id, "request", {
        packageCode: row.packageCode,
        packageVersion: version(row.packageCode),
        startDate: row.policyExpiryDate,
        startMode: row.startMode,
        ...(row.packageCode === "CUSTOM" ? { coverages: row.coverages } : {}),
        blackBox: false,
        paymentFrequency: "ANNUAL",
        auctionDurationHours: options.defaultAuctionDurationHours,
        minValidityDays: options.defaultMinValidityDays,
      });
      const schedule = batchSchedule(
        row.policyExpiryDate,
        {
          auctionDaysBeforeExpiry: prepared.settings["batch.auctionDaysBeforeExpiry"],
          documentsDaysBeforeAuction: prepared.settings["batch.documentsDaysBeforeAuction"],
        },
        today,
      );
      await withContext(this.db, auth.db, (tx) =>
        tx.quoteRequest.update({
          where: { id: draft.id },
          data: {
            plate: row.plate,
            batchId: batch.id,
            batchLine: row.line,
            policyExpiryDate: calendarDateToDbDate(row.policyExpiryDate),
            scheduledSubmitAt: romeInstant(schedule.auctionDate, SCHEDULED_TIME),
            documentsDueAt: romeInstant(schedule.documentsDate, SCHEDULED_TIME),
          },
        }),
      );
      results.push({
        line: row.line,
        requestId: draft.id,
        code: draft.code,
        auctionDate: schedule.auctionDate,
      });
    }
    await withContext(this.db, auth.db, (tx) =>
      this.audit.inTransaction(tx, actorOf(auth), {
        action: "BATCH_UPLOADED",
        targetType: "RequestBatch",
        targetId: batch.id,
        after: { code: batch.code, rows: results.length },
      }),
    );
    return { id: batch.id, code: batch.code, rows: results.length, results };
  }

  /** The firm's customer with this fiscal code, or a new one. */
  private async customerOf(auth: AuthContext, row: BatchRow): Promise<string> {
    const organizationId = auth.membership?.organizationId ?? "";
    const found = await withContext(this.db, auth.db, (tx) =>
      tx.customer.findFirst({
        where: {
          ownerOrganizationId: organizationId,
          person: { fiscalCodeHash: this.cipher.blindIndex("fiscalCode", row.fiscalCode) },
        },
        select: { id: true },
      }),
    );
    if (found) return found.id;
    const created = await this.customers.create(auth, {
      kind: "PERSON",
      surname: row.surname,
      givenName: row.givenName,
      fiscalCode: row.fiscalCode,
      ...(row.email ? { email: row.email } : {}),
      ...(row.phone ? { phone: row.phone } : {}),
    });
    return created.id;
  }

  /** The firm's lots, newest first, with how many requests are in each state. */
  async list(auth: AuthContext) {
    const membership = this.broker(auth);
    return withContext(this.db, auth.db, async (tx) => {
      const batches = await tx.requestBatch.findMany({
        where: { ownerOrganizationId: membership.organizationId },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      const counts = await tx.quoteRequest.groupBy({
        by: ["batchId", "status"],
        where: { batchId: { in: batches.map((b) => b.id) } },
        _count: { _all: true },
        _min: { scheduledSubmitAt: true },
      });
      return batches.map((b) => {
        const mine = counts.filter((c) => c.batchId === b.id);
        const drafts = mine.find((c) => c.status === "DRAFT");
        return {
          id: b.id,
          code: b.code,
          fileName: b.fileName,
          rows: b.rows,
          createdAt: b.createdAt.toISOString(),
          statuses: Object.fromEntries(mine.map((c) => [c.status, c._count._all])),
          nextSubmitAt: drafts?._min.scheduledSubmitAt?.toISOString() ?? null,
        };
      });
    });
  }
}
