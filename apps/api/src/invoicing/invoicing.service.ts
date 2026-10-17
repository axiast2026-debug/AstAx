import { createHash } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { EInvoicingPort } from "@astax/adapters/e-invoicing";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import {
  asSystem,
  settingsAt,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
  type DbTransaction,
  type Invoice,
} from "@astax/db";
import {
  invoiceNumber,
  invoiceTotals,
  type InvoiceLine,
  type InvoiceSeries,
} from "@astax/shared/domain";
import { formatEuroCents, romeCalendarDate } from "@astax/shared/format";
import type { Logger } from "@astax/shared/logging";
import { errorForLog } from "@astax/shared/logging";
import { Inject, Injectable } from "@nestjs/common";
import { acceptancePdf } from "../acceptance/documents-pdf.js";
import { CLOCK, DB, E_INVOICING, FIELD_CIPHER, LOGGER, OBJECT_STORAGE } from "../infra/tokens.js";
import labels from "../notifications/labels.it.json" with { type: "json" };
import { decryptJson, encryptJson } from "../requests/request-support.js";

/**
 * Who the invoice is addressed to (encrypted on the invoice, ADR 0007). An
 * invoice whose recipient lacks the fiscal data is kept «da completare» and
 * not sent (proposal D of phase 6).
 */
export interface InvoiceRecipient {
  name: string;
  givenName?: string | null;
  surname?: string | null;
  fiscalCode?: string | null;
  vatNumber?: string | null;
  address?: { street: string; postalCode: string; city: string; province?: string | null } | null;
  /** SDI code, «0000000» for a private person. */
  sdiCode?: string | null;
  pec?: string | null;
}

/** The «uploader» of what AstAx itself produces (no user uploads a fee invoice). */
const ASTAX_ISSUED = "00000000-0000-0000-0000-000000000000";

export const recipientComplete = (r: InvoiceRecipient) =>
  Boolean((r.fiscalCode || r.vatNumber) && r.address);

const INVOICING_KEYS = [
  "invoicing.vatNature",
  "invoicing.legalReference",
  "invoicing.stampDuty.thresholdCents",
  "invoicing.stampDuty.amountCents",
  "invoicing.stampDuty.chargedTo",
] as const;

/**
 * CONT-03, CONT-04, decisions 24 and 34: AstAx's fee invoices. The number is
 * taken in the caller's transaction from one counter row per series and year
 * (locked by the update until the commit), so numbers have no gaps even
 * with issues at the same moment; the delivery to SDI happens after.
 */
@Injectable()
export class InvoicingService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(E_INVOICING) private readonly sdi: EInvoicingPort,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** The municipality's name from its ISTAT code, for the address on the invoice. */
  async addressOf(
    tx: DbTransaction,
    address: { street: string; postalCode: string; municipalityIstat: string; province: string },
  ): Promise<InvoiceRecipient["address"]> {
    const municipality = await tx.municipality.findUnique({
      where: { istatCode: address.municipalityIstat },
    });
    return {
      street: address.street,
      postalCode: address.postalCode,
      city: municipality?.name ?? address.municipalityIstat,
      province: address.province,
    };
  }

  async issue(
    tx: DbTransaction,
    input: {
      series: Exclude<InvoiceSeries, "N">;
      recipientType: "PRIVATE" | "AGENCY" | "BROKER";
      ownerUserId: string | null;
      ownerOrganizationId: string | null;
      recipient: InvoiceRecipient;
      lines: InvoiceLine[];
      quoteRequestId?: string | null;
      remittanceId?: string | null;
      period?: string | null;
      dueOn?: string | null;
    },
  ): Promise<Invoice> {
    return this.create(tx, { ...input, creditedInvoiceId: null });
  }

  /** CONT-03: a credit note (series N) for a refunded fee, never above what is left. */
  async creditNote(
    tx: DbTransaction,
    invoice: Invoice,
    cents: number,
    description: string,
  ): Promise<Invoice> {
    const earlier = await asSystem(tx, () =>
      tx.invoice.aggregate({
        where: { creditedInvoiceId: invoice.id },
        _sum: { exemptCents: true },
      }),
    );
    if (cents <= 0 || cents > invoice.exemptCents - (earlier._sum.exemptCents ?? 0)) {
      throw new Error("A credit note cannot exceed what is left on the invoice");
    }
    return this.create(tx, {
      series: "N",
      recipientType: invoice.recipientType,
      ownerUserId: invoice.ownerUserId,
      ownerOrganizationId: invoice.ownerOrganizationId,
      recipient: decryptJson(this.cipher, invoice.recipientEnc) as InvoiceRecipient,
      lines: [{ description, quantity: 1, unitCents: cents }],
      quoteRequestId: invoice.quoteRequestId,
      remittanceId: invoice.remittanceId,
      period: invoice.period,
      dueOn: null,
      creditedInvoiceId: invoice.id,
    });
  }

  private async create(
    tx: DbTransaction,
    input: {
      series: InvoiceSeries;
      recipientType: "PRIVATE" | "AGENCY" | "BROKER";
      ownerUserId: string | null;
      ownerOrganizationId: string | null;
      recipient: InvoiceRecipient;
      lines: InvoiceLine[];
      quoteRequestId?: string | null;
      remittanceId?: string | null;
      period?: string | null;
      dueOn?: string | null;
      creditedInvoiceId: string | null;
    },
  ): Promise<Invoice> {
    const now = this.clock.now();
    const issuedOn = romeCalendarDate(now);
    const year = Number(issuedOn.slice(0, 4));
    const s = await settingsAt(tx, INVOICING_KEYS, now);
    // A credit note gives back an amount: no stamp duty on it.
    const totals = invoiceTotals(input.lines, {
      vatNature: s["invoicing.vatNature"],
      legalReference: s["invoicing.legalReference"],
      stampDutyThresholdCents:
        input.series === "N" ? Number.MAX_SAFE_INTEGER : s["invoicing.stampDuty.thresholdCents"],
      stampDutyCents: s["invoicing.stampDuty.amountCents"],
      stampDutyChargedTo: s["invoicing.stampDuty.chargedTo"],
    });
    return asSystem(tx, async () => {
      const [counter] = await tx.$queryRaw<{ last: number }[]>`
        INSERT INTO "InvoiceCounter" ("series", "year", "last")
        VALUES (${input.series}::"InvoiceSeries", ${year}, 1)
        ON CONFLICT ("series", "year") DO UPDATE SET "last" = "InvoiceCounter"."last" + 1
        RETURNING "last"`;
      const number = counter?.last ?? 0;
      return tx.invoice.create({
        data: {
          series: input.series,
          year,
          number,
          code: invoiceNumber(input.series, year, number),
          recipientType: input.recipientType,
          ownerUserId: input.ownerUserId,
          ownerOrganizationId: input.ownerOrganizationId,
          recipientEnc: encryptJson(this.cipher, input.recipient),
          lines: input.lines as unknown as object[],
          exemptCents: totals.exemptCents,
          stampDutyCents: totals.stampDutyCents,
          totalCents: totals.totalCents,
          vatNature: totals.vatNature,
          legalReference: totals.legalReference,
          issuedOn: new Date(issuedOn),
          dueOn: input.dueOn ? new Date(input.dueOn) : null,
          quoteRequestId: input.quoteRequestId ?? null,
          remittanceId: input.remittanceId ?? null,
          period: input.period ?? null,
          creditedInvoiceId: input.creditedInvoiceId,
          createdAt: now,
          updatedAt: now,
        },
      });
    });
  }

  /**
   * After the commit: the XML to SDI (checked against the schema by the
   * adapter) and the courtesy PDF. An incomplete recipient stays «da
   * completare»; a failure is logged and retried by the next delivery.
   */
  async deliver(invoiceId: string): Promise<void> {
    try {
      await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
        if (invoice.sdiStatus !== "TO_SEND") return;
        const recipient = decryptJson(this.cipher, invoice.recipientEnc) as InvoiceRecipient;
        const astax = await tx.organization.findFirstOrThrow({ where: { type: "ASTAX" } });
        const astaxAddress = astax.address as {
          street: string;
          postalCode: string;
          municipalityIstat: string;
          province: string;
        } | null;
        const lines = invoice.lines as unknown as InvoiceLine[];
        await this.courtesyPdf(tx, invoice, recipient, lines);
        if (!recipientComplete(recipient) || !astax.vatNumber || !astaxAddress) return;
        const credited = invoice.creditedInvoiceId
          ? await tx.invoice.findUnique({ where: { id: invoice.creditedInvoiceId } })
          : null;
        const date = invoice.issuedOn.toISOString().slice(0, 10);
        const sent = await this.sdi.send({
          // Ten characters at most: the series and the number, never personal data.
          progressive: `${invoice.series}${String(invoice.year).slice(2)}${String(invoice.number).padStart(7, "0")}`,
          documentType: invoice.series === "N" ? "TD04" : "TD01",
          number: invoice.code,
          date,
          supplier: {
            vatNumber: astax.vatNumber,
            name: astax.legalName,
            address: (await this.addressOf(tx, astaxAddress)) ?? {
              street: "",
              postalCode: "",
              city: "",
            },
          },
          customer: {
            name: recipient.name,
            givenName: recipient.givenName ?? null,
            surname: recipient.surname ?? null,
            fiscalCode: recipient.fiscalCode ?? null,
            vatNumber: recipient.vatNumber ?? null,
            address: recipient.address ?? { street: "", postalCode: "", city: "" },
          },
          recipientCode: recipient.sdiCode ?? "0000000",
          recipientPec: recipient.pec ?? null,
          lines,
          vatNature: invoice.vatNature,
          legalReference: invoice.legalReference,
          stampDutyCents: invoice.stampDutyCents,
          stampDutyCharged: invoice.totalCents > invoice.exemptCents,
          totalCents: invoice.totalCents,
          dueDate: invoice.dueOn ? invoice.dueOn.toISOString().slice(0, 10) : null,
          correctedInvoice: credited
            ? { number: credited.code, date: credited.issuedOn.toISOString().slice(0, 10) }
            : null,
        });
        const xmlKey = `invoices/${invoice.id}.xml`;
        await this.storage.put({
          key: xmlKey,
          body: new TextEncoder().encode(sent.xml),
          contentType: "application/xml",
        });
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { sdiStatus: sent.status, sdiRef: sent.sdiRef, xmlKey },
        });
      });
    } catch (error) {
      this.logger.error({ invoiceId, err: errorForLog(error) }, "invoice not delivered");
    }
  }

  /** The SDI state of an invoice still on its way (the fake delivers after a few seconds). */
  async refresh(tx: DbTransaction, invoice: Invoice): Promise<Invoice> {
    if (invoice.sdiStatus !== "SENT" || !invoice.sdiRef) return invoice;
    const status = await this.sdi.getStatus(invoice.sdiRef);
    if (status === invoice.sdiStatus) return invoice;
    return asSystem(tx, () =>
      tx.invoice.update({ where: { id: invoice.id }, data: { sdiStatus: status } }),
    );
  }

  private async courtesyPdf(
    tx: DbTransaction,
    invoice: Invoice,
    recipient: InvoiceRecipient,
    lines: InvoiceLine[],
  ) {
    if (invoice.pdfDocumentId) return;
    const l = labels.invoice;
    const rows: [string, string][] = [
      [l.number, invoice.code],
      [l.date, invoice.issuedOn.toISOString().slice(0, 10)],
      [l.recipient, recipient.name],
      ...lines.map((line): [string, string] => [
        line.description,
        `${line.quantity} x ${formatEuroCents(line.unitCents)}`,
      ]),
      [l.exempt, formatEuroCents(invoice.exemptCents)],
      ...(invoice.stampDutyCents > 0
        ? [[l.stampDuty, formatEuroCents(invoice.stampDutyCents)] as [string, string]]
        : []),
      [l.total, formatEuroCents(invoice.totalCents)],
    ];
    const body = await acceptancePdf({
      title:
        invoice.series === "N"
          ? `${l.creditNoteTitle} ${invoice.code}`
          : `${l.title} ${invoice.code}`,
      legalText: `${invoice.vatNature} — ${invoice.legalReference}`,
      versionLabel: l.courtesy,
      dataTitle: l.dataTitle,
      rows,
    });
    const storageKey = `invoices/${invoice.id}.pdf`;
    await this.storage.put({ key: storageKey, body, contentType: "application/pdf" });
    const document = await tx.document.create({
      data: {
        kind: "INVOICE_PDF",
        ownerUserId: invoice.ownerUserId,
        ownerOrganizationId: invoice.ownerOrganizationId,
        quoteRequestId: invoice.quoteRequestId,
        storageKey,
        sha256: createHash("sha256").update(body).digest("hex"),
        mime: "application/pdf",
        size: body.length,
        fileName: `${invoice.code}.pdf`,
        uploadedByUserId: invoice.ownerUserId ?? ASTAX_ISSUED,
      },
    });
    await tx.invoice.update({ where: { id: invoice.id }, data: { pdfDocumentId: document.id } });
  }
}
