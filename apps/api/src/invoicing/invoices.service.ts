import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import { asSystem, issueBrokerInvoices, withContext, type DbClient, type Invoice } from "@astax/db";
import { romeCalendarDate } from "@astax/shared/format";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { isOrgRequester } from "../requests/request-support.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB, FIELD_CIPHER, OBJECT_STORAGE } from "../infra/tokens.js";
import labels from "../notifications/labels.it.json" with { type: "json" };
import { decryptJson, encryptJson } from "../requests/request-support.js";
import { InvoicingService, recipientComplete, type InvoiceRecipient } from "./invoicing.service.js";

const BOM = String.fromCharCode(0xfeff);

/** What the back office completes on a recipient (proposal D of phase 6). */
export interface RecipientCompletion {
  fiscalCode?: string | undefined;
  vatNumber?: string | undefined;
  address: { street: string; postalCode: string; municipalityIstat: string; province: string };
  sdiCode?: string | undefined;
  pec?: string | undefined;
}

/**
 * Spec 06 «Fatturazione» and spec 04/05 «Contabilità»: the invoices. The
 * back office sees the SDI state and completes the recipients missing the
 * fiscal data (then the invoice goes to SDI); the recipient downloads its
 * own courtesy copies.
 */
@Injectable()
export class InvoicesService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(InvoicingService) private readonly invoicing: InvoicingService,
  ) {}

  /** Rule 4: an access to something not one's own is a denial in the audit log, then 404. */
  private async denied(auth: AuthContext, targetType: string, targetId: string): Promise<never> {
    await this.audit.record(actorOf(auth), { action: "ACCESS_DENIED", targetType, targetId });
    throw new ProblemError("NOT_FOUND");
  }

  private row(i: Invoice, withRecipient: boolean) {
    const recipient = decryptJson(this.cipher, i.recipientEnc) as InvoiceRecipient;
    return {
      id: i.id,
      code: i.code,
      series: i.series,
      recipientType: i.recipientType,
      ...(withRecipient ? { recipient: recipient.name } : {}),
      toComplete: !recipientComplete(recipient),
      issuedOn: i.issuedOn.toISOString().slice(0, 10),
      dueOn: i.dueOn ? i.dueOn.toISOString().slice(0, 10) : null,
      period: i.period,
      exemptCents: i.exemptCents,
      stampDutyCents: i.stampDutyCents,
      totalCents: i.totalCents,
      sdiStatus: i.sdiStatus,
      credited: i.creditedInvoiceId !== null,
      hasPdf: i.pdfDocumentId !== null,
    };
  }

  /**
   * Decision 24: what the schedule of the first day of the month does, now
   * (spec 06 «Fatturazione»): the brokers' invoices B of a month, then sent.
   */
  async issueBrokerMonth(auth: AuthContext, period: string) {
    const now = this.clock.now();
    const { created } = await withContext(this.db, auth.db, async (tx) => {
      const out = await asSystem(tx, () =>
        issueBrokerInvoices(
          tx,
          (plain) => this.cipher.encrypt(plain),
          period,
          labels.invoice.brokerLine,
          now,
        ),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "INVOICE_ISSUED",
        targetType: "Invoice",
        targetId: null,
        after: { series: "B", period, created: out.created.length },
      });
      return out;
    });
    for (const id of created) await this.invoicing.deliver(id);
    return { period, created: created.length };
  }

  /**
   * CONT-05, spec 02 «Contabilità»: the broker's statement. The policies
   * issued for its customers with premium, commission (when active) and the
   * fee due to AstAx, with the monthly invoice that bills it.
   */
  async brokerStatement(auth: AuthContext) {
    const m = auth.membership;
    // ADR 0015: a broker, or an agency for the policies it requested for its customers.
    if (!isOrgRequester(m)) throw new ProblemError("NOT_FOUND");
    return withContext(this.db, auth.db, async (tx) => {
      const policies = await tx.policy.findMany({
        where: { ownerOrganizationId: m.organizationId },
        orderBy: { issuedAt: "desc" },
        take: 500,
      });
      const [requests, acceptances, commissions, companies, invoices] = await asSystem(tx, () =>
        Promise.all([
          tx.quoteRequest.findMany({
            where: { id: { in: policies.map((p) => p.quoteRequestId) } },
            select: { id: true, code: true },
          }),
          tx.acceptance.findMany({
            where: { id: { in: policies.map((p) => p.acceptanceId) } },
            select: { id: true, brokerFeeCents: true },
          }),
          tx.brokerCommission.findMany({ where: { policyId: { in: policies.map((p) => p.id) } } }),
          tx.insuranceCompany.findMany({
            where: { id: { in: policies.map((p) => p.companyId) } },
            select: { id: true, name: true },
          }),
          tx.invoice.findMany({
            where: { ownerOrganizationId: m.organizationId },
            orderBy: { issuedOn: "desc" },
          }),
        ]),
      );
      return {
        policies: policies.map((p) => {
          const commission = commissions.find((c) => c.policyId === p.id);
          return {
            id: p.id,
            code: requests.find((q) => q.id === p.quoteRequestId)?.code ?? "",
            policyNumber: p.policyNumber,
            company: companies.find((c) => c.id === p.companyId)?.name ?? "",
            issuedAt: p.issuedAt.toISOString(),
            premiumCents: p.premiumCents,
            commission: commission
              ? {
                  amountCents: commission.amountCents,
                  status: commission.status,
                  settledAt: commission.settledAt?.toISOString() ?? null,
                }
              : null,
            feeCents: acceptances.find((a) => a.id === p.acceptanceId)?.brokerFeeCents ?? 0,
            invoiceCode: invoices.find((i) => i.id === p.brokerInvoiceId)?.code ?? null,
          };
        }),
        invoices: invoices.map((i) => this.row(i, false)),
      };
    });
  }

  /** Spec 02: the statement as CSV for the broker's software (semicolons, Italian amounts). */
  async brokerCsv(
    auth: AuthContext,
  ): Promise<{ body: Uint8Array; mime: string; fileName: string }> {
    const { policies } = await this.brokerStatement(auth);
    // Rule 5: whole cents only, «1234,56» with no floating point.
    const amount = (cents: number) =>
      `${Math.trunc(cents / 100)},${String(Math.abs(cents % 100)).padStart(2, "0")}`;
    const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const head = [
      "richiesta",
      "polizza",
      "compagnia",
      "emessa_il",
      "premio",
      "provvigione",
      "stato_provvigione",
      "fee_astax",
      "fattura",
    ];
    const rows = policies.map((p) =>
      [
        cell(p.code),
        cell(p.policyNumber),
        cell(p.company),
        romeCalendarDate(new Date(p.issuedAt)),
        amount(p.premiumCents),
        p.commission ? amount(p.commission.amountCents) : "",
        p.commission?.status ?? "",
        amount(p.feeCents),
        cell(p.invoiceCode ?? ""),
      ].join(";"),
    );
    await withContext(this.db, auth.db, (tx) =>
      this.audit.inTransaction(tx, actorOf(auth), {
        action: "STATEMENT_EXPORTED",
        targetType: "Organization",
        targetId: auth.membership?.organizationId ?? null,
        after: { rows: rows.length },
      }),
    );
    return {
      // A byte order mark so that spreadsheet programs read the accents right.
      body: new TextEncoder().encode(`${BOM}${[head.join(";"), ...rows].join("\r\n")}\r\n`),
      mime: "text/csv; charset=utf-8",
      fileName: `estratto-conto-${romeCalendarDate(this.clock.now())}.csv`,
    };
  }

  /** The back office's list (accounting.view); the states on their way are refreshed. */
  async list(auth: AuthContext, filter: { toComplete?: boolean }) {
    await this.invoicing.deliverPending();
    return withContext(this.db, auth.db, async (tx) => {
      const invoices = await asSystem(tx, () =>
        tx.invoice.findMany({ orderBy: [{ issuedOn: "desc" }, { code: "desc" }], take: 300 }),
      );
      const fresh = await Promise.all(invoices.map((i) => this.invoicing.refresh(tx, i)));
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "INVOICES_VIEWED",
        targetType: "Invoice",
        targetId: null,
      });
      const rows = fresh.map((i) => this.row(i, true));
      return filter.toComplete ? rows.filter((r) => r.toComplete) : rows;
    });
  }

  /**
   * Proposal D: the back office completes the fiscal data; the invoice (not
   * sent yet, or refused by SDI) is then sent with the same number.
   */
  async complete(auth: AuthContext, id: string, data: RecipientCompletion) {
    if (!data.fiscalCode && !data.vatNumber) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "fiscalCode", issue: "required" },
      ]);
    }
    await withContext(this.db, auth.db, async (tx) => {
      const invoice = await asSystem(tx, () => tx.invoice.findUnique({ where: { id } }));
      if (!invoice) throw new ProblemError("NOT_FOUND");
      if (invoice.sdiStatus !== "TO_SEND" && invoice.sdiStatus !== "REJECTED") {
        throw new ProblemError("CONFLICT", "Already with SDI", [
          { path: "invoice", issue: "WRONG_STATE" },
        ]);
      }
      const recipient = decryptJson(this.cipher, invoice.recipientEnc) as InvoiceRecipient;
      const completed: InvoiceRecipient = {
        ...recipient,
        fiscalCode: data.fiscalCode ?? recipient.fiscalCode ?? null,
        vatNumber: data.vatNumber ?? recipient.vatNumber ?? null,
        address: await this.invoicing.addressOf(tx, data.address),
        sdiCode: data.sdiCode ?? recipient.sdiCode ?? "0000000",
        pec: data.pec ?? recipient.pec ?? null,
      };
      await asSystem(tx, () =>
        tx.invoice.update({
          where: { id },
          data: { recipientEnc: encryptJson(this.cipher, completed), sdiStatus: "TO_SEND" },
        }),
      );
      // Identifiers only (rule 8): what was completed, not the values.
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "INVOICE_RECIPIENT_COMPLETED",
        targetType: "Invoice",
        targetId: id,
        after: { fields: Object.keys(data).filter((k) => data[k as keyof RecipientCompletion]) },
      });
    });
    await this.invoicing.deliver(id);
    return withContext(this.db, auth.db, async (tx) => {
      const invoice = await asSystem(tx, () => tx.invoice.findUniqueOrThrow({ where: { id } }));
      return this.row(invoice, false);
    });
  }

  /** invoice.viewOwn: the recipient's invoices (the row security keeps the others out). */
  async own(auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) => {
      const where = auth.membership
        ? { ownerOrganizationId: auth.membership.organizationId }
        : { ownerUserId: auth.userId, ownerOrganizationId: null };
      const invoices = await tx.invoice.findMany({ where, orderBy: { issuedOn: "desc" } });
      return invoices.map((i) => this.row(i, false));
    });
  }

  /** The courtesy PDF: to its recipient (invoice.viewOwn) or to the back office (accounting.view). */
  async pdf(auth: AuthContext, id: string, staff: boolean) {
    const key = await withContext(this.db, auth.db, async (tx) => {
      // Read as system, then checked here: an invoice of someone else is a denial in the
      // audit log (rule 4), not a silent 404 of the row security.
      const invoice = await asSystem(tx, () => tx.invoice.findUnique({ where: { id } }));
      const mine =
        staff ||
        (auth.membership
          ? invoice?.ownerOrganizationId === auth.membership.organizationId
          : invoice?.ownerUserId === auth.userId && invoice.ownerOrganizationId === null);
      if (!invoice?.pdfDocumentId) throw new ProblemError("NOT_FOUND");
      if (!mine) return this.denied(auth, "Invoice", id);
      const doc = await asSystem(tx, () =>
        tx.document.findUniqueOrThrow({ where: { id: invoice.pdfDocumentId ?? "" } }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "DOCUMENT_VIEWED",
        targetType: "Invoice",
        targetId: invoice.id,
      });
      return { key: doc.storageKey, fileName: `${invoice.code}.pdf` };
    });
    return {
      body: await this.storage.get(key.key),
      mime: "application/pdf",
      fileName: key.fileName,
    };
  }
}
