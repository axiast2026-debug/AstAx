import type { FieldCipher } from "@astax/adapters/crypto";
import type { Clock } from "@astax/adapters/clock";
import { settingsAt, withContext, type DbClient } from "@astax/db";
import { parseBulkCsv, type BulkProblem, type BulkRow } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { Inject, Injectable } from "@nestjs/common";
import { unzipSync } from "fflate";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB, FIELD_CIPHER } from "../infra/tokens.js";
import { CustomersService } from "./customers.service.js";
import { RequestsService } from "./requests.service.js";

/** Uncompressed, for the whole ZIP (a guard against archives that explode). */
const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024;

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

const isZip = (body: Uint8Array) =>
  body.length > 4 && body[0] === 0x50 && body[1] === 0x4b && body[2] === 0x03 && body[3] === 0x04;
const baseName = (path: string) => (path.split("/").pop() ?? path).toLowerCase();

export interface BulkResult {
  line: number;
  customer: "CREATED" | "EXISTING";
  requestId: string;
  code: string;
  documents: number;
}

/**
 * The broker's bulk upload (phase 7): the CSV alone, or a ZIP with the CSV
 * and the documents it names. The whole file is checked first (fields,
 * repeated rows, files missing from the ZIP) and nothing is written if
 * anything is wrong; then each row gets its customer (the existing one of
 * the organization, or a new one) and a draft request with the documents,
 * through the same use cases as the wizard (visibility, limits, audit log).
 */
@Injectable()
export class BulkUploadService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CustomersService) private readonly customers: CustomersService,
    @Inject(RequestsService) private readonly requests: RequestsService,
  ) {}

  private unpack(body: Uint8Array): { csv: string; files: Map<string, Uint8Array> } {
    if (!isZip(body)) return { csv: new TextDecoder().decode(body), files: new Map() };
    let total = 0;
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(body, {
        filter: (file) => {
          total += file.originalSize;
          return !file.name.endsWith("/") && total <= MAX_UNZIPPED_BYTES;
        },
      });
    } catch {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "file", issue: "ZIP_UNREADABLE" },
      ]);
    }
    if (total > MAX_UNZIPPED_BYTES) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "file", issue: "TOO_LARGE" },
      ]);
    }
    const csvNames = Object.keys(entries).filter((n) => n.toLowerCase().endsWith(".csv"));
    if (csvNames.length !== 1) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "file", issue: "ONE_CSV_IN_ZIP" },
      ]);
    }
    const files = new Map<string, Uint8Array>();
    for (const [name, data] of Object.entries(entries)) {
      if (!name.toLowerCase().endsWith(".csv")) files.set(baseName(name), data);
    }
    return { csv: new TextDecoder().decode(entries[csvNames[0] ?? ""]), files };
  }

  private existing(auth: AuthContext, row: BulkRow) {
    const organizationId = auth.membership?.organizationId ?? "";
    const identity =
      row.kind === "PERSON"
        ? { fiscalCodeHash: this.cipher.blindIndex("fiscalCode", row.fiscalCode ?? "") }
        : { vatNumberHash: this.cipher.blindIndex("vatNumber", row.vatNumber ?? "") };
    return withContext(this.db, auth.db, (tx) =>
      tx.customer.findFirst({
        where: { ownerOrganizationId: organizationId, person: identity },
        select: { id: true },
      }),
    );
  }

  async run(auth: AuthContext, body: Uint8Array) {
    const membership = auth.membership;
    if (!membership || membership.organizationType !== "BROKER")
      throw new ProblemError("FORBIDDEN");
    const { csv, files } = this.unpack(body);
    // Rule 7: the limit of rows is a parameter (requests.bulkMaxRows).
    const now = this.clock.now();
    const { "requests.bulkMaxRows": maxRows } = await withContext(this.db, auth.db, (tx) =>
      settingsAt(tx, ["requests.bulkMaxRows"], now),
    );
    const { rows, problems } = parseBulkCsv(csv, { maxRows, today: romeCalendarDate(now) });
    const missing: BulkProblem[] = rows.flatMap((row) =>
      Object.entries(row.files)
        .filter(([, name]) => !files.has(baseName(name)))
        .map(([kind]) => ({
          line: row.line,
          field:
            kind === "REGISTRATION_CERTIFICATE"
              ? "libretto"
              : kind === "DRIVING_LICENCE"
                ? "patente"
                : "attestato",
          issue: "NOT_IN_ZIP",
        })),
    );
    const all = [...problems, ...missing];
    if (all.length > 0) {
      throw new ProblemError(
        "VALIDATION_FAILED",
        "The file has errors: nothing was saved",
        all.slice(0, 100).map((p) => ({ path: `riga ${p.line}: ${p.field}`, issue: p.issue })),
      );
    }

    const results: BulkResult[] = [];
    for (const row of rows) {
      const found = await this.existing(auth, row);
      const customerId =
        found?.id ??
        (
          await this.customers.create(
            auth,
            row.kind === "PERSON"
              ? {
                  kind: "PERSON",
                  surname: row.surname ?? "",
                  givenName: row.givenName ?? "",
                  fiscalCode: row.fiscalCode ?? "",
                  ...(row.email ? { email: row.email } : {}),
                  ...(row.phone ? { phone: row.phone } : {}),
                }
              : {
                  kind: "COMPANY",
                  companyName: row.companyName ?? "",
                  vatNumber: row.vatNumber ?? "",
                  ...(row.email ? { email: row.email } : {}),
                  ...(row.phone ? { phone: row.phone } : {}),
                },
          )
        ).id;
      const draft = await this.requests.create(auth, { customerId });
      if (row.plate) {
        // The plate to find the draft at once; the wizard's vehicle step replaces it.
        await withContext(this.db, auth.db, (tx) =>
          tx.quoteRequest.update({ where: { id: draft.id }, data: { plate: row.plate } }),
        );
      }
      let documents = 0;
      for (const [kind, name] of Object.entries(row.files)) {
        const data = files.get(baseName(name));
        if (!data) continue;
        const ext = baseName(name).split(".").pop() ?? "";
        await this.requests.upload(auth, draft.id, {
          kind: kind as "REGISTRATION_CERTIFICATE" | "DRIVING_LICENCE" | "RISK_CERTIFICATE",
          driverIndex: kind === "DRIVING_LICENCE" ? 0 : null,
          fileName: baseName(name),
          contentType: MIME[ext] ?? "application/octet-stream",
          body: data,
        });
        documents += 1;
      }
      results.push({
        line: row.line,
        customer: found ? "EXISTING" : "CREATED",
        requestId: draft.id,
        code: draft.code,
        documents,
      });
    }
    await withContext(this.db, auth.db, (tx) =>
      this.audit.inTransaction(tx, actorOf(auth), {
        action: "BULK_UPLOAD_DONE",
        targetType: "Organization",
        targetId: membership.organizationId,
        after: {
          rows: results.length,
          newCustomers: results.filter((r) => r.customer === "CREATED").length,
          documents: results.reduce((n, r) => n + r.documents, 0),
        },
      }),
    );
    return { rows: results.length, results };
  }
}
