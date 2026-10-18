import { createHash } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { EInvoicingPort } from "@astax/adapters/e-invoicing";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import {
  asSystem,
  createInvoice,
  invoiceAddress,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
  type DbTransaction,
  type Invoice,
  type InvoiceRecipient,
  type NewInvoice,
  type StoredAddress,
} from "@astax/db";
import { type InvoiceLine, type InvoiceSeries } from "@astax/shared/domain";
import { formatEuroCents } from "@astax/shared/format";
import type { Logger } from "@astax/shared/logging";
import { errorForLog } from "@astax/shared/logging";
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { acceptancePdf } from "../acceptance/documents-pdf.js";
import type { ApiConfig } from "../config/config.js";
import {
  CLOCK,
  CONFIG,
  DB,
  E_INVOICING,
  FIELD_CIPHER,
  LOGGER,
  OBJECT_STORAGE,
} from "../infra/tokens.js";
import { NotificationService, type Outbound } from "../notifications/notification.service.js";
import labels from "../notifications/labels.it.json" with { type: "json" };
import { decryptJson } from "../requests/request-support.js";

export type { InvoiceRecipient };

/** The «uploader» of what AstAx itself produces (no user uploads a fee invoice). */
const ASTAX_ISSUED = "00000000-0000-0000-0000-000000000000";

export const recipientComplete = (r: InvoiceRecipient) =>
  Boolean((r.fiscalCode || r.vatNumber) && r.address);

/**
 * CONT-03, CONT-04, decisions 24 and 34: AstAx's fee invoices. The number is
 * taken in the caller's transaction from one counter row per series and year
 * (locked by the update until the commit), so numbers have no gaps even
 * with issues at the same moment; the delivery to SDI happens after.
 */
@Injectable()
export class InvoicingService implements OnApplicationBootstrap, OnApplicationShutdown {
  #timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(E_INVOICING) private readonly sdi: EInvoicingPort,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  /**
   * Phase 8: the invoices still to deliver go to SDI by themselves every
   * INVOICE_DELIVERY_INTERVAL_MS (the broker's monthly ones issued by the
   * worker, those whose delivery failed), without waiting for the back office.
   */
  onApplicationBootstrap(): void {
    const every = this.config.INVOICE_DELIVERY_INTERVAL_MS;
    if (every === 0) return;
    let running = false;
    this.#timer = setInterval(() => {
      if (running) return;
      running = true;
      this.deliverPending()
        .catch((error: unknown) =>
          this.logger.error({ err: errorForLog(error) }, "invoice delivery round failed"),
        )
        .finally(() => {
          running = false;
        });
    }, every);
  }

  onApplicationShutdown(): void {
    if (this.#timer) clearInterval(this.#timer);
  }

  /** The municipality's name from its ISTAT code, for the address on the invoice. */
  addressOf(tx: DbTransaction, address: StoredAddress): Promise<InvoiceRecipient["address"]> {
    return invoiceAddress(tx, address);
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
      settingsAt?: Date | null;
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

  private async create(tx: DbTransaction, input: NewInvoice): Promise<Invoice> {
    return asSystem(tx, () =>
      createInvoice(tx, (plain) => this.cipher.encrypt(plain), input, this.clock.now()),
    );
  }

  /**
   * After the commit: the XML to SDI (checked against the schema by the
   * adapter) and the courtesy PDF. An incomplete recipient stays «da
   * completare»; a failure is logged and retried by the next delivery.
   */
  async deliver(invoiceId: string): Promise<void> {
    const outbound: Outbound[] = [];
    try {
      await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
        // Phase 8: one delivery at a time, also with several API instances.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId}::uuid FOR UPDATE SKIP LOCKED`;
        if (locked.length === 0) return;
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
        if (invoice.sdiStatus !== "TO_SEND") return;
        const recipient = decryptJson(this.cipher, invoice.recipientEnc) as InvoiceRecipient;
        const firstDelivery = invoice.pdfDocumentId === null;
        const astax = await tx.organization.findFirstOrThrow({ where: { type: "ASTAX" } });
        const astaxAddress = astax.address as {
          street: string;
          postalCode: string;
          municipalityIstat: string;
          province: string;
        } | null;
        const lines = invoice.lines as unknown as InvoiceLine[];
        await this.courtesyPdf(tx, invoice, recipient, lines);
        // The courtesy copy exists from now on: its recipient is told, once.
        if (firstDelivery) outbound.push(...(await this.tellAvailable(tx, invoice, lines)));
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
    await this.notifications.send(outbound);
  }

  /**
   * invoice.available: to the private customer who owns the invoice, or to the
   * owners of the organization (broker, agency). The amount is the invoice's,
   * never an offer's price (rule 8).
   */
  private async tellAvailable(
    tx: DbTransaction,
    invoice: Invoice,
    lines: InvoiceLine[],
  ): Promise<Outbound[]> {
    const users = await asSystem(tx, async () =>
      invoice.ownerUserId
        ? await tx.user.findMany({ where: { id: invoice.ownerUserId } })
        : (
            await tx.membership.findMany({
              where: {
                organizationId: invoice.ownerOrganizationId ?? "",
                role: "OWNER",
                status: "ACTIVE",
              },
              include: { user: true },
            })
          ).map((m) => m.user),
    );
    const link = `/fatture/${invoice.id}`;
    return this.notifications.deliver(
      tx,
      users.map((u) => ({
        userId: u.id,
        locale: u.locale === "sq" ? "sq" : "it",
        email: u.emailEnc ? this.cipher.decrypt(u.emailEnc) : null,
        phone: null,
      })),
      "invoice.available",
      () => ({
        numero_fattura: invoice.code,
        importo: formatEuroCents(invoice.totalCents),
        descrizione: lines[0]?.description ?? invoice.code,
        link: new URL(link, this.config.WEB_URL).toString(),
      }),
      link,
      { invoiceId: invoice.id },
    );
  }

  /**
   * The invoices issued and not delivered yet: the broker's monthly ones
   * (issued by the worker's schedule) and those whose delivery failed. Each
   * delivery is idempotent; the incomplete recipients stay «da completare».
   */
  async deliverPending(): Promise<number> {
    const pending = await withContext(this.db, SYSTEM_CONTEXT, (tx) =>
      tx.invoice.findMany({
        where: { sdiStatus: "TO_SEND", OR: [{ xmlKey: null }, { pdfDocumentId: null }] },
        select: { id: true },
        take: 100,
      }),
    );
    for (const { id } of pending) await this.deliver(id);
    return pending.length;
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
