import type { FieldCipher } from "@astax/adapters/crypto";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import { asSystem, withContext, type DbClient, type Invoice } from "@astax/db";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { DB, FIELD_CIPHER, OBJECT_STORAGE } from "../infra/tokens.js";
import { decryptJson, encryptJson } from "../requests/request-support.js";
import { InvoicingService, recipientComplete, type InvoiceRecipient } from "./invoicing.service.js";

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
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(InvoicingService) private readonly invoicing: InvoicingService,
  ) {}

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

  /** The back office's list (accounting.view); the states on their way are refreshed. */
  async list(auth: AuthContext, filter: { toComplete?: boolean }) {
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
      const invoice = staff
        ? await asSystem(tx, () => tx.invoice.findUnique({ where: { id } }))
        : await tx.invoice.findUnique({ where: { id } });
      const mine =
        staff ||
        (auth.membership
          ? invoice?.ownerOrganizationId === auth.membership.organizationId
          : invoice?.ownerUserId === auth.userId && invoice.ownerOrganizationId === null);
      if (!invoice?.pdfDocumentId || !mine) throw new ProblemError("NOT_FOUND");
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
