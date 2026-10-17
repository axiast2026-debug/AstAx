import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import {
  asSystem,
  SYSTEM_CONTEXT,
  withContext,
  type CustomerLink,
  type DbClient,
  type DbTransaction,
  type QuoteRequest,
} from "@astax/db";
import { endOfRomeDay } from "@astax/shared/domain";
import { formatDate, formatDateTime } from "@astax/shared/format";
import type { Logger } from "@astax/shared/logging";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService, type AuditActor } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import type { ApiConfig } from "../config/config.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, CONFIG, DB, LOGGER, OBJECT_STORAGE } from "../infra/tokens.js";
import { NotificationService } from "../notifications/notification.service.js";
import { ConsentService, type ClientInfo } from "../requests/consent.service.js";
import { AcceptanceService } from "./acceptance.service.js";

const TOKEN = /^[A-Za-z0-9_-]{40,60}$/;

/**
 * The broker channel (decision 26, spec 02 «Invia al cliente»): the broker
 * sends one or more offers to the customer, who opens a link with a secret
 * token, confirms with a code sent to their own contacts (OtpPurpose
 * CUSTOMER_LINK), reads, signs and pays the premium only (FEE-03). No AI
 * comparison on a link (PRES-06). The link ends with the last guarantee of
 * the offers sent (GAR-02) and when the broker sends a new one.
 *
 * After the code the API gives the page a proof, an HMAC of the link and the
 * moment of the check: every later call needs token and proof, so a link
 * forwarded to someone else is useless without the customer's code.
 */
@Injectable()
export class CustomerLinksService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(ConsentService) private readonly consents: ConsentService,
    @Inject(AcceptanceService) private readonly acceptance: AcceptanceService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  private hash(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private proofOf(link: CustomerLink): string | null {
    if (!link.otpVerifiedAt) return null;
    return createHmac("sha256", this.config.BLIND_INDEX_KEY)
      .update(`customer-link:${link.id}:${link.otpVerifiedAt.toISOString()}`)
      .digest("base64url");
  }

  private proofMatches(link: CustomerLink, proof: string | undefined): boolean {
    const expected = this.proofOf(link);
    if (!expected || !proof) return false;
    const a = Buffer.from(expected);
    const b = Buffer.from(proof);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private offerIdsOf(link: CustomerLink): string[] {
    return Array.isArray(link.offerIds) ? (link.offerIds as string[]) : [];
  }

  /** Make and model only: no plate in notifications or before the code (rule 8). */
  private async vehicle(tx: DbTransaction, request: QuoteRequest) {
    const data = await this.acceptance.quoteDataOf(tx, request);
    return `${data.vehicle.make} ${data.vehicle.model}`;
  }

  /**
   * Where the providers send the customer back: the link's id, never its
   * secret token (rule 8); the page finds the token in the customer's cookie.
   */
  private returnUrl(linkId: string) {
    return `${this.config.WEB_URL}/offerta/ritorno/${linkId}`;
  }

  // ---------------------------------------------------------------- broker

  /** «Invia al cliente»: a new link replaces the previous one. */
  async send(auth: AuthContext, requestId: string, offerIds: string[]) {
    if (auth.kind === "PRIVATE") throw new ProblemError("FORBIDDEN");
    const now = this.clock.now();
    const token = randomBytes(32).toString("base64url");
    const sent = await withContext(this.db, auth.db, async (tx) => {
      const request = await this.acceptance.requestOf(tx, auth, requestId);
      if (request.channel !== "BROKER" || !request.ownerOrganizationId || !request.customerId) {
        throw new ProblemError("FORBIDDEN");
      }
      if (!["OFFERS_AVAILABLE", "ACCEPTED"].includes(request.status)) {
        throw new ProblemError("CONFLICT", "No offers to send", [
          { path: "request", issue: "NO_OFFERS_AVAILABLE" },
        ]);
      }
      const ids = [...new Set(offerIds)];
      const { rows } = await this.acceptance.rows(tx, request, ids);
      if (rows.length !== ids.length) throw new ProblemError("NOT_FOUND");
      const blocked = rows.find((r) => r.block);
      if (blocked) {
        throw new ProblemError("CONFLICT", "An offer cannot be accepted", [
          {
            path: "offerIds",
            issue: blocked.block === "EXPIRED" ? "OFFER_EXPIRED" : "TOO_LATE_TO_ACCEPT",
          },
        ]);
      }
      const contacts = await asSystem(tx, () =>
        this.consents.contactsOf(tx, request.customerId as string),
      );
      if (!contacts.email && !contacts.phone) {
        throw new ProblemError("VALIDATION_FAILED", "The customer has no email or phone", [
          { path: "customer", issue: "NO_CONTACTS" },
        ]);
      }
      const lastGuarantee = rows
        .map((r) => r.guaranteeUntil)
        .sort()
        .at(-1) as string;
      // The links are written only as a system step (RLS): the checks are above.
      const link = await asSystem(tx, async () => {
        await tx.customerLink.updateMany({
          where: { quoteRequestId: request.id, revokedAt: null },
          data: { revokedAt: now, updatedAt: now },
        });
        return tx.customerLink.create({
          data: {
            quoteRequestId: request.id,
            ownerOrganizationId: request.ownerOrganizationId as string,
            offerIds: ids,
            tokenHash: this.hash(token),
            expiresAt: endOfRomeDay(lastGuarantee),
            sentByUserId: auth.userId,
            createdAt: now,
            updatedAt: now,
          },
        });
      });
      const customer = await asSystem(tx, () =>
        tx.customer.findUniqueOrThrow({
          where: { id: request.customerId as string },
          include: { person: true },
        }),
      );
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: request.ownerOrganizationId },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "CUSTOMER_LINK_SENT",
        targetType: "QuoteRequest",
        targetId: request.id,
        after: { customerLinkId: link.id, offerIds: ids },
      });
      return {
        link,
        contacts,
        variables: {
          nome: customer.person.givenName ?? customer.person.companyName ?? "",
          broker: organization.legalName,
          veicolo: await this.vehicle(tx, request),
          // Rule 8: company and product, never the price.
          descrizione_offerta: rows.map((r) => `${r.company} ${r.product}`.trim()).join(", "),
          garanzia: formatDate(lastGuarantee),
          link: `${this.config.WEB_URL}/offerta/${token}`,
          scadenza_link: formatDateTime(link.expiresAt),
        },
      };
    });
    const ids = { requestId, customerLinkId: sent.link.id };
    if (sent.contacts.email) {
      await this.notifications.sendEmail(
        sent.contacts.email,
        "offer.link_to_client",
        sent.variables,
        ids,
      );
    }
    if (sent.contacts.phone) {
      await this.notifications.sendSms(
        sent.contacts.phone,
        "offer.link_to_client",
        sent.variables,
        ids,
      );
    }
    this.logger.info(ids, "customer link sent");
    return { expiresAt: sent.link.expiresAt.toISOString(), offerIds: this.offerIdsOf(sent.link) };
  }

  /** The broker's view of the link in force: when it ends, the offers, whether the code was used. */
  async ofRequest(auth: AuthContext, requestId: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const request = await this.acceptance.requestOf(tx, auth, requestId);
      const link = await tx.customerLink.findFirst({
        where: { quoteRequestId: request.id, revokedAt: null },
        orderBy: { createdAt: "desc" },
      });
      return link
        ? {
            expiresAt: link.expiresAt.toISOString(),
            expired: link.expiresAt <= this.clock.now(),
            offerIds: this.offerIdsOf(link),
            opened: link.otpVerifiedAt !== null,
          }
        : null;
    });
  }

  // ---------------------------------------------------------------- customer (no account)

  private async linkOf(tx: DbTransaction, token: string) {
    if (!TOKEN.test(token)) throw new ProblemError("NOT_FOUND");
    const link = await tx.customerLink.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { quoteRequest: true },
    });
    if (!link) throw new ProblemError("NOT_FOUND");
    return link;
  }

  private stateOf(link: CustomerLink, now: Date) {
    if (link.revokedAt) return "REVOKED" as const;
    if (link.expiresAt <= now) return "EXPIRED" as const;
    return "ACTIVE" as const;
  }

  /** The link usable now with its proof, or the reason why not. */
  private async verified(
    tx: DbTransaction,
    token: string,
    proof: string | undefined,
    client: ClientInfo,
  ) {
    const link = await this.linkOf(tx, token);
    const state = this.stateOf(link, this.clock.now());
    // A paid acceptance stays visible after the link ends; nothing else does.
    const paid = await tx.acceptance.findFirst({
      where: { customerLinkId: link.id, status: "PAID" },
    });
    if (state !== "ACTIVE" && !paid) {
      throw new ProblemError("CONFLICT", "The link is no longer valid", [
        { path: "link", issue: "LINK_INVALID" },
      ]);
    }
    if (!this.proofMatches(link, proof)) {
      // Rule 4: a denied access, with the link and never the token.
      await this.audit.record(this.linkActor(client), {
        action: "ACCESS_DENIED",
        targetType: "CustomerLink",
        targetId: link.id,
      });
      throw new ProblemError("FORBIDDEN");
    }
    return { link, request: link.quoteRequest, active: state === "ACTIVE" };
  }

  private linkActor(client: ClientInfo): AuditActor {
    return { userId: null, membershipId: null, organizationId: null, ...client };
  }

  /** What the page shows: before the code only who sends it and for which vehicle. */
  async summary(token: string, proof: string | undefined) {
    const now = this.clock.now();
    return withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const link = await this.linkOf(tx, token);
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: link.ownerOrganizationId },
      });
      const base = {
        linkId: link.id,
        state: this.stateOf(link, now),
        broker: organization.legalName,
        vehicle: await this.vehicle(tx, link.quoteRequest),
        expiresAt: link.expiresAt.toISOString(),
      };
      const live = await tx.acceptance.findFirst({
        where: { customerLinkId: link.id, status: { not: "VOIDED" } },
      });
      const paid = live?.status === "PAID";
      if (!this.proofMatches(link, proof) || (base.state !== "ACTIVE" && !paid)) {
        return { ...base, verified: false as const };
      }
      const { rows } = await this.acceptance.rows(tx, link.quoteRequest, this.offerIdsOf(link));
      return {
        ...base,
        verified: true as const,
        offers: rows.map((r) => {
          const visible = this.acceptance.publicRow(r);
          return { ...visible, feeWithAiCents: null };
        }),
        acceptance: live ? await this.acceptance.view(tx, live.id) : null,
      };
    });
  }

  async sendCode(token: string): Promise<void> {
    const now = this.clock.now();
    const prepared = await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const link = await this.linkOf(tx, token);
      if (this.stateOf(link, now) !== "ACTIVE" || !link.quoteRequest.customerId) {
        throw new ProblemError("CONFLICT", "The link is no longer valid", [
          { path: "link", issue: "LINK_INVALID" },
        ]);
      }
      const challenge = await this.consents.newChallenge(
        tx,
        "CUSTOMER_LINK",
        link.id,
        { ownerUserId: null, ownerOrganizationId: link.ownerOrganizationId },
        now,
      );
      return {
        ...challenge,
        linkId: link.id,
        contacts: await this.consents.contactsOf(tx, link.quoteRequest.customerId),
      };
    });
    await this.consents.sendCode(
      prepared.contacts,
      "CUSTOMER_LINK",
      prepared.code,
      prepared.minutes,
      { customerLinkId: prepared.linkId },
    );
  }

  async confirmCode(token: string, code: string, client: ClientInfo) {
    const now = this.clock.now();
    const actor = this.linkActor(client);
    const outcome = await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const link = await this.linkOf(tx, token);
      if (this.stateOf(link, now) !== "ACTIVE") {
        throw new ProblemError("CONFLICT", "The link is no longer valid", [
          { path: "link", issue: "LINK_INVALID" },
        ]);
      }
      const challenge = await this.consents.verifyChallenge(
        tx,
        "CUSTOMER_LINK",
        link.id,
        code,
        now,
      );
      if (!challenge) return { linkId: link.id, proof: null, expiresAt: null };
      const updated = await tx.customerLink.update({
        where: { id: link.id },
        data: { otpVerifiedAt: now, updatedAt: now },
      });
      await this.audit.inTransaction(tx, actor, {
        action: "CUSTOMER_LINK_OPENED",
        targetType: "QuoteRequest",
        targetId: link.quoteRequestId,
        after: { customerLinkId: link.id, otpChallengeId: challenge.id },
      });
      return {
        linkId: link.id,
        proof: this.proofOf(updated),
        expiresAt: link.expiresAt.toISOString(),
      };
    });
    if (!outcome.proof) {
      await this.audit.record(actor, {
        action: "OTP_FAILED",
        targetType: "CustomerLink",
        targetId: outcome.linkId,
      });
      throw new ProblemError("VALIDATION_FAILED", "Wrong or expired code", [
        { path: "code", issue: "OTP_INVALID" },
      ]);
    }
    return { proof: outcome.proof, expiresAt: outcome.expiresAt, linkId: outcome.linkId };
  }

  /** PRES-05 on the link: only the offers the broker sent; the customer signs. */
  async accept(token: string, proof: string | undefined, offerId: string, client: ClientInfo) {
    return withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const { link, request, active } = await this.verified(tx, token, proof, client);
      if (!active) throw new ProblemError("CONFLICT");
      const customer = await tx.customer.findUniqueOrThrow({
        where: { id: request.customerId ?? "" },
        include: { person: true },
      });
      const id = await this.acceptance.accept(
        tx,
        request,
        { kind: "LINK", userId: null, customerLinkId: link.id, offerIds: this.offerIdsOf(link) },
        offerId,
        {
          firstName: customer.person.givenName ?? customer.person.companyName ?? "",
          lastName: customer.person.surname ?? "",
        },
        this.returnUrl(link.id),
        this.linkActor(client),
      );
      return this.acceptance.view(tx, id);
    });
  }

  async pay(token: string, proof: string | undefined, client: ClientInfo) {
    return withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const { link, request, active } = await this.verified(tx, token, proof, client);
      if (!active) throw new ProblemError("CONFLICT");
      // PAG-02: only the acceptance signed on this link; after a new link the
      // customer chooses and signs again there.
      const live = await tx.acceptance.findFirst({
        where: { quoteRequestId: request.id, status: { not: "VOIDED" } },
      });
      if (!live || live.customerLinkId !== link.id) {
        throw new ProblemError("CONFLICT", "Sign before paying", [
          { path: "acceptance", issue: "NOT_SIGNED" },
        ]);
      }
      const out = await this.acceptance.pay(tx, request, this.returnUrl(link.id));
      await this.audit.inTransaction(tx, this.linkActor(client), {
        action: "PAYMENT_STARTED",
        targetType: "QuoteRequest",
        targetId: request.id,
      });
      return out;
    });
  }

  /** A document of the acceptance or the PDF quote of an offer sent, for the customer. */
  async file(
    token: string,
    proof: string | undefined,
    target: { documentId: string } | { offerId: string },
    client: ClientInfo,
  ) {
    const document = await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const { link, request } = await this.verified(tx, token, proof, client);
      let documentId: string | null;
      if ("offerId" in target) {
        const { rows } = await this.acceptance.rows(tx, request, this.offerIdsOf(link));
        documentId = rows.find((r) => r.id === target.offerId)?.pdfDocumentId ?? null;
      } else {
        const live = await tx.acceptance.findFirst({
          where: { customerLinkId: link.id, status: { not: "VOIDED" } },
          include: { signature: true },
        });
        const ids = [
          ...((live?.signature?.documentIds as string[] | undefined) ?? []),
          ...((live?.signature?.signedDocumentIds as string[] | undefined) ?? []),
        ];
        documentId = ids.includes(target.documentId) ? target.documentId : null;
      }
      if (!documentId) throw new ProblemError("NOT_FOUND");
      const doc = await tx.document.findUniqueOrThrow({ where: { id: documentId } });
      await this.audit.inTransaction(tx, this.linkActor(client), {
        action: "DOCUMENT_VIEWED",
        targetType: "Document",
        targetId: doc.id,
        after: { customerLinkId: link.id },
      });
      return doc;
    });
    return {
      body: await this.storage.get(document.storageKey),
      mime: document.mime,
      fileName: document.fileName,
    };
  }
}
