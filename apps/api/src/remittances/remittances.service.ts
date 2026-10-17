import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import { buildPain001, validateXml } from "@astax/adapters/xml";
import {
  asSystem,
  prepareRemittances,
  settingsAt,
  withContext,
  type DbClient,
  type DbTransaction,
  type Remittance,
} from "@astax/db";
import { addCalendarDays, linesByUnitAmount, isRemittanceDay } from "@astax/shared/domain";
import { formatDate, romeCalendarDate } from "@astax/shared/format";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import type { ApiConfig } from "../config/config.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, CONFIG, DB, FIELD_CIPHER, OBJECT_STORAGE } from "../infra/tokens.js";
import { InvoicingService, type InvoiceRecipient } from "../invoicing/invoicing.service.js";
import labels from "../notifications/labels.it.json" with { type: "json" };
import { NotificationService } from "../notifications/notification.service.js";
import { Postbox, type PostboxUser } from "../notifications/postbox.js";

/**
 * CONT-01, CONT-02, CONT-03: the weekly remittances. Prepared as drafts on
 * Monday (the worker's schedule, or the back office's button), reviewed by
 * accounting (which issues the agency's invoice A), put in the SEPA file
 * (pain.001, checked against the schema), marked as executed once the bank
 * has the file; the agency is told and sees it in its statement.
 */
@Injectable()
export class RemittancesService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(InvoicingService) private readonly invoicing: InvoicingService,
  ) {}

  /** The run day of this week (or today, if it is that day), in Rome. */
  async currentRunDate(tx: DbTransaction, now: Date): Promise<string> {
    const { "remittance.runDay": runDay } = await settingsAt(tx, ["remittance.runDay"], now);
    let date = romeCalendarDate(now);
    while (!isRemittanceDay(date, runDay)) date = addCalendarDays(date, -1);
    return date;
  }

  /** The back office prepares now what the Monday schedule would (spec 06 «Pagamenti»). */
  async prepare(auth: AuthContext) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const runDate = await this.currentRunDate(tx, now);
      const { created } = await asSystem(tx, () => prepareRemittances(tx, runDate, now));
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "REMITTANCE_PREPARED",
        targetType: "Remittance",
        targetId: null,
        after: { runDate, created: created.length },
      });
      return { runDate, created: created.length };
    });
  }

  private async rows(tx: DbTransaction, remittances: Remittance[]) {
    const orgs = await asSystem(tx, () =>
      tx.organization.findMany({ where: { id: { in: remittances.map((r) => r.organizationId) } } }),
    );
    const lines = await tx.remittanceLine.findMany({
      where: { remittanceId: { in: remittances.map((r) => r.id) } },
    });
    return remittances.map((r) => {
      const mine = lines.filter((l) => l.remittanceId === r.id);
      const held = (kind: string) =>
        mine.filter((l) => l.kind === kind).reduce((sum, l) => sum + l.appliedCents, 0);
      return {
        id: r.id,
        agency: orgs.find((o) => o.id === r.organizationId)?.legalName ?? "",
        runDate: r.runDate.toISOString().slice(0, 10),
        policies: mine.filter((l) => l.kind === "POLICY").length,
        grossCents: r.grossCents,
        feesCents: r.feesCents,
        stampDutyCents: held("STAMP_DUTY"),
        penaltiesCents: held("PENALTY"),
        recoveriesCents: held("RECOVERY"),
        brokerSharesCents: held("BROKER_SHARE"),
        netCents: r.netCents,
        carriedCents: r.carriedCents,
        status: r.status,
        executedAt: r.executedAt?.toISOString() ?? null,
        invoiceId: r.invoiceId,
      };
    });
  }

  async list(auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) => {
      const remittances = await asSystem(tx, () =>
        tx.remittance.findMany({ orderBy: [{ runDate: "desc" }, { createdAt: "asc" }], take: 200 }),
      );
      return asSystem(tx, () => this.rows(tx, remittances));
    });
  }

  private async locked(tx: DbTransaction, id: string) {
    return asSystem(tx, async () => {
      await tx.$queryRaw`SELECT 1 FROM "Remittance" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const r = await tx.remittance.findUnique({ where: { id } });
      if (!r) throw new ProblemError("NOT_FOUND");
      return r;
    });
  }

  private wrong(issue = "WRONG_STATE") {
    return new ProblemError("CONFLICT", "Not possible in this state", [
      { path: "remittance", issue },
    ]);
  }

  /** Accounting reviews: the remittance is ready, and the agency's fee invoice A is issued. */
  async review(auth: AuthContext, id: string) {
    const out = await withContext(this.db, auth.db, async (tx) => {
      const r = await this.locked(tx, id);
      if (r.status !== "DRAFT") throw this.wrong();
      const agency = await asSystem(tx, () =>
        tx.organization.findUniqueOrThrow({ where: { id: r.organizationId } }),
      );
      // CONT-03: the fees the remittance kept, as prepared (never the parameter of today).
      const fees = await asSystem(tx, () =>
        tx.remittanceLine.findMany({
          where: { remittanceId: r.id, kind: "POLICY" },
          select: { appliedCents: true },
        }),
      );
      const address = agency.address as {
        street: string;
        postalCode: string;
        municipalityIstat: string;
        province: string;
      } | null;
      const recipient: InvoiceRecipient = {
        name: agency.legalName,
        vatNumber: agency.vatNumber,
        address: address ? await this.invoicing.addressOf(tx, address) : null,
        sdiCode: "0000000",
        pec: agency.pec,
      };
      const invoice = await this.invoicing.issue(tx, {
        series: "A",
        recipientType: "AGENCY",
        ownerUserId: null,
        ownerOrganizationId: agency.id,
        recipient,
        lines: linesByUnitAmount(
          fees.map((l) => l.appliedCents),
          `${labels.invoice.agencyLine} ${formatDate(r.runDate.toISOString().slice(0, 10))}`,
        ),
        remittanceId: r.id,
      });
      await asSystem(tx, () =>
        tx.remittance.update({
          where: { id: r.id },
          data: { status: "READY", reviewedByUserId: auth.userId, invoiceId: invoice.id },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "REMITTANCE_REVIEWED",
        targetType: "Remittance",
        targetId: r.id,
        after: { netCents: r.netCents, invoiceId: invoice.id },
      });
      return { id: r.id, invoiceId: invoice.id };
    });
    await this.invoicing.deliver(out.invoiceId);
    return { id: out.id, status: "READY" as const };
  }

  /**
   * CONT-02: the SEPA file of the ready remittances of a run day, from AstAx's
   * separate account; checked against the official schema before it is kept.
   */
  async generateFile(auth: AuthContext, runDate: string) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const ready = await asSystem(tx, () =>
        tx.remittance.findMany({ where: { runDate: new Date(runDate), status: "READY" } }),
      );
      const payable = ready.filter((r) => r.netCents > 0);
      if (payable.length === 0) throw this.wrong("NOTHING_TO_PAY");
      const [astax, agencies] = await asSystem(tx, () =>
        Promise.all([
          tx.organization.findFirstOrThrow({ where: { type: "ASTAX" } }),
          tx.organization.findMany({ where: { id: { in: payable.map((r) => r.organizationId) } } }),
        ]),
      );
      if (!astax.ibanEnc) throw this.wrong("IBAN_MISSING");
      const missing = agencies.filter((a) => !a.ibanEnc);
      if (missing.length > 0) throw this.wrong("IBAN_MISSING");
      const xml = buildPain001({
        messageId: `AX-REM-${runDate}-${String(now.getTime()).slice(-6)}`,
        createdAt: now,
        executionDate: runDate,
        debtor: { name: astax.legalName, iban: this.cipher.decrypt(astax.ibanEnc) },
        transfers: payable.map((r) => {
          const agency = agencies.find((a) => a.id === r.organizationId);
          return {
            endToEndId: r.id.replace(/-/g, "").slice(0, 32),
            amountCents: r.netCents,
            creditorName: agency?.legalName ?? "",
            creditorIban: this.cipher.decrypt(agency?.ibanEnc ?? ""),
            remittanceInfo: `${labels.remittance.transferText} ${formatDate(runDate)}`,
          };
        }),
      });
      const check = await validateXml("PAIN_001", xml);
      if (!check.valid) {
        throw new ProblemError("INTERNAL", "The SEPA file does not pass the schema");
      }
      const key = `remittances/${runDate}/${now.getTime()}.xml`;
      await this.storage.put({
        key,
        body: new TextEncoder().encode(xml),
        contentType: "application/xml",
      });
      await asSystem(tx, () =>
        tx.remittance.updateMany({
          where: { id: { in: ready.map((r) => r.id) } },
          data: { status: "FILE_GENERATED", sepaFileKey: key },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "REMITTANCE_FILE_GENERATED",
        targetType: "Remittance",
        targetId: null,
        after: { runDate, remittances: ready.length, transfers: payable.length },
      });
      return { key, transfers: payable.length };
    });
  }

  /** The SEPA file, to upload to the bank (the API logs who downloaded it). */
  async file(auth: AuthContext, id: string) {
    const r = await withContext(this.db, auth.db, async (tx) => {
      const remittance = await asSystem(tx, () => tx.remittance.findUnique({ where: { id } }));
      if (!remittance?.sepaFileKey) throw new ProblemError("NOT_FOUND");
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "DOCUMENT_VIEWED",
        targetType: "Remittance",
        targetId: id,
      });
      return remittance;
    });
    return {
      body: await this.storage.get(r.sepaFileKey ?? ""),
      mime: "application/xml",
      fileName: `bonifici-${r.runDate.toISOString().slice(0, 10)}.xml`,
    };
  }

  /** CONT-02: the bank has the file; the agency is told. */
  async execute(auth: AuthContext, id: string) {
    const now = this.clock.now();
    const postbox = new Postbox(this.notifications, this.cipher, this.config.WEB_URL);
    const out = await withContext(this.db, auth.db, async (tx) => {
      const r = await this.locked(tx, id);
      if (r.status !== "FILE_GENERATED" && !(r.status === "READY" && r.netCents === 0)) {
        throw this.wrong();
      }
      await asSystem(tx, () =>
        tx.remittance.update({
          where: { id: r.id },
          data: { status: "EXECUTED", executedAt: now, executedByUserId: auth.userId },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "REMITTANCE_EXECUTED",
        targetType: "Remittance",
        targetId: r.id,
        after: { netCents: r.netCents },
      });
      const owners: PostboxUser[] = await asSystem(tx, async () =>
        (
          await tx.membership.findMany({
            where: { organizationId: r.organizationId, role: "OWNER", status: "ACTIVE" },
            include: { user: true },
          })
        ).map((m) => m.user),
      );
      const policies = await asSystem(tx, () =>
        tx.remittanceLine.count({ where: { remittanceId: r.id, kind: "POLICY" } }),
      );
      const link = `${this.config.WEB_URL}/contabilita`;
      await postbox.tell(
        tx,
        owners,
        "remittance.executed",
        {
          periodo: formatDate(r.runDate.toISOString().slice(0, 10)),
          numero_polizze: String(policies),
          data: formatDate(romeCalendarDate(now)),
          link,
        },
        link,
        { remittanceId: r.id },
      );
      return { id: r.id, status: "EXECUTED" as const };
    });
    await postbox.flush();
    return out;
  }

  /**
   * Spec 04 «Contabilità»: the agency's statement. Its policies with premium,
   * fee kept and the remittance (date and state); its remittances with what
   * was held back; its fee invoices.
   */
  async agencyStatement(auth: AuthContext) {
    const m = auth.membership;
    if (!m || m.organizationType !== "AGENCY") throw new ProblemError("NOT_FOUND");
    return withContext(this.db, auth.db, async (tx) => {
      const [policies, remittances, lines, invoices] = await Promise.all([
        tx.policy.findMany({
          where: { organizationId: m.organizationId },
          orderBy: { issuedAt: "desc" },
          take: 200,
        }),
        tx.remittance.findMany({
          where: { organizationId: m.organizationId },
          orderBy: { runDate: "desc" },
        }),
        tx.remittanceLine.findMany({ where: { organizationId: m.organizationId, kind: "POLICY" } }),
        tx.invoice.findMany({
          where: { ownerOrganizationId: m.organizationId },
          orderBy: { issuedOn: "desc" },
        }),
      ]);
      const requests = await asSystem(tx, () =>
        tx.quoteRequest.findMany({ where: { id: { in: policies.map((p) => p.quoteRequestId) } } }),
      );
      return {
        policies: policies.map((p) => {
          const line = lines.find((l) => l.ref === p.id);
          const remittance = remittances.find((r) => r.id === line?.remittanceId);
          return {
            id: p.id,
            code: requests.find((q) => q.id === p.quoteRequestId)?.code ?? "",
            policyNumber: p.policyNumber,
            issuedAt: p.issuedAt.toISOString(),
            premiumCents: p.premiumCents,
            feeCents: line?.appliedCents ?? null,
            remittance: remittance
              ? {
                  runDate: remittance.runDate.toISOString().slice(0, 10),
                  status: remittance.status,
                }
              : null,
          };
        }),
        remittances: await this.rows(tx, remittances),
        invoices: invoices.map((i) => ({
          id: i.id,
          code: i.code,
          issuedOn: i.issuedOn.toISOString().slice(0, 10),
          totalCents: i.totalCents,
          sdiStatus: i.sdiStatus,
          pdfDocumentId: i.pdfDocumentId,
        })),
      };
    });
  }
}
