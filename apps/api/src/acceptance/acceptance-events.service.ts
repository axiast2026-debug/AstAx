import { createHash } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { PaymentEvent, PaymentsPort } from "@astax/adapters/payments";
import {
  InvalidWebhookError,
  type SignatureEvent,
  type SignaturePort,
} from "@astax/adapters/signature";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import {
  addRequestEvent,
  asSystem,
  publishLastRanking,
  recordDomainEvent,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
  type DbTransaction,
  type Acceptance,
  type QuoteRequest,
} from "@astax/db";
import { coverStartAt, issuanceDeadline, transitionOffer } from "@astax/shared/domain";
import {
  dbDateToCalendarDate,
  formatDate,
  formatDateTime,
  formatEuroCents,
} from "@astax/shared/format";
import type { Logger } from "@astax/shared/logging";
import { Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import type { ApiConfig } from "../config/config.js";
import { ProblemError } from "../http/problem.js";
import {
  CLOCK,
  CONFIG,
  DB,
  FIELD_CIPHER,
  LOGGER,
  OBJECT_STORAGE,
  PAYMENTS,
  SIGNATURE,
} from "../infra/tokens.js";
import labels from "../notifications/labels.it.json" with { type: "json" };
import { NotificationService, type Outbound } from "../notifications/notification.service.js";
import {
  label,
  loadNotificationLabels,
  rankingVariables,
  startForNotice,
  vehicleForAgency,
  vehicleForRequester,
  type TemplateVariables,
} from "@astax/shared/notifications";
import { Postbox } from "../notifications/postbox.js";
import { RefundsService } from "../refunds/refunds.service.js";
import { ACCEPTANCE_TX, AcceptanceService } from "./acceptance.service.js";

const SYSTEM_ACTOR = {
  userId: null,
  membershipId: null,
  organizationId: null,
  ip: null,
  userAgent: null,
};

/** What the use case sends after its commit (NotificationService.deliver). */
export type Email = Outbound;

/**
 * The outcomes the providers report by webhook, each handled once
 * (ProviderEvent) and checked against the provider's signature:
 * - signed (LEG-05): the signed files and the evidence become documents of the
 *   request, the request is «Accettata», the ranking is published (CLA-02);
 * - paid (PAG-02): «In emissione», the offer «Vincente», the others «Non
 *   scelta», the issuance deadline (EMI-01), the contacts to the winning
 *   agency (VIS-02), the workflow told through the outbox;
 * - failed (PAG-03): back to «Offerte disponibili», the customer may retry.
 */

const NOTIFICATION_LABELS = loadNotificationLabels();
@Injectable()
export class AcceptanceEventsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(RefundsService) private readonly refunds: RefundsService,
    @Inject(SIGNATURE) private readonly signature: SignaturePort,
    @Inject(PAYMENTS) private readonly payments: PaymentsPort,
    @Inject(AcceptanceService) private readonly acceptance: AcceptanceService,
  ) {}

  /** The webhook was seen already: nothing to do (docs/modello-dati.md). */
  private async firstTime(tx: DbTransaction, provider: string, eventId: string, type: string) {
    const created = await tx.providerEvent.createMany({
      data: [{ provider, eventId, type, receivedAt: this.clock.now() }],
      skipDuplicates: true,
    });
    return created.count > 0;
  }

  async sendAll(emails: Email[]) {
    await this.notifications.send(emails.splice(0));
  }

  private requesterLink(request: QuoteRequest) {
    return `${this.config.WEB_URL}${request.channel === "PRIVATE" ? "/preventivi" : "/richieste"}/${request.id}`;
  }

  /** In-app rows now, the rest after the commit (rule 8: identifiers in the logs). */
  private async tell(
    tx: DbTransaction,
    emails: Email[],
    users: { id: string; locale: "it" | "sq"; emailEnc: string | null; phoneEnc?: string | null }[],
    eventKey: string,
    variables: TemplateVariables,
    link: string,
    payload: Record<string, string>,
  ) {
    emails.push(
      ...(await this.notifications.deliver(
        tx,
        users.map((u) => ({
          userId: u.id,
          locale: u.locale,
          email: u.emailEnc ? this.cipher.decrypt(u.emailEnc) : null,
          phone: u.phoneEnc ? this.cipher.decrypt(u.phoneEnc) : null,
        })),
        eventKey,
        () => variables,
        new URL(link, this.config.WEB_URL).pathname,
        payload,
      )),
    );
  }

  private agencyUsers(tx: DbTransaction, organizationId: string, authorUserId: string | null) {
    return asSystem(tx, async () =>
      (
        await tx.membership.findMany({
          where: {
            organizationId,
            status: "ACTIVE",
            OR: [
              { role: { in: ["OWNER", "SUPERVISOR"] } },
              ...(authorUserId ? [{ userId: authorUserId }] : []),
              { canIssue: true },
            ],
          },
          include: { user: true },
        })
      ).map((m) => m.user),
    );
  }

  // ---------------------------------------------------------------- signature

  async signatureWebhook(headers: Record<string, string | undefined>, body: string) {
    let event: SignatureEvent;
    try {
      event = this.signature.parseWebhook(headers, body);
    } catch (error) {
      if (error instanceof InvalidWebhookError) throw new ProblemError("UNAUTHENTICATED");
      throw error;
    }
    const emails: Email[] = [];
    const postbox = new Postbox(this.notifications, this.cipher, this.config.WEB_URL);
    // The signed files are read before the transaction: no storage call holds
    // the lock on the request (a slow storage made the transaction expire).
    const files = new Map<string, { sha256: string; size: number }>();
    if (event.status === "SIGNED") {
      const keys = [
        ...event.signedFileKeys,
        ...(event.evidenceFileKey ? [event.evidenceFileKey] : []),
      ];
      for (const key of keys) {
        const body = await this.storage.get(key);
        files.set(key, {
          sha256: createHash("sha256").update(body).digest("hex"),
          size: body.length,
        });
      }
    }
    await withContext(
      this.db,
      SYSTEM_CONTEXT,
      async (tx) => {
        if (!(await this.firstTime(tx, this.signature.provider, event.eventId, event.status)))
          return;
        const envelope = await tx.signatureEnvelope.findUnique({
          where: { providerRef: event.providerRef },
          include: { acceptance: true },
        });
        if (!envelope || envelope.status !== "PENDING") return;
        // The same lock as the acceptance and the payment: one change at a time.
        await tx.$queryRaw`SELECT 1 FROM "QuoteRequest" WHERE "id" = ${envelope.acceptance.quoteRequestId}::uuid FOR UPDATE`;
        const now = this.clock.now();
        if (event.status !== "SIGNED") {
          await tx.signatureEnvelope.update({
            where: { id: envelope.id },
            data: { status: event.status },
          });
          // Refused or expired: the acceptance lapses, the customer chooses again
          // and gets a new envelope (decision 22).
          if (envelope.acceptance.status === "PENDING_SIGNATURE") {
            await tx.acceptance.update({
              where: { id: envelope.acceptance.id },
              data: { status: "VOIDED", voidedAt: now, voidReason: `SIGNATURE_${event.status}` },
            });
          }
          return;
        }
        const a = envelope.acceptance;
        if (a.status !== "PENDING_SIGNATURE") return;
        const request = await tx.quoteRequest.findUniqueOrThrow({
          where: { id: a.quoteRequestId },
        });
        const kept = async (key: string, kind: "SIGNED_DOCUMENT" | "SIGNATURE_EVIDENCE") => {
          const file = files.get(key);
          if (!file) throw new Error("Signed file not read");
          const document = await tx.document.create({
            data: {
              kind,
              ownerUserId: request.ownerUserId,
              ownerOrganizationId: request.ownerOrganizationId,
              quoteRequestId: request.id,
              storageKey: key,
              sha256: file.sha256,
              mime: "application/pdf",
              size: file.size,
              fileName: `${kind.toLowerCase()}.pdf`,
              uploadedByUserId: request.requesterUserId,
            },
          });
          return document.id;
        };
        const signedIds: string[] = [];
        for (const key of event.signedFileKeys) signedIds.push(await kept(key, "SIGNED_DOCUMENT"));
        const evidenceId = event.evidenceFileKey
          ? await kept(event.evidenceFileKey, "SIGNATURE_EVIDENCE")
          : null;
        await tx.signatureEnvelope.update({
          where: { id: envelope.id },
          data: { status: "SIGNED", signedDocumentIds: signedIds, evidenceDocumentId: evidenceId },
        });
        await tx.acceptance.update({
          where: { id: a.id },
          data: { status: "SIGNED", signedAt: now },
        });
        await this.acceptance.setStatus(tx, request, "ACCEPTED");
        await addRequestEvent(tx, request, {
          type: "ACCEPTANCE_SIGNED",
          actorKind: a.customerLinkId ? "CUSTOMER" : "REQUESTER",
          actorUserId: a.acceptedByUserId,
          at: now,
        });
        await this.audit.inTransaction(tx, SYSTEM_ACTOR, {
          action: "ACCEPTANCE_SIGNED",
          targetType: "QuoteRequest",
          targetId: request.id,
          after: { acceptanceId: a.id, signedDocuments: signedIds.length },
        });
        await this.publishRanking(tx, emails, request, now);
        // EMI-04: a second offer that costs the same or less is settled at the signature;
        // what was paid in excess comes back with a refund to approve (PAG-05).
        if (a.creditPremiumCents > 0 || a.creditFeeCents > 0) {
          const premiumDue = a.premiumCents - a.creditPremiumCents;
          const feeDue = a.feeCents - a.creditFeeCents;
          if (premiumDue <= 0 && feeDue <= 0) {
            const signed = await tx.acceptance.findUniqueOrThrow({ where: { id: a.id } });
            const current = await tx.quoteRequest.findUniqueOrThrow({ where: { id: request.id } });
            await this.confirmPaid(tx, emails, current, signed, null, now);
            if (premiumDue < 0 || feeDue < 0) {
              await this.refunds.request(tx, postbox, {
                quoteRequestId: request.id,
                reason: "SECOND_OFFER_DIFFERENCE",
                premiumCents: -premiumDue,
                feeCents: -feeDue,
                requestedByUserId: null,
                requestedByLabel: labels.refundRequester.system,
              });
            }
          }
        }
      },
      ACCEPTANCE_TX,
    );
    await this.sendAll(emails);
    await postbox.flush();
  }

  /**
   * CLA-02, decision 32: at the signature, or at the cancellation of a
   * request without acceptance, the ranking of the last round with valid
   * offers goes to the participating agencies, once. Each learns its
   * position, the first two premiums (anonymous) and its own (question 15A).
   */
  async publishRanking(tx: DbTransaction, emails: Email[], request: QuoteRequest, now: Date) {
    const published = await asSystem(tx, () => publishLastRanking(tx, request.id, now));
    if (!published) return;
    await this.audit.inTransaction(tx, SYSTEM_ACTOR, {
      action: "RANKING_PUBLISHED",
      targetType: "Auction",
      targetId: published.auctionId,
      after: { validCount: published.validCount },
    });
    const link = `${this.config.WEB_URL}/risultati`;
    for (const e of published.entries) {
      if (!e.organizationId) continue;
      await this.tell(
        tx,
        emails,
        await this.agencyUsers(tx, e.organizationId, published.authors[e.offerId] ?? null),
        "ranking.available",
        {
          codice: request.code,
          ...rankingVariables(published.entries, e, formatEuroCents),
          posizione: String(e.rank),
          totale_offerte: String(published.validCount),
          link,
        },
        link,
        { auctionId: published.auctionId },
      );
    }
    for (const o of published.excluded) {
      await this.tell(
        tx,
        emails,
        await this.agencyUsers(tx, o.organizationId, o.userId),
        "ranking.available.excluded",
        { codice: request.code, link: `${this.config.WEB_URL}/le-mie-offerte` },
        `${this.config.WEB_URL}/le-mie-offerte`,
        { auctionId: published.auctionId },
      );
    }
  }

  // ---------------------------------------------------------------- payment

  async paymentWebhook(headers: Record<string, string | undefined>, body: string) {
    let event: PaymentEvent;
    try {
      event = this.payments.parseWebhook(headers, body);
    } catch (error) {
      if (error instanceof InvalidWebhookError) throw new ProblemError("UNAUTHENTICATED");
      throw error;
    }
    const emails: Email[] = [];
    await withContext(
      this.db,
      SYSTEM_CONTEXT,
      async (tx) => {
        if (!(await this.firstTime(tx, this.payments.provider, event.eventId, event.status)))
          return;
        const payment = await tx.payment.findUnique({
          where: { providerRef: event.providerRef },
          include: { acceptance: true },
        });
        if (!payment || ["CAPTURED", "FAILED", "REFUNDED"].includes(payment.status)) return;
        const now = this.clock.now();
        await tx.$queryRaw`SELECT 1 FROM "QuoteRequest" WHERE "id" = ${payment.acceptance.quoteRequestId}::uuid FOR UPDATE`;
        const request = await tx.quoteRequest.findUniqueOrThrow({
          where: { id: payment.acceptance.quoteRequestId },
        });
        if (event.status === "PENDING") {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: "AUTHORIZED", method: event.method },
          });
          return;
        }
        if (event.status === "FAILED") {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: "FAILED", method: event.method, failedAt: now },
          });
          if (request.status === "ACCEPTED")
            await this.acceptance.setStatus(tx, request, "OFFERS_AVAILABLE");
          await this.audit.inTransaction(tx, SYSTEM_ACTOR, {
            action: "PAYMENT_FAILED",
            targetType: "QuoteRequest",
            targetId: request.id,
            after: { paymentId: payment.id },
          });
          const offer = await tx.offer.findUniqueOrThrow({
            where: { id: payment.acceptance.offerId },
          });
          await this.tell(
            tx,
            emails,
            await this.payers(tx, request),
            "payment.failed",
            {
              nome: await this.payerName(tx, request),
              veicolo: await this.vehicle(tx, request),
              garanzia: offer.guaranteeUntil
                ? formatDate(dbDateToCalendarDate(offer.guaranteeUntil))
                : "",
              link: this.requesterLink(request),
            },
            this.requesterLink(request),
            { quoteRequestId: request.id },
          );
          return;
        }
        // CAPTURED (PAG-02).
        const a = payment.acceptance;
        if (a.status !== "SIGNED" || request.status !== "ACCEPTED" || !request.startDate) {
          // Paid for an acceptance no longer valid: AstAx refunds it (phase 6); an alarm now.
          this.logger.error(
            { paymentId: payment.id, requestId: request.id },
            "payment captured for an acceptance no longer valid",
          );
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: "CAPTURED", capturedAt: now, method: event.method },
          });
          return;
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "CAPTURED", capturedAt: now, method: event.method },
        });
        await this.confirmPaid(tx, emails, request, a, payment.id, now);
      },
      ACCEPTANCE_TX,
    );
    await this.sendAll(emails);
  }

  /**
   * PAG-02: the acceptance is paid: «In emissione», the offer «Vincente», the
   * others «Non scelta», the issuance deadline (EMI-01), the contacts to the
   * agency (VIS-02), the workflow told. Also for a second offer that has
   * nothing to pay (EMI-04), with no payment.
   */
  async confirmPaid(
    tx: DbTransaction,
    emails: Email[],
    request: QuoteRequest,
    a: Acceptance,
    paymentId: string | null,
    now: Date,
  ) {
    if (!request.startDate) throw new Error("A paid request has a start date");
    const rules = await this.acceptance.issuanceRules(tx, now);
    const startDate = dbDateToCalendarDate(request.startDate);
    const deadline = issuanceDeadline(
      rules.calendar,
      now,
      startDate,
      rules.hours,
      request.startMode,
    );
    // Question 1: «dalle 24:00» is known now; «immediata» waits for the issuance.
    const decorrenza = startForNotice(
      {
        startMode: request.startMode,
        startDate,
        coverStartsAt:
          request.startMode === "MIDNIGHT_AFTER_DEADLINE"
            ? coverStartAt({
                startMode: request.startMode,
                startDate,
                issuanceDeadlineAt: deadline,
              })
            : null,
      },
      (key) => label(NOTIFICATION_LABELS, key, "it"),
    );
    await tx.acceptance.update({
      where: { id: a.id },
      data: { status: "PAID", paidAt: now, issuanceDeadlineAt: deadline },
    });
    await this.acceptance.setStatus(tx, request, "IN_ISSUANCE");
    const won = await tx.offer.findUniqueOrThrow({ where: { id: a.offerId } });
    // EMI-04: a new price of the same agency keeps the offer already «Vincente».
    if (won.status !== "WINNING") {
      transitionOffer("AWAITING_CUSTOMER", "WINNING");
      await tx.offer.update({ where: { id: won.id }, data: { status: "WINNING" } });
    }
    const others = await tx.offer.findMany({
      where: { auctionId: won.auctionId, status: "AWAITING_CUSTOMER", id: { not: won.id } },
    });
    if (others.length > 0) transitionOffer("AWAITING_CUSTOMER", "NOT_CHOSEN");
    await tx.offer.updateMany({
      where: { id: { in: others.map((o) => o.id) } },
      data: { status: "NOT_CHOSEN" },
    });
    await addRequestEvent(tx, request, {
      type: "PAYMENT_CONFIRMED",
      actorKind: "SYSTEM",
      actorUserId: null,
      at: now,
      details: { issuanceDeadlineAt: deadline.toISOString() },
    });
    await recordDomainEvent(tx, {
      aggregateType: "QuoteRequest",
      aggregateId: request.id,
      type: "PaymentConfirmed",
      at: now,
      actorUserId: null,
      data: { acceptanceId: a.id, issuanceDeadlineAt: deadline.toISOString() },
    });
    await this.audit.inTransaction(tx, SYSTEM_ACTOR, {
      action: "PAYMENT_CONFIRMED",
      targetType: "QuoteRequest",
      targetId: request.id,
      after: { paymentId, acceptanceId: a.id, offerId: won.id },
    });
    const agency = await tx.organization.findUniqueOrThrow({ where: { id: won.organizationId } });
    const company = won.companyId
      ? ((await tx.insuranceCompany.findUnique({ where: { id: won.companyId } }))?.name ?? "")
      : "";
    const vehicle = await this.vehicle(tx, request);
    const term = formatDateTime(deadline);
    const amounts = {
      totale: formatEuroCents(a.premiumCents + a.feeCents),
      premio: formatEuroCents(a.premiumCents),
      fee: formatEuroCents(a.feeCents),
    };
    await this.tell(
      tx,
      emails,
      await this.payers(tx, request),
      "payment.confirmed",
      {
        nome: await this.payerName(tx, request),
        veicolo: vehicle,
        ...amounts,
        agenzia: agency.legalName,
        termine_emissione: term,
        link: this.requesterLink(request),
      },
      this.requesterLink(request),
      { quoteRequestId: request.id },
    );
    // Phase 8: the broker's customer has no account; an email without a link.
    if (request.channel === "BROKER" && request.customerId) {
      const customer = await tx.customer.findUnique({
        where: { id: request.customerId },
        include: { person: true },
      });
      if (customer?.emailEnc) {
        const broker = await tx.organization.findUnique({
          where: { id: request.ownerOrganizationId ?? "" },
        });
        emails.push(
          await this.notifications.queueEmail(
            tx,
            this.cipher.decrypt(customer.emailEnc),
            "payment.confirmed.customer",
            {
              nome: customer.person.givenName ?? customer.person.companyName ?? "",
              veicolo: vehicle,
              agenzia: agency.legalName,
              termine_emissione: term,
              broker: broker?.legalName ?? "",
            },
            { quoteRequestId: request.id },
          ),
        );
      }
    }
    const toIssue = `${this.config.WEB_URL}/da-emettere`;
    await this.tell(
      tx,
      emails,
      await this.agencyUsers(tx, won.organizationId, won.userId),
      "offer.won",
      {
        codice: request.code,
        veicolo: await this.vehicle(tx, request, "agency"),
        premio: amounts.premio,
        compagnia: company,
        termine_emissione: term,
        decorrenza,
        link: toIssue,
      },
      toIssue,
      { quoteRequestId: request.id },
    );
    const staff = await tx.membership.findMany({
      where: {
        organization: { type: "ASTAX" },
        role: { in: ["BO_VERIFIER", "BO_SUPERVISOR"] },
        status: "ACTIVE",
      },
      include: { user: true },
    });
    await this.notifications.inApp(
      tx,
      staff.map((m) => ({ userId: m.user.id, locale: m.user.locale })),
      "offer.won.bo",
      () => ({
        codice: request.code,
        agenzia: agency.legalName,
        termine_emissione: term,
        link: `${this.config.ADMIN_URL}/aste`,
      }),
      "/aste",
      { quoteRequestId: request.id },
    );
  }

  /** Who paid: the private user, or the broker's customer and the broker's user. */
  private async payers(tx: DbTransaction, request: QuoteRequest) {
    const requester = await tx.user.findUniqueOrThrow({ where: { id: request.requesterUserId } });
    return [{ id: requester.id, locale: requester.locale, emailEnc: requester.emailEnc }];
  }

  private async payerName(tx: DbTransaction, request: QuoteRequest) {
    return (await tx.user.findUniqueOrThrow({ where: { id: request.requesterUserId } })).firstName;
  }

  /** Question 15A: with the plate for the payer, make and model for the agency. */
  private async vehicle(
    tx: DbTransaction,
    request: QuoteRequest,
    to: "payer" | "agency" = "payer",
  ) {
    const { vehicle } = await this.acceptance.quoteDataOf(tx, request);
    return to === "agency" ? vehicleForAgency(vehicle) : vehicleForRequester(vehicle);
  }
}
