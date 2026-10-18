import { createHash, randomBytes } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import {
  addRequestEvent,
  asSystem,
  looksLikePdf,
  recordDomainEvent,
  settingsAt,
  withContext,
  type DbClient,
  type DbTransaction,
  type Offer,
  type QuoteRequest,
} from "@astax/db";
import {
  addCalendarDays,
  noteProblems,
  policyEndDate,
  renewalNoticeDate,
  transitionOffer,
  transitionRequest,
} from "@astax/shared/domain";
import {
  dbDateToCalendarDate,
  formatDate,
  formatDateTime,
  formatEuroCents,
  romeCalendarDate,
} from "@astax/shared/format";
import { Inject, Injectable } from "@nestjs/common";
import { AcceptanceService } from "../acceptance/acceptance.service.js";
import { acceptancePdf } from "../acceptance/documents-pdf.js";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import type { ApiConfig } from "../config/config.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, CONFIG, DB, FIELD_CIPHER, OBJECT_STORAGE } from "../infra/tokens.js";
import { InvoicingService, type InvoiceRecipient } from "../invoicing/invoicing.service.js";
import labels from "../notifications/labels.it.json" with { type: "json" };
import { NotificationService } from "../notifications/notification.service.js";
import { Postbox, staffUsers } from "../notifications/postbox.js";

/** EMI-02: what the agency uploads before marking the policy as issued. */
export const ISSUANCE_KINDS = ["ISSUED_POLICY", "POLICY_RECEIPT", "INSURANCE_CERTIFICATE"] as const;
export type IssuanceKind = (typeof ISSUANCE_KINDS)[number];

/**
 * The issuance (EMI-01, EMI-02, spec 04 «Da emettere»): the winning agency
 * sees the request with the customer's contacts (VIS-02, only after the
 * payment), downloads the signed documents and the payment receipt, uploads
 * policy, receipt and certificate, and marks the policy as issued. It can
 * also report that it cannot issue (EMI-04): a case for the back office.
 */
@Injectable()
export class IssuanceService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(AcceptanceService) private readonly acceptance: AcceptanceService,
    @Inject(InvoicingService) private readonly invoicing: InvoicingService,
  ) {}

  private agency(auth: AuthContext) {
    const m = auth.membership;
    if (!m || m.organizationType !== "AGENCY") throw new ProblemError("NOT_FOUND");
    return m;
  }

  /** The request this agency won and was paid for, or 404 (logged). */
  private async won(tx: DbTransaction, auth: AuthContext, requestId: string) {
    const m = this.agency(auth);
    const found = await asSystem(tx, async () => {
      const request = await tx.quoteRequest.findUnique({ where: { id: requestId } });
      if (!request || !["IN_ISSUANCE", "ISSUED"].includes(request.status)) return null;
      const acceptance = await tx.acceptance.findFirst({
        where: { quoteRequestId: request.id, status: "PAID" },
        include: { payments: { where: { status: "CAPTURED" } } },
      });
      if (!acceptance) return null;
      const offer = await tx.offer.findUnique({ where: { id: acceptance.offerId } });
      if (!offer || offer.organizationId !== m.organizationId) return null;
      // EMI-04: an agency judged at fault («Mancata emissione») has lost the
      // request, even while the customer waits for the refund or answers a
      // second offer: no contacts, no issuance, no new case.
      if (!["WINNING", "ISSUED"].includes(offer.status)) return null;
      return { request, acceptance, offer };
    });
    if (!found) {
      await this.audit.record(actorOf(auth), {
        action: "ACCESS_DENIED",
        targetType: "QuoteRequest",
        targetId: requestId,
      });
      throw new ProblemError("NOT_FOUND");
    }
    return found;
  }

  private async contactsOf(tx: DbTransaction, request: QuoteRequest) {
    return asSystem(tx, async () => {
      if (request.channel === "BROKER" && request.customerId) {
        const c = await tx.customer.findUniqueOrThrow({ where: { id: request.customerId } });
        return { emailEnc: c.emailEnc, phoneEnc: c.phoneEnc };
      }
      const u = await tx.user.findUniqueOrThrow({ where: { id: request.requesterUserId } });
      return { emailEnc: u.emailEnc, phoneEnc: u.phoneEnc };
    });
  }

  private async issuanceDocuments(tx: DbTransaction, requestId: string) {
    return asSystem(tx, () =>
      tx.document.findMany({
        where: { quoteRequestId: requestId, kind: { in: [...ISSUANCE_KINDS] }, deletedAt: null },
        orderBy: { createdAt: "desc" },
      }),
    );
  }

  /** «Da emettere», detail: all the data, the contacts, the signed documents. */
  async detail(auth: AuthContext, requestId: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const { request, acceptance, offer } = await this.won(tx, auth, requestId);
      const data = await this.acceptance.quoteDataOf(tx, request);
      const contacts = await this.contactsOf(tx, request);
      // In sequence: a system read must not overlap the caller's queries (asSystem).
      const company = offer.companyId
        ? await tx.insuranceCompany.findUnique({ where: { id: offer.companyId } })
        : null;
      const product = offer.productId
        ? await asSystem(tx, () =>
            tx.insuranceProduct.findUnique({ where: { id: offer.productId ?? "" } }),
          )
        : null;
      const signed = await asSystem(tx, () =>
        tx.document.findMany({
          where: { quoteRequestId: request.id, kind: "SIGNED_DOCUMENT", deletedAt: null },
        }),
      );
      const uploaded = await this.issuanceDocuments(tx, request.id);
      const policy = await asSystem(tx, () =>
        tx.policy.findUnique({ where: { quoteRequestId: request.id } }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "CUSTOMER_CONTACTS_VIEWED",
        targetType: "QuoteRequest",
        targetId: request.id,
      });
      const holder = data.policyHolder;
      return {
        requestId: request.id,
        code: request.code,
        status: request.status,
        holder:
          holder.kind === "COMPANY" ? holder.companyName : `${holder.givenName} ${holder.surname}`,
        vehicle: `${data.vehicle.make} ${data.vehicle.model} ${data.vehicle.plate}`,
        startDate: request.startDate ? dbDateToCalendarDate(request.startDate) : null,
        company: company?.name ?? "",
        product: product?.name ?? "",
        premiumCents: acceptance.premiumCents,
        paidAt: acceptance.paidAt?.toISOString() ?? null,
        issuanceDeadlineAt: acceptance.issuanceDeadlineAt?.toISOString() ?? null,
        // VIS-02: the contacts, now that the payment is confirmed.
        email: contacts.emailEnc ? this.cipher.decrypt(contacts.emailEnc) : null,
        phone: contacts.phoneEnc ? this.cipher.decrypt(contacts.phoneEnc) : null,
        signedDocuments: signed.map((d) => ({ id: d.id })),
        uploaded: ISSUANCE_KINDS.map((kind) => {
          const d = uploaded.find((x) => x.kind === kind);
          return {
            kind,
            documentId: d?.id ?? null,
            uploadedAt: d?.createdAt.toISOString() ?? null,
          };
        }),
        policy: policy
          ? { number: policy.policyNumber, issuedAt: policy.issuedAt.toISOString() }
          : null,
      };
    });
  }

  /** EMI-02: polizza, quietanza, certificato as PDF; a new upload replaces the previous one. */
  async upload(auth: AuthContext, requestId: string, kind: IssuanceKind, body: Uint8Array) {
    if (!looksLikePdf(body)) {
      throw new ProblemError("VALIDATION_FAILED", "Not a PDF", [
        { path: "file", issue: "NOT_A_PDF" },
      ]);
    }
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const { request } = await this.won(tx, auth, requestId);
      if (request.status !== "IN_ISSUANCE") throw new ProblemError("CONFLICT");
      const { "documents.maxUploadMb": maxMb } = await settingsAt(
        tx,
        ["documents.maxUploadMb"],
        now,
      );
      if (body.length > maxMb * 1024 * 1024) {
        throw new ProblemError("VALIDATION_FAILED", "Too large", [
          { path: "file", issue: "TOO_LARGE" },
        ]);
      }
      const storageKey = `issuance/${request.id}/${randomBytes(16).toString("hex")}`;
      await this.storage.put({ key: storageKey, body, contentType: "application/pdf" });
      const document = await asSystem(tx, async () => {
        await tx.document.updateMany({
          where: { quoteRequestId: request.id, kind, deletedAt: null },
          data: { deletedAt: now },
        });
        return tx.document.create({
          data: {
            kind,
            // The customer's documents: their owner is the requester (EMI-02).
            ownerUserId: request.ownerUserId,
            ownerOrganizationId: request.ownerOrganizationId,
            quoteRequestId: request.id,
            storageKey,
            sha256: createHash("sha256").update(body).digest("hex"),
            mime: "application/pdf",
            size: body.length,
            fileName: `${kind.toLowerCase()}.pdf`,
            uploadedByUserId: auth.userId,
            createdAt: now,
          },
        });
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "ISSUANCE_DOCUMENT_UPLOADED",
        targetType: "Document",
        targetId: document.id,
        after: { kind, quoteRequestId: request.id },
      });
      return { id: document.id, kind };
    });
  }

  /** A signed document, one of the agency's uploads, or the payment receipt (generated). */
  async file(auth: AuthContext, requestId: string, documentId: string | "receipt") {
    const out = await withContext(this.db, auth.db, async (tx) => {
      const { request, acceptance, offer } = await this.won(tx, auth, requestId);
      if (documentId === "receipt") {
        const payment = acceptance.payments[0];
        const company = offer.companyId
          ? await tx.insuranceCompany.findUnique({ where: { id: offer.companyId } })
          : null;
        const l = labels.receipt;
        const body = await acceptancePdf({
          title: `${l.title} ${request.code}`,
          legalText: l.text,
          versionLabel: "",
          dataTitle: l.dataTitle,
          rows: [
            [l.request, request.code],
            [l.company, company?.name ?? ""],
            [l.premium, formatEuroCents(acceptance.premiumCents)],
            [
              l.method,
              payment?.method
                ? ((l.methods as Record<string, string>)[payment.method] ?? payment.method)
                : "",
            ],
            [l.paidAt, acceptance.paidAt ? formatDateTime(acceptance.paidAt) : ""],
          ],
        });
        return { body, mime: "application/pdf", fileName: `ricevuta-${request.code}.pdf` };
      }
      const doc = await asSystem(tx, () =>
        tx.document.findFirst({
          where: {
            id: documentId,
            quoteRequestId: request.id,
            kind: { in: ["SIGNED_DOCUMENT", ...ISSUANCE_KINDS] },
            deletedAt: null,
          },
        }),
      );
      if (!doc) throw new ProblemError("NOT_FOUND");
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "DOCUMENT_VIEWED",
        targetType: "Document",
        targetId: doc.id,
      });
      return { key: doc.storageKey, mime: doc.mime, fileName: doc.fileName };
    });
    if (out.body) return { body: out.body, mime: out.mime, fileName: out.fileName };
    return { body: await this.storage.get(out.key ?? ""), mime: out.mime, fileName: out.fileName };
  }

  /**
   * EMI-02: «Segna come emessa». The policy with its number; the request
   * «Emessa», the offer «Emessa»; the customer told and the documents in
   * their area; the private customer's fee invoice (CONT-03, decision 24);
   * the workflow told through the outbox.
   */
  async issue(auth: AuthContext, requestId: string, policyNumber: string) {
    const now = this.clock.now();
    const postbox = new Postbox(this.notifications, this.cipher, this.config.WEB_URL);
    const outcome = await withContext(this.db, auth.db, async (tx) => {
      const found = await this.won(tx, auth, requestId);
      await tx.$queryRaw`SELECT 1 FROM "QuoteRequest" WHERE "id" = ${found.request.id}::uuid FOR UPDATE`;
      const request = await asSystem(tx, () =>
        tx.quoteRequest.findUniqueOrThrow({ where: { id: found.request.id } }),
      );
      if (request.status !== "IN_ISSUANCE" || !request.startDate) {
        throw new ProblemError("CONFLICT", "The policy is not to be issued", [
          { path: "request", issue: "NOT_IN_ISSUANCE" },
        ]);
      }
      const uploaded = await this.issuanceDocuments(tx, request.id);
      const missing = ISSUANCE_KINDS.filter((k) => !uploaded.some((d) => d.kind === k));
      if (missing.length > 0) {
        throw new ProblemError(
          "VALIDATION_FAILED",
          "Upload policy, receipt and certificate first",
          missing.map((k) => ({ path: k, issue: "DOCUMENT_MISSING" })),
        );
      }
      const offer: Offer = found.offer;
      const startDate = dbDateToCalendarDate(request.startDate);
      const endDate = policyEndDate(startDate);
      const policy = await asSystem(tx, async () => {
        transitionOffer("WINNING", "ISSUED");
        await tx.offer.update({ where: { id: offer.id }, data: { status: "ISSUED" } });
        transitionRequest("IN_ISSUANCE", "ISSUED");
        await tx.quoteRequest.update({ where: { id: request.id }, data: { status: "ISSUED" } });
        return tx.policy.create({
          data: {
            quoteRequestId: request.id,
            offerId: offer.id,
            acceptanceId: found.acceptance.id,
            organizationId: offer.organizationId,
            companyId: offer.companyId ?? "",
            ownerUserId: request.ownerUserId,
            ownerOrganizationId: request.ownerOrganizationId,
            policyNumber,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            premiumCents: found.acceptance.premiumCents,
            issuedAt: now,
            issuedByUserId: auth.userId,
            createdAt: now,
            updatedAt: now,
          },
        });
      });
      await asSystem(tx, () =>
        addRequestEvent(tx, request, {
          type: "POLICY_ISSUED",
          actorKind: "SYSTEM",
          actorUserId: auth.userId,
          at: now,
        }),
      );
      await asSystem(tx, () =>
        recordDomainEvent(tx, {
          aggregateType: "QuoteRequest",
          aggregateId: request.id,
          type: "PolicyIssued",
          at: now,
          actorUserId: auth.userId,
          data: { policyId: policy.id },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "POLICY_ISSUED",
        targetType: "Policy",
        targetId: policy.id,
        after: { quoteRequestId: request.id, organizationId: offer.organizationId },
      });
      const invoiceId =
        request.channel === "PRIVATE" && found.acceptance.feeCents > 0
          ? (await this.privateInvoice(tx, request, found.acceptance.feeCents)).id
          : null;
      await this.tell(tx, postbox, request, policy.policyNumber, offer, startDate, endDate);
      return { policyId: policy.id, invoiceId };
    });
    await postbox.flush();
    if (outcome.invoiceId) await this.invoicing.deliver(outcome.invoiceId);
    return { policyId: outcome.policyId };
  }

  /**
   * Proposal D of phase 6: the invoice to the policy holder when they are the
   * account holder; otherwise to the account holder, whose fiscal data the
   * back office completes before it is sent.
   */
  private async privateInvoice(tx: DbTransaction, request: QuoteRequest, feeCents: number) {
    const data = await this.acceptance.quoteDataOf(tx, request);
    const user = await asSystem(tx, () =>
      tx.user.findUniqueOrThrow({ where: { id: request.requesterUserId } }),
    );
    const holder = data.policyHolder;
    const same =
      holder.kind === "PERSON" &&
      holder.givenName.trim().toLowerCase() === user.firstName.trim().toLowerCase() &&
      holder.surname.trim().toLowerCase() === user.lastName.trim().toLowerCase();
    const recipient: InvoiceRecipient =
      same && holder.kind === "PERSON"
        ? {
            name: `${holder.givenName} ${holder.surname}`,
            givenName: holder.givenName,
            surname: holder.surname,
            fiscalCode: holder.fiscalCode,
            address: await this.invoicing.addressOf(tx, holder.residence),
            sdiCode: "0000000",
          }
        : {
            name: `${user.firstName} ${user.lastName}`,
            givenName: user.firstName,
            surname: user.lastName,
            sdiCode: "0000000",
          };
    return this.invoicing.issue(tx, {
      series: "P",
      recipientType: "PRIVATE",
      ownerUserId: request.ownerUserId,
      ownerOrganizationId: null,
      recipient,
      lines: [
        {
          description: `${labels.invoice.privateLine} ${request.code}`,
          quantity: 1,
          unitCents: feeCents,
        },
      ],
      quoteRequestId: request.id,
    });
  }

  private async tell(
    tx: DbTransaction,
    postbox: Postbox,
    request: QuoteRequest,
    policyNumber: string,
    offer: Offer,
    startDate: string,
    endDate: string,
  ) {
    const data = await this.acceptance.quoteDataOf(tx, request);
    const vehicle = `${data.vehicle.make} ${data.vehicle.model}`;
    const [agency, company, requester] = await asSystem(tx, () =>
      Promise.all([
        tx.organization.findUniqueOrThrow({ where: { id: offer.organizationId } }),
        offer.companyId ? tx.insuranceCompany.findUnique({ where: { id: offer.companyId } }) : null,
        tx.user.findUniqueOrThrow({ where: { id: request.requesterUserId } }),
      ]),
    );
    const ids = { quoteRequestId: request.id };
    if (request.channel === "PRIVATE") {
      const link = `${this.config.WEB_URL}/polizze`;
      await postbox.tell(
        tx,
        [requester],
        "policy.issued",
        {
          nome: requester.firstName,
          veicolo: vehicle,
          numero_polizza: policyNumber,
          agenzia: agency.legalName,
          compagnia: company?.name ?? "",
          decorrenza: formatDate(startDate),
          scadenza: formatDate(endDate),
          contatti_agenzia: agency.pec ?? agency.legalName,
          link,
        },
        link,
        ids,
      );
    } else {
      const customer = request.customerId
        ? await asSystem(tx, () =>
            tx.customer.findUniqueOrThrow({
              where: { id: request.customerId ?? "" },
              include: { person: true },
            }),
          )
        : null;
      const clientName = customer
        ? (customer.person.companyName ??
          `${customer.person.givenName ?? ""} ${customer.person.surname ?? ""}`.trim())
        : "";
      const link = `${this.config.WEB_URL}/polizze`;
      await postbox.tell(
        tx,
        [requester],
        "policy.issued.broker",
        {
          cliente: clientName,
          veicolo: vehicle,
          numero_polizza: policyNumber,
          agenzia: agency.legalName,
          compagnia: company?.name ?? "",
          decorrenza: formatDate(startDate),
          link,
        },
        link,
        ids,
      );
      // The broker's customer: a new token for the link of the paid acceptance,
      // confirmed again with a code, to download the documents.
      const live = await asSystem(tx, () =>
        tx.acceptance.findFirst({ where: { quoteRequestId: request.id, status: "PAID" } }),
      );
      if (customer?.emailEnc && live?.customerLinkId) {
        const token = randomBytes(32).toString("base64url");
        await asSystem(tx, () =>
          tx.customerLink.update({
            where: { id: live.customerLinkId ?? "" },
            data: {
              tokenHash: createHash("sha256").update(token).digest("hex"),
              otpVerifiedAt: null,
            },
          }),
        );
        const broker = await asSystem(tx, () =>
          tx.organization.findUniqueOrThrow({ where: { id: request.ownerOrganizationId ?? "" } }),
        );
        postbox.email(
          this.cipher.decrypt(customer.emailEnc),
          "policy.issued.broker_client",
          {
            nome: customer.person.givenName ?? customer.person.companyName ?? "",
            veicolo: vehicle,
            numero_polizza: policyNumber,
            compagnia: company?.name ?? "",
            decorrenza: formatDate(startDate),
            broker: broker.legalName,
            link: `${this.config.WEB_URL}/offerta/${token}`,
          },
          ids,
        );
      }
    }
    const admin = `${this.config.ADMIN_URL}/aste`;
    await postbox.tell(
      tx,
      await staffUsers(tx, ["BO_VERIFIER"]),
      "policy.issued.bo",
      {
        codice: request.code,
        agenzia: agency.legalName,
        numero_polizza: policyNumber,
        link: admin,
      },
      admin,
      ids,
      { email: false },
    );
  }

  /**
   * EMI-04: the agency reports data that do not match or that it cannot
   * issue. A case for the back office, which decides the fault.
   */
  async reportProblem(
    auth: AuthContext,
    requestId: string,
    input: { type: "DATA_MISMATCH" | "CANNOT_ISSUE"; description: string },
  ) {
    const now = this.clock.now();
    const postbox = new Postbox(this.notifications, this.cipher, this.config.WEB_URL);
    const out = await withContext(this.db, auth.db, async (tx) => {
      const { request, offer } = await this.won(tx, auth, requestId);
      if (request.status !== "IN_ISSUANCE") throw new ProblemError("CONFLICT");
      const { "notes.maxChars": maxChars } = await settingsAt(tx, ["notes.maxChars"], now);
      // The description goes to the back office: no contacts or links (as the offer notes).
      const problems = noteProblems(input.description, maxChars);
      if (problems.length > 0) {
        throw new ProblemError(
          "VALIDATION_FAILED",
          "The description is not acceptable",
          problems.map((p) => ({ path: "description", issue: `NOTES_${p}` })),
        );
      }
      const open = await asSystem(tx, () =>
        tx.issuanceProblem.findFirst({ where: { quoteRequestId: request.id, status: "OPEN" } }),
      );
      if (open)
        throw new ProblemError("CONFLICT", "A case is already open", [
          { path: "request", issue: "CASE_OPEN" },
        ]);
      const problem = await asSystem(tx, () =>
        tx.issuanceProblem.create({
          data: {
            quoteRequestId: request.id,
            offerId: offer.id,
            organizationId: offer.organizationId,
            type: input.type,
            description: input.description,
            openedByUserId: auth.userId,
            openedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "ISSUANCE_PROBLEM_REPORTED",
        targetType: "QuoteRequest",
        targetId: request.id,
        after: { problemId: problem.id, type: input.type },
      });
      const agency = await asSystem(tx, () =>
        tx.organization.findUniqueOrThrow({ where: { id: offer.organizationId } }),
      );
      const link = `${this.config.ADMIN_URL}/eccezioni`;
      await postbox.tell(
        tx,
        await staffUsers(tx, ["BO_VERIFIER", "BO_SUPERVISOR"]),
        "issuance.problem_reported.bo",
        {
          codice: request.code,
          agenzia: agency.legalName,
          tipo_problema:
            (labels.issuanceProblem as Record<string, string>)[input.type] ?? input.type,
          descrizione: input.description,
          link,
        },
        link,
        { quoteRequestId: request.id },
      );
      return { id: problem.id };
    });
    await postbox.flush();
    return out;
  }

  /**
   * The requester's policies (spec 03 and 02 «Polizze»): the private user's
   * own, the broker's customers'; with the documents and the fee invoice.
   */
  async requesterPolicies(auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) => {
      // Row level security keeps the requester's own; an agency has its own list.
      if (auth.membership?.organizationType === "AGENCY") throw new ProblemError("NOT_FOUND");
      const policies = await tx.policy.findMany({
        where:
          auth.kind === "PRIVATE"
            ? { ownerUserId: auth.userId }
            : { ownerOrganizationId: auth.membership?.organizationId ?? "" },
        orderBy: { issuedAt: "desc" },
        take: 200,
      });
      const {
        "renewal.daysBefore": renewalDays,
        "withdrawal.days": withdrawalDays,
        "withdrawal.onPlatform": onPlatform,
      } = await settingsAt(
        tx,
        ["renewal.daysBefore", "withdrawal.days", "withdrawal.onPlatform"],
        this.clock.now(),
      );
      const withdrawals = await asSystem(tx, () =>
        tx.consumerWithdrawal.findMany({ where: { policyId: { in: policies.map((p) => p.id) } } }),
      );
      const today = romeCalendarDate(this.clock.now());
      const [companies, documents] = await Promise.all([
        tx.insuranceCompany.findMany(),
        tx.document.findMany({
          where: {
            quoteRequestId: { in: policies.map((p) => p.quoteRequestId) },
            kind: { in: [...ISSUANCE_KINDS, "INVOICE_PDF"] },
            deletedAt: null,
          },
        }),
      ]);
      const out = [];
      for (const p of policies) {
        const request = await tx.quoteRequest.findUniqueOrThrow({
          where: { id: p.quoteRequestId },
        });
        const data = await this.acceptance.quoteDataOf(tx, request);
        const agency = await asSystem(tx, () =>
          tx.organization.findUniqueOrThrow({ where: { id: p.organizationId } }),
        );
        const holder = data.policyHolder;
        out.push({
          id: p.id,
          requestId: request.id,
          code: request.code,
          policyNumber: p.policyNumber,
          holder:
            holder.kind === "COMPANY"
              ? holder.companyName
              : `${holder.givenName} ${holder.surname}`,
          plate: data.vehicle.plate,
          company: companies.find((c) => c.id === p.companyId)?.name ?? "",
          agency: { name: agency.legalName, pec: agency.pec },
          startDate: dbDateToCalendarDate(p.startDate),
          endDate: dbDateToCalendarDate(p.endDate),
          premiumCents: p.premiumCents,
          status: p.status,
          autoRenewal: p.autoRenewal,
          // Spec 03: «Rinnova in asta» from the renewal notice day (process 10).
          renewable:
            ["ACTIVE", "EXPIRING"].includes(p.status) &&
            today >= renewalNoticeDate(dbDateToCalendarDate(p.endDate), renewalDays) &&
            today <= dbDateToCalendarDate(p.endDate),
          renewalRequestId: p.renewalRequestId,
          // S08: the withdrawal within withdrawal.days of the issuance.
          withdrawal: withdrawals.find((w) => w.policyId === p.id)?.status ?? null,
          withdrawable:
            onPlatform &&
            ["ACTIVE", "EXPIRING"].includes(p.status) &&
            today <= addCalendarDays(romeCalendarDate(p.issuedAt), withdrawalDays) &&
            !withdrawals.some((w) => w.policyId === p.id && w.status !== "REJECTED"),
          // Question 18: withdrawal and cancellation go through the agency, outside AstAx.
          withdrawalOutside: !onPlatform && ["ACTIVE", "EXPIRING"].includes(p.status),
          documents: documents
            .filter((d) => d.quoteRequestId === p.quoteRequestId)
            .map((d) => ({ id: d.id, kind: d.kind })),
        });
      }
      return out;
    });
  }

  /** The agency's issued policies (spec 04 «Polizze emesse»), with the customer's contacts. */
  async agencyPolicies(auth: AuthContext) {
    const m = this.agency(auth);
    return withContext(this.db, auth.db, async (tx) => {
      const policies = await tx.policy.findMany({
        where: { organizationId: m.organizationId },
        orderBy: { issuedAt: "desc" },
        take: 200,
      });
      const companies = await tx.insuranceCompany.findMany();
      const out = [];
      for (const p of policies) {
        const request = await asSystem(tx, () =>
          tx.quoteRequest.findUniqueOrThrow({ where: { id: p.quoteRequestId } }),
        );
        const data = await this.acceptance.quoteDataOf(tx, request);
        const holder = data.policyHolder;
        out.push({
          id: p.id,
          code: request.code,
          policyNumber: p.policyNumber,
          holder:
            holder.kind === "COMPANY"
              ? holder.companyName
              : `${holder.givenName} ${holder.surname}`,
          plate: data.vehicle.plate,
          company: companies.find((c) => c.id === p.companyId)?.name ?? "",
          startDate: dbDateToCalendarDate(p.startDate),
          endDate: dbDateToCalendarDate(p.endDate),
          premiumCents: p.premiumCents,
          status: p.status,
        });
      }
      return out;
    });
  }
}
