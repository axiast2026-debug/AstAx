import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import {
  asSystem,
  SYSTEM_CONTEXT,
  withContext,
  type ConsentMethod,
  type DbClient,
  type DbTransaction,
  type OtpPurpose,
  type QuoteRequest,
} from "@astax/db";
import { QuoteDraftSchema } from "@astax/shared/domain";
import { formatDate } from "@astax/shared/format";
import type { Logger } from "@astax/shared/logging";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService, type AuditActor } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import type { ApiConfig } from "../config/config.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, CONFIG, DB, FIELD_CIPHER, LOGGER } from "../infra/tokens.js";
import { RateLimiter } from "../security/rate-limiter.js";
import labels from "../notifications/labels.it.json" with { type: "json" };
import { NotificationService } from "../notifications/notification.service.js";
import {
  addRequestEvent,
  decryptJson,
  EDITABLE_STATUSES,
  customerScope,
  requesterScope,
  settingsAt,
} from "./request-support.js";

const CONSENT_DOCUMENT_KEY = "privacy-sharing-consent";
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

/**
 * LEG-04: the consent to share the request with the invited agencies.
 * - A private user confirms it with a code sent by AstAx (auth.otp).
 * - A broker sends the customer a link (consent.signature_request); the
 *   customer reads the text and confirms with a code; or the broker uploads
 *   the consent already collected, which the back office checks.
 * Codes are stored only as a keyed hash; contacts never reach logs or URLs.
 */
@Injectable()
export class ConsentService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  private codeHash(challengeId: string, code: string): string {
    return createHmac("sha256", this.config.BLIND_INDEX_KEY)
      .update(`${challengeId}:${code}`)
      .digest("hex");
  }

  private async consentText(tx: DbTransaction, now: Date) {
    const document = await tx.legalDocument.findUniqueOrThrow({
      where: { key: CONSENT_DOCUMENT_KEY },
      include: {
        versions: { where: { publishedAt: { lte: now } }, orderBy: { number: "desc" }, take: 1 },
      },
    });
    const version = document.versions[0];
    if (!version) throw new ProblemError("NOT_FOUND");
    return {
      versionId: version.id,
      title: document.title,
      contentMd: version.contentMd,
      validated: version.status === "VALIDATED",
    };
  }

  /** A denied access to a request, written to the audit log (rule 4). */
  private async denied(auth: AuthContext, id: string, code: "NOT_FOUND" | "FORBIDDEN") {
    await this.audit.record(actorOf(auth), {
      action: "ACCESS_DENIED",
      targetType: "QuoteRequest",
      targetId: id,
    });
    return new ProblemError(code);
  }

  private async findEditable(
    tx: DbTransaction,
    auth: AuthContext,
    id: string,
  ): Promise<QuoteRequest> {
    const request = await tx.quoteRequest.findFirst({ where: { id, ...requesterScope(auth) } });
    if (!request) throw await this.denied(auth, id, "NOT_FOUND");
    if (!(EDITABLE_STATUSES as readonly string[]).includes(request.status)) {
      throw new ProblemError("CONFLICT", "The request is no longer editable");
    }
    if (!request.customerId) throw new ProblemError("CONFLICT", "The request has no customer");
    return request;
  }

  private vehicleLabel(request: QuoteRequest): string {
    if (!request.draftEnc) return request.plate ?? "";
    const draft = QuoteDraftSchema.safeParse(decryptJson(this.cipher, request.draftEnc));
    const v = draft.success ? draft.data.vehicle : undefined;
    return v ? `${v.make} ${v.model} ${v.plate}` : (request.plate ?? "");
  }

  /** Text to read and the consent already given, for the wizard. */
  async status(auth: AuthContext, id: string) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const request = await tx.quoteRequest.findFirst({ where: { id, ...requesterScope(auth) } });
      if (!request?.customerId) throw await this.denied(auth, id, "NOT_FOUND");
      const consent = await tx.consent.findFirst({
        where: { customerId: request.customerId, type: "DATA_SHARING_AGENCIES", revokedAt: null },
        orderBy: { acceptedAt: "desc" },
      });
      const link = await tx.consentLink.findFirst({
        where: { quoteRequestId: id, status: "SENT", expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
      });
      return {
        text: await this.consentText(tx, now),
        consent: consent
          ? { method: consent.method, acceptedAt: consent.acceptedAt.toISOString() }
          : null,
        pendingLink: link ? { expiresAt: link.expiresAt.toISOString() } : null,
      };
    });
  }

  // -------------------------------------------------------------- codes

  async newChallenge(
    tx: DbTransaction,
    purpose: OtpPurpose,
    subjectId: string,
    owner: { ownerUserId: string | null; ownerOrganizationId: string | null },
    now: Date,
  ): Promise<{ code: string; minutes: number }> {
    const settings = await settingsAt(
      tx,
      ["otp.validityMinutes", "otp.maxAttempts", "otp.resendWaitSeconds"],
      now,
    );
    // SIC-05: asking for a new code does not reset the wrong attempts of the
    // last validity window, and codes cannot be asked for in a loop.
    // Times from Clock only (rule 6): a code was issued validityMinutes before it expires.
    const validityMs = settings["otp.validityMinutes"] * MINUTE_MS;
    const recent = await tx.otpChallenge.findMany({
      where: { subjectId, purpose, expiresAt: { gt: now } },
      orderBy: { expiresAt: "desc" },
    });
    const failed = Math.max(0, ...recent.map((c) => c.attempts));
    const last = recent[0];
    // issuedAt comes from Clock; older rows without it fall back on the expiry.
    const lastIssuedAt = last
      ? (last.issuedAt?.getTime() ?? last.expiresAt.getTime() - validityMs)
      : null;
    if (
      failed >= settings["otp.maxAttempts"] ||
      (lastIssuedAt !== null &&
        now.getTime() - lastIssuedAt < settings["otp.resendWaitSeconds"] * 1000)
    ) {
      throw new ProblemError("RATE_LIMITED", "Wait before asking for a new code");
    }
    // A new code replaces the previous ones for the same subject.
    await tx.otpChallenge.updateMany({
      where: { subjectId, purpose, consumedAt: null },
      data: { consumedAt: now },
    });
    const challenge = await tx.otpChallenge.create({
      data: {
        purpose,
        subjectId,
        ...owner,
        codeHash: "",
        issuedAt: now,
        expiresAt: new Date(now.getTime() + settings["otp.validityMinutes"] * MINUTE_MS),
        attempts: failed,
        maxAttempts: settings["otp.maxAttempts"],
      },
    });
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await tx.otpChallenge.update({
      where: { id: challenge.id },
      data: { codeHash: this.codeHash(challenge.id, code) },
    });
    return { code, minutes: settings["otp.validityMinutes"] };
  }

  /** True when the code is right; counts wrong attempts and consumes the code. */
  async verifyChallenge(
    tx: DbTransaction,
    purpose: OtpPurpose,
    subjectId: string,
    code: string,
    now: Date,
  ) {
    const challenge = await tx.otpChallenge.findFirst({
      where: { subjectId, purpose, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge || challenge.attempts >= challenge.maxAttempts) return null;
    if (challenge.codeHash !== this.codeHash(challenge.id, code.trim())) {
      await tx.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      return null;
    }
    await tx.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: now } });
    return challenge;
  }

  async sendCode(
    contacts: { email: string | null; phone: string | null },
    purpose: OtpPurpose,
    code: string,
    minutes: number,
    ids: Record<string, string>,
  ) {
    // Phase 8: at most security.codesPerDestinationPerHour codes to the same
    // number or address, whatever asks for them (the counter holds a blind index).
    if (contacts.email)
      await this.limiter.consume("code", this.cipher.blindIndex("email", contacts.email));
    if (contacts.phone)
      await this.limiter.consume("code", this.cipher.blindIndex("phone", contacts.phone));
    const variables = {
      codice_otp: code,
      scopo: labels.otpPurpose[purpose],
      minuti: String(minutes),
    };
    if (contacts.email)
      await this.notifications.sendEmail(contacts.email, "auth.otp", variables, ids);
    if (contacts.phone)
      await this.notifications.sendSms(contacts.phone, "auth.otp", variables, ids);
  }

  async contactsOf(tx: DbTransaction, customerId: string) {
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
    return {
      email: customer.emailEnc ? this.cipher.decrypt(customer.emailEnc) : null,
      phone: customer.phoneEnc ? this.cipher.decrypt(customer.phoneEnc) : null,
    };
  }

  private async recordConsent(
    tx: DbTransaction,
    request: QuoteRequest,
    method: ConsentMethod,
    evidence: Record<string, string | null>,
    actor: AuditActor,
    now: Date,
  ) {
    const text = await this.consentText(tx, now);
    // The right to record it was checked by the caller (code, link or uploaded form).
    const consent = await asSystem(tx, () =>
      tx.consent.create({
        data: {
          customerId: request.customerId ?? "",
          ownerUserId: request.ownerUserId,
          ownerOrganizationId: request.ownerOrganizationId,
          quoteRequestId: request.id,
          type: "DATA_SHARING_AGENCIES",
          legalVersionId: text.versionId,
          method,
          evidence,
          acceptedAt: now,
        },
      }),
    );
    await addRequestEvent(tx, request, {
      type: "CONSENT_GIVEN",
      actorKind: method === "UPLOADED_BY_BROKER" ? "REQUESTER" : "CUSTOMER",
      actorUserId: actor.userId,
      at: now,
      details: { method },
    });
    await this.audit.inTransaction(tx, actor, {
      action: "CONSENT_GIVEN",
      targetType: "Consent",
      targetId: consent.id,
      after: { method, legalVersionId: text.versionId, quoteRequestId: request.id },
    });
    return { method, acceptedAt: now.toISOString() };
  }

  // -------------------------------------------------------------- private user

  async sendPrivateCode(auth: AuthContext, id: string): Promise<void> {
    const now = this.clock.now();
    const { code, minutes, contacts } = await withContext(this.db, auth.db, async (tx) => {
      const request = await this.findEditable(tx, auth, id);
      if (request.channel !== "PRIVATE") throw await this.denied(auth, id, "FORBIDDEN");
      const challenge = await this.newChallenge(
        tx,
        "PRIVATE_CONSENT",
        id,
        { ownerUserId: request.ownerUserId, ownerOrganizationId: request.ownerOrganizationId },
        now,
      );
      return { ...challenge, contacts: await this.contactsOf(tx, request.customerId ?? "") };
    });
    await this.sendCode(contacts, "PRIVATE_CONSENT", code, minutes, { requestId: id });
  }

  async confirmPrivate(auth: AuthContext, id: string, code: string) {
    const now = this.clock.now();
    const outcome = await withContext(this.db, auth.db, async (tx) => {
      const request = await this.findEditable(tx, auth, id);
      if (request.channel !== "PRIVATE") throw await this.denied(auth, id, "FORBIDDEN");
      const challenge = await this.verifyChallenge(tx, "PRIVATE_CONSENT", id, code, now);
      if (!challenge) return null;
      return this.recordConsent(
        tx,
        request,
        "OTP_PRIVATE",
        { otpChallengeId: challenge.id, ip: auth.ip, userAgent: auth.userAgent },
        actorOf(auth),
        now,
      );
    });
    if (!outcome) {
      await this.audit.record(actorOf(auth), {
        action: "OTP_FAILED",
        targetType: "QuoteRequest",
        targetId: id,
      });
      throw new ProblemError("VALIDATION_FAILED", "Wrong or expired code", [
        { path: "code", issue: "OTP_INVALID" },
      ]);
    }
    return outcome;
  }

  /**
   * Dan, 2026-10-21 (answer 5B, docs/piano-flusso-semplificato.md): the private
   * customer, signed in with the email code, gives every consent with one tick.
   * The text version, the time, the address and the browser are recorded;
   * to be confirmed by the lawyer (docs/punti-aperti.md).
   */
  async acceptPrivate(auth: AuthContext, id: string) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const request = await this.findEditable(tx, auth, id);
      if (request.channel !== "PRIVATE") throw await this.denied(auth, id, "FORBIDDEN");
      return this.recordConsent(
        tx,
        request,
        "CHECKBOX_PRIVATE",
        { ip: auth.ip, userAgent: auth.userAgent },
        actorOf(auth),
        now,
      );
    });
  }

  /**
   * Dan, 2026-10-21 (docs/piano-broker.md, answer 3): the broker signed once the
   * declaration that it has its customers' consent. At the submission of a
   * broker's request without a consent of the customer, the consent is
   * recorded as covered by that declaration, with the acceptance as evidence.
   * Returns null when neither the requester nor the owner of its broker accepted it.
   */
  async fromBrokerDeclaration(tx: DbTransaction, auth: AuthContext, request: QuoteRequest) {
    if (request.channel !== "BROKER" || !request.customerId) return null;
    const now = this.clock.now();
    const acceptance = await asSystem(tx, () =>
      tx.legalAcceptance.findFirst({
        where: {
          version: { document: { key: "broker-clients-declaration" } },
          // Signed by the requester or by the owner of its broker: it covers the whole firm.
          OR: [
            { userId: auth.userId },
            ...(request.ownerOrganizationId
              ? [
                  {
                    user: {
                      memberships: {
                        some: {
                          organizationId: request.ownerOrganizationId,
                          role: "OWNER" as const,
                          status: "ACTIVE" as const,
                        },
                      },
                    },
                  },
                ]
              : []),
          ],
        },
        orderBy: { acceptedAt: "desc" },
      }),
    );
    if (!acceptance) return null;
    await this.recordConsent(
      tx,
      request,
      "BROKER_DECLARATION",
      { legalAcceptanceId: acceptance.id, ip: auth.ip, userAgent: auth.userAgent },
      actorOf(auth),
      now,
    );
    return tx.consent.findFirst({
      where: { customerId: request.customerId, type: "DATA_SHARING_AGENCIES", revokedAt: null },
      orderBy: { acceptedAt: "desc" },
    });
  }

  // -------------------------------------------------------------- broker

  /** Consent collected by the broker and uploaded as a CONSENT_FORM document. */
  async uploadedByBroker(auth: AuthContext, id: string, documentId: string) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const request = await this.findEditable(tx, auth, id);
      if (request.channel !== "BROKER") throw await this.denied(auth, id, "FORBIDDEN");
      const document = await tx.document.findFirst({
        where: { id: documentId, quoteRequestId: id, kind: "CONSENT_FORM", deletedAt: null },
      });
      if (!document) throw new ProblemError("NOT_FOUND");
      return this.recordConsent(
        tx,
        request,
        "UPLOADED_BY_BROKER",
        { documentId },
        actorOf(auth),
        now,
      );
    });
  }

  async sendLink(auth: AuthContext, id: string) {
    const now = this.clock.now();
    const token = randomBytes(32).toString("base64url");
    const sent = await withContext(this.db, auth.db, async (tx) => {
      const request = await this.findEditable(tx, auth, id);
      if (request.channel !== "BROKER" || !request.ownerOrganizationId)
        throw await this.denied(auth, id, "FORBIDDEN");
      const contacts = await this.contactsOf(tx, request.customerId ?? "");
      if (!contacts.email && !contacts.phone) {
        throw new ProblemError("VALIDATION_FAILED", "The customer has no email or phone", [
          { path: "customer", issue: "NO_CONTACTS" },
        ]);
      }
      const { "consent.linkValidityDays": days } = await settingsAt(
        tx,
        ["consent.linkValidityDays"],
        now,
      );
      await tx.consentLink.updateMany({
        where: { quoteRequestId: id, status: "SENT" },
        data: { status: "REVOKED" },
      });
      const link = await tx.consentLink.create({
        data: {
          quoteRequestId: id,
          customerId: request.customerId ?? "",
          ownerOrganizationId: request.ownerOrganizationId,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(now.getTime() + days * DAY_MS),
          sentByUserId: auth.userId,
        },
      });
      const customer = await tx.customer.findUniqueOrThrow({
        where: { id: request.customerId ?? "" },
        include: { person: true },
      });
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: request.ownerOrganizationId },
      });
      await addRequestEvent(tx, request, {
        type: "CONSENT_LINK_SENT",
        actorKind: "REQUESTER",
        actorUserId: auth.userId,
        at: now,
        details: { consentLinkId: link.id },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "CONSENT_LINK_SENT",
        targetType: "ConsentLink",
        targetId: link.id,
      });
      return {
        link,
        contacts,
        variables: {
          nome: customer.person.givenName ?? customer.person.companyName ?? "",
          broker: organization.legalName,
          veicolo: this.vehicleLabel(request),
          link: `${this.config.WEB_URL}/consenso/${token}`,
          scadenza_link: formatDate(link.expiresAt),
        },
      };
    });
    const ids = { requestId: id, consentLinkId: sent.link.id };
    if (sent.contacts.email) {
      await this.notifications.sendEmail(
        sent.contacts.email,
        "consent.signature_request",
        sent.variables,
        ids,
      );
    }
    if (sent.contacts.phone) {
      await this.notifications.sendSms(
        sent.contacts.phone,
        "consent.signature_request",
        sent.variables,
        ids,
      );
    }
    this.logger.info(ids, "consent link sent");
    return { expiresAt: sent.link.expiresAt.toISOString() };
  }

  // -------------------------------------------------------------- customer with the link (no account)

  private async linkByToken(tx: DbTransaction, token: string, now: Date) {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new ProblemError("NOT_FOUND");
    const link = await tx.consentLink.findUnique({
      where: { tokenHash: createHash("sha256").update(token).digest("hex") },
      include: { quoteRequest: true },
    });
    if (!link) throw new ProblemError("NOT_FOUND");
    if (link.status === "SENT" && link.expiresAt <= now) {
      await tx.consentLink.update({ where: { id: link.id }, data: { status: "EXPIRED" } });
      return { ...link, status: "EXPIRED" as const };
    }
    return link;
  }

  /** What the customer sees: who asks, for which vehicle, the text. Never contacts. */
  async linkSummary(token: string) {
    const now = this.clock.now();
    return withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const link = await this.linkByToken(tx, token, now);
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: link.ownerOrganizationId },
      });
      return {
        status:
          link.status === "SENT" &&
          !(EDITABLE_STATUSES as readonly string[]).includes(link.quoteRequest.status)
            ? "REVOKED"
            : link.status,
        broker: organization.legalName,
        vehicle: this.vehicleLabel(link.quoteRequest),
        expiresAt: link.expiresAt.toISOString(),
        text: await this.consentText(tx, now),
      };
    });
  }

  async sendLinkCode(token: string): Promise<void> {
    const now = this.clock.now();
    const prepared = await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const link = await this.linkByToken(tx, token, now);
      // Only while the request can still change: never after submission or cancellation.
      if (
        link.status !== "SENT" ||
        !(EDITABLE_STATUSES as readonly string[]).includes(link.quoteRequest.status)
      ) {
        throw new ProblemError("CONFLICT", "The link is no longer valid");
      }
      const challenge = await this.newChallenge(
        tx,
        "LINK_CONSENT",
        link.id,
        { ownerUserId: null, ownerOrganizationId: link.ownerOrganizationId },
        now,
      );
      return {
        ...challenge,
        linkId: link.id,
        contacts: await this.contactsOf(tx, link.customerId),
      };
    });
    await this.sendCode(prepared.contacts, "LINK_CONSENT", prepared.code, prepared.minutes, {
      consentLinkId: prepared.linkId,
    });
  }

  async confirmLink(token: string, code: string, client: ClientInfo) {
    const now = this.clock.now();
    const actor: AuditActor = { userId: null, membershipId: null, organizationId: null, ...client };
    const outcome = await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const link = await this.linkByToken(tx, token, now);
      // Only while the request can still change: never after submission or cancellation.
      if (
        link.status !== "SENT" ||
        !(EDITABLE_STATUSES as readonly string[]).includes(link.quoteRequest.status)
      ) {
        throw new ProblemError("CONFLICT", "The link is no longer valid");
      }
      const challenge = await this.verifyChallenge(tx, "LINK_CONSENT", link.id, code, now);
      if (!challenge) return { linkId: link.id, result: null };
      await tx.consentLink.update({
        where: { id: link.id },
        data: { status: "COMPLETED", completedAt: now },
      });
      const result = await this.recordConsent(
        tx,
        link.quoteRequest,
        "OTP_LINK",
        {
          otpChallengeId: challenge.id,
          consentLinkId: link.id,
          ip: client.ip,
          userAgent: client.userAgent,
        },
        actor,
        now,
      );
      return { linkId: link.id, result };
    });
    if (!outcome.result) {
      await this.audit.record(actor, {
        action: "OTP_FAILED",
        targetType: "ConsentLink",
        targetId: outcome.linkId,
      });
      throw new ProblemError("VALIDATION_FAILED", "Wrong or expired code", [
        { path: "code", issue: "OTP_INVALID" },
      ]);
    }
    return outcome.result;
  }

  // -------------------------------------------------------------- revocation (LEG-04)

  /** The private user's consents, with date and version of the text (spec 03, «Profilo»). */
  async listOwn(auth: AuthContext) {
    // A broker records revocations from the customer card; they have none of their own.
    if (auth.kind !== "PRIVATE") return [];
    return withContext(this.db, auth.db, async (tx) => {
      const consents = await tx.consent.findMany({
        where: { ownerUserId: auth.userId, ownerOrganizationId: null },
        orderBy: { acceptedAt: "desc" },
      });
      const versionIds = consents.flatMap((c) => (c.legalVersionId ? [c.legalVersionId] : []));
      const versions = await tx.legalDocumentVersion.findMany({
        where: { id: { in: versionIds } },
      });
      return consents.map((c) => ({
        id: c.id,
        type: c.type,
        method: c.method,
        version: versions.find((v) => v.id === c.legalVersionId)?.number ?? null,
        acceptedAt: c.acceptedAt.toISOString(),
        revokedAt: c.revokedAt?.toISOString() ?? null,
      }));
    });
  }

  /**
   * LEG-04: the customer withdraws the consent to share data with the agencies.
   * A private user does it from the profile; a broker records it for their own
   * customer. Every consent of that kind still in force for the customer ends:
   * no new auction opens for them until a new consent is given. Auctions
   * already open go on (they had the consent when they opened).
   */
  async revoke(auth: AuthContext, consentId: string) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const consent = await tx.consent.findFirst({
        where: auth.membership
          ? { id: consentId, customer: customerScope(auth) }
          : { id: consentId, ownerUserId: auth.userId, ownerOrganizationId: null },
      });
      if (!consent) {
        await this.audit.record(actorOf(auth), {
          action: "ACCESS_DENIED",
          targetType: "Consent",
          targetId: consentId,
        });
        throw new ProblemError("NOT_FOUND");
      }
      const ended = await tx.consent.updateMany({
        where: { customerId: consent.customerId, type: consent.type, revokedAt: null },
        data: { revokedAt: now },
      });
      if (ended.count > 0) {
        await this.audit.inTransaction(tx, actorOf(auth), {
          action: "CONSENT_REVOKED",
          targetType: "Customer",
          targetId: consent.customerId,
          after: { type: consent.type, consents: ended.count },
        });
      }
      return { revokedAt: (consent.revokedAt ?? now).toISOString() };
    });
  }
}
