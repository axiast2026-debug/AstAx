import { createHash, randomUUID } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import {
  EXTRACTABLE_DOCUMENTS,
  type DocumentReaderPort,
  type ExtractableDocument,
} from "@astax/adapters/document-reader";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import type { PlateLookupPort, VehicleType } from "@astax/adapters/vehicle-data";
import {
  recordDomainEvent,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
  type DbTransaction,
  type DocumentKind,
  type QuoteRequest,
  auctionSettings,
  auctionSettingsAt,
  loadWorkingCalendar,
} from "@astax/db";
import {
  derivedColumns,
  missingDraftSections,
  quoteDataFromDraft,
  QuoteDraftSchema,
  submissionProblems,
  wizardBlockingExclusions,
  worstOutcome,
  type ChecklistItem,
  type QuoteData,
  type QuoteDraft,
  type QuoteDraftSection,
  auctionTimes,
} from "@astax/shared/domain";
import { calendarDateToDbDate, romeCalendarDate } from "@astax/shared/format";
import { errorForLog, type Logger } from "@astax/shared/logging";
import { Inject, Injectable } from "@nestjs/common";
import { AcceptanceEventsService, type Email } from "../acceptance/acceptance-events.service.js";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import {
  CLOCK,
  DB,
  DOCUMENT_READER,
  FIELD_CIPHER,
  LOGGER,
  OBJECT_STORAGE,
  PLATE_LOOKUP,
} from "../infra/tokens.js";
import labelsIt from "../notifications/labels.it.json" with { type: "json" };
import labelsSq from "../notifications/labels.sq.json" with { type: "json" };
import { NotificationService } from "../notifications/notification.service.js";
import { AutoCheckService } from "./auto-check.service.js";
import { listCodeProblems } from "./list-codes.js";
import { ReferenceService } from "./reference.service.js";
import {
  addRequestEvent,
  decryptJson,
  EDITABLE_STATUSES,
  encryptJson,
  extractionOf,
  ownerOf,
  requesterScope,
  settingsAt,
  sha256Of,
} from "./request-support.js";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const UPLOAD_KINDS: readonly DocumentKind[] = [
  "REGISTRATION_CERTIFICATE",
  "DRIVING_LICENCE",
  "RISK_CERTIFICATE",
  "FISCAL_CODE_CARD",
  "CONSENT_FORM",
  "OTHER",
];

export interface UploadInput {
  kind: DocumentKind;
  driverIndex: number | null;
  fileName: string;
  contentType: string;
  body: Uint8Array;
}

/** What the integration lets the requester change (Dan's answer to question 9). */
export interface IntegrationScope {
  sections: QuoteDraftSection[];
  documents: DocumentKind[];
}

/** The requester's side of a request: draft, documents, submission (fase 2). */
@Injectable()
export class RequestsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(DOCUMENT_READER) private readonly reader: DocumentReaderPort,
    @Inject(PLATE_LOOKUP) private readonly plates: PlateLookupPort,
    @Inject(ReferenceService) private readonly reference: ReferenceService,
    @Inject(AutoCheckService) private readonly autoCheck: AutoCheckService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(AcceptanceEventsService) private readonly acceptanceEvents: AcceptanceEventsService,
  ) {}

  // -------------------------------------------------------------- reading

  /** A request of the caller; any other id is a denied access, logged (rule 4). */
  private async findOwn(tx: DbTransaction, auth: AuthContext, id: string): Promise<QuoteRequest> {
    const request = await tx.quoteRequest.findFirst({ where: { id, ...requesterScope(auth) } });
    if (!request) {
      await this.audit.record(actorOf(auth), {
        action: "ACCESS_DENIED",
        targetType: "QuoteRequest",
        targetId: id,
      });
      throw new ProblemError("NOT_FOUND");
    }
    return request;
  }

  private draftOf(request: QuoteRequest): QuoteDraft {
    return request.draftEnc
      ? QuoteDraftSchema.parse(decryptJson(this.cipher, request.draftEnc))
      : {};
  }

  private async currentQuoteData(
    tx: DbTransaction,
    request: QuoteRequest,
  ): Promise<QuoteData | null> {
    if (request.quoteDataVersion === null) return null;
    const version = await tx.quoteDataVersion.findUniqueOrThrow({
      where: {
        quoteRequestId_version: { quoteRequestId: request.id, version: request.quoteDataVersion },
      },
    });
    return decryptJson(this.cipher, version.dataEnc) as QuoteData;
  }

  /** The open integration round, if any: what the back office asked for. */
  private async integrationScope(
    tx: DbTransaction,
    request: QuoteRequest,
  ): Promise<IntegrationScope | null> {
    if (request.status !== "INTEGRATION_REQUESTED") return null;
    const round = await tx.verification.findFirst({
      where: { quoteRequestId: request.id, decision: "INTEGRATION_REQUESTED" },
      orderBy: { round: "desc" },
    });
    const scope = (round?.integrationScope ?? null) as IntegrationScope | null;
    return scope ?? { sections: [], documents: [] };
  }

  async list(auth: AuthContext, filter: { status?: string; q?: string }) {
    return withContext(this.db, auth.db, async (tx) => {
      const rows = await tx.quoteRequest.findMany({
        where: {
          ...requesterScope(auth),
          ...(filter.status ? { status: filter.status as QuoteRequest["status"] } : {}),
          ...(filter.q ? { plate: { contains: filter.q.replace(/\s/g, "").toUpperCase() } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { customer: { include: { person: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        channel: r.channel,
        plate: r.plate,
        packageCode: r.packageCode,
        startDate: r.startDate?.toISOString().slice(0, 10) ?? null,
        submittedAt: r.submittedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        customer: r.customer ? customerName(r.customer.person) : null,
        requesterMembershipId: r.requesterMembershipId,
      }));
    });
  }

  async detail(auth: AuthContext, id: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const request = await this.findOwn(tx, auth, id);
      const editable = (EDITABLE_STATUSES as readonly string[]).includes(request.status);
      const [documents, events, verifications, quoteData, consent, scope] = await Promise.all([
        // The PDF quotes of the offers are not the requester's documents: the
        // presented ones arrive with the offers (phase 5, PRES-02, VIS-04).
        tx.document.findMany({
          where: { quoteRequestId: id, deletedAt: null, kind: { not: "OFFER_QUOTE" } },
          orderBy: { createdAt: "asc" },
        }),
        tx.quoteRequestEvent.findMany({ where: { quoteRequestId: id }, orderBy: { at: "asc" } }),
        tx.verification.findMany({
          where: { quoteRequestId: id },
          orderBy: { round: "desc" },
          take: 1,
        }),
        this.currentQuoteData(tx, request),
        request.customerId ? this.activeConsent(tx, request.customerId) : Promise.resolve(null),
        this.integrationScope(tx, request),
      ]);
      const last = verifications[0];
      const draftRequest = editable ? this.draftOf(request).request : undefined;
      return {
        /**
         * ASTA-02: when the auction would close if approved now, on the working
         * calendar; the real closing counts from the approval.
         */
        closeIfApprovedNow: draftRequest
          ? await this.closeIfApprovedNow(tx, draftRequest.auctionDurationHours)
          : null,
        id: request.id,
        code: request.code,
        status: request.status,
        channel: request.channel,
        editable,
        draft: editable ? this.draftOf(request) : null,
        missingSections: editable ? missingDraftSections(this.draftOf(request)) : [],
        quoteData,
        quoteDataVersion: request.quoteDataVersion,
        submittedAt: request.submittedAt?.toISOString() ?? null,
        consent: consent
          ? { method: consent.method, acceptedAt: consent.acceptedAt.toISOString() }
          : null,
        integration: scope,
        lastDecision: last?.decision
          ? {
              decision: last.decision,
              reasonCodes: last.reasonCodes,
              message: last.message,
              decidedAt: last.decidedAt?.toISOString() ?? null,
            }
          : null,
        documents: documents.map((d) => ({
          id: d.id,
          kind: d.kind,
          driverIndex: d.driverIndex,
          fileName: d.fileName,
          mime: d.mime,
          size: d.size,
          uploadedAt: d.createdAt.toISOString(),
          extraction: extractionOf(this.cipher, d.extractionEnc),
        })),
        timeline: events.map((e) => ({
          type: e.type,
          actorKind: e.actorKind,
          at: e.at.toISOString(),
          details: e.details,
        })),
      };
    });
  }

  private async closeIfApprovedNow(tx: DbTransaction, hours: number): Promise<string> {
    const now = this.clock.now();
    const snapshot = await auctionSettingsAt(tx, now);
    const calendar = await loadWorkingCalendar(tx, snapshot["calendar.workingHours"]);
    return auctionTimes(
      calendar,
      now,
      hours,
      0,
      auctionSettings(snapshot),
    ).scheduledCloseAt.toISOString();
  }

  async activeConsent(tx: DbTransaction, customerId: string) {
    return tx.consent.findFirst({
      where: { customerId, type: "DATA_SHARING_AGENCIES", revokedAt: null },
      orderBy: { acceptedAt: "desc" },
    });
  }

  // -------------------------------------------------------------- draft

  /**
   * New draft. A private user's request is for themselves: their customer
   * record is created at the first request. A broker names one of the
   * organization's customers.
   */
  async create(auth: AuthContext, input: { customerId?: string }) {
    const now = this.clock.now();
    const owner = ownerOf(auth);
    return withContext(this.db, auth.db, async (tx) => {
      let customerId: string;
      if (auth.kind === "PRIVATE") {
        customerId = await this.privateCustomer(tx, auth);
      } else {
        if (!input.customerId)
          throw new ProblemError("VALIDATION_FAILED", undefined, [
            { path: "customerId", issue: "required" },
          ]);
        const membership = auth.membership;
        const seesAll = membership?.role === "OWNER" || membership?.flags.seesAllClients === true;
        const customer = await tx.customer.findFirst({
          where: {
            id: input.customerId,
            ownerOrganizationId: membership?.organizationId ?? "",
            ...(seesAll ? {} : { ownerMembershipId: membership?.id ?? "" }),
          },
        });
        if (!customer) throw new ProblemError("NOT_FOUND");
        customerId = customer.id;
      }
      const code = await this.nextCode(tx, now);
      const request = await tx.quoteRequest.create({
        data: {
          ...owner,
          code,
          channel: auth.kind === "PRIVATE" ? "PRIVATE" : "BROKER",
          requesterUserId: auth.userId,
          requesterMembershipId: auth.membership?.id ?? null,
          customerId,
          draftEnc: encryptJson(this.cipher, {}),
        },
      });
      await addRequestEvent(tx, request, {
        type: "CREATED",
        actorKind: "REQUESTER",
        actorUserId: auth.userId,
        at: now,
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "REQUEST_CREATED",
        targetType: "QuoteRequest",
        targetId: request.id,
      });
      return { id: request.id, code: request.code, status: request.status };
    });
  }

  private async privateCustomer(tx: DbTransaction, auth: AuthContext): Promise<string> {
    const existing = await tx.customer.findFirst({ where: { ownerUserId: auth.userId } });
    if (existing) return existing.id;
    const user = await tx.user.findUniqueOrThrow({ where: { id: auth.userId } });
    const person = await tx.person.create({
      data: {
        ownerUserId: auth.userId,
        kind: "PERSON",
        surname: user.lastName,
        givenName: user.firstName,
      },
    });
    const customer = await tx.customer.create({
      data: {
        ownerUserId: auth.userId,
        personId: person.id,
        emailEnc: user.emailEnc,
        emailHash: user.emailHash,
        phoneEnc: user.phoneEnc,
        phoneHash: user.phoneHash,
      },
    });
    return customer.id;
  }

  /** AX-2026-000001: prefix from requests.codePrefix, year of Rome, one sequence. */
  private async nextCode(tx: DbTransaction, now: Date): Promise<string> {
    const { "requests.codePrefix": prefix } = await settingsAt(tx, ["requests.codePrefix"], now);
    const [row] = await tx.$queryRaw<
      { n: bigint }[]
    >`SELECT nextval('quote_request_number_seq') AS n`;
    const year = romeCalendarDate(now).slice(0, 4);
    return `${prefix}-${year}-${String(row?.n ?? 0).padStart(6, "0")}`;
  }

  private async requireEditable(tx: DbTransaction, auth: AuthContext, id: string) {
    const request = await this.findOwn(tx, auth, id);
    if (!(EDITABLE_STATUSES as readonly string[]).includes(request.status)) {
      // After submission the data change only through the back office (fase 2).
      throw new ProblemError("CONFLICT", "The request is no longer editable");
    }
    return { request, scope: await this.integrationScope(tx, request) };
  }

  async saveSection(auth: AuthContext, id: string, section: QuoteDraftSection, value: unknown) {
    const parsed = QuoteDraftSchema.safeParse({ [section]: value });
    if (!parsed.success) throw ProblemError.fromZod(parsed.error);
    return withContext(this.db, auth.db, async (tx) => {
      const { request, scope } = await this.requireEditable(tx, auth, id);
      if (scope && !scope.sections.includes(section)) {
        // A step form sends all its sections: one the back office did not ask
        // for may come back unchanged, never changed (question 9).
        const current = this.draftOf(request)[section];
        if (sha256Of(current ?? null) === sha256Of(parsed.data[section] ?? null)) {
          return { missingSections: missingDraftSections(this.draftOf(request)) };
        }
        throw new ProblemError("CONFLICT", "The back office did not ask to change this section");
      }
      const codes = await this.reference.activeCodes(tx);
      const problems = listCodeProblems({ [section]: parsed.data[section] }, codes);
      if (problems.length > 0) throw new ProblemError("VALIDATION_FAILED", undefined, problems);
      if (section === "request" && parsed.data.request) {
        const { packageCode, packageVersion } = parsed.data.request;
        if (!(await this.reference.packageExists(tx, packageCode, packageVersion))) {
          throw new ProblemError("VALIDATION_FAILED", undefined, [
            { path: "request.packageVersion", issue: "unknown_package" },
          ]);
        }
      }
      const draft = { ...this.draftOf(request), [section]: parsed.data[section] };
      await tx.quoteRequest.update({
        where: { id },
        data: {
          draftEnc: encryptJson(this.cipher, draft),
          ...(section === "vehicle" && draft.vehicle ? { plate: draft.vehicle.plate } : {}),
        },
      });
      return { missingSections: missingDraftSections(draft) };
    });
  }

  async saveSpecialUses(auth: AuthContext, id: string, specialUses: string[]) {
    return withContext(this.db, auth.db, async (tx) => {
      const { request, scope } = await this.requireEditable(tx, auth, id);
      const current = this.draftOf(request);
      // The special uses belong to the vehicle step (question 9 during an integration).
      if (scope && !scope.sections.includes("vehicle")) {
        if (
          sha256Of([...(current.specialUses ?? [])].sort()) !== sha256Of([...specialUses].sort())
        ) {
          throw new ProblemError("CONFLICT", "The back office did not ask to change this section");
        }
      }
      const problems = listCodeProblems({ specialUses }, await this.reference.activeCodes(tx));
      if (problems.length > 0) throw new ProblemError("VALIDATION_FAILED", undefined, problems);
      const draft = { ...current, specialUses };
      await tx.quoteRequest.update({
        where: { id },
        data: { draftEnc: encryptJson(this.cipher, draft) },
      });
      const rules = await tx.exclusionRule.findMany({ where: { active: true } });
      return { blockingExclusions: wizardBlockingExclusions(draft, rules) };
    });
  }

  /** Vehicle data from the plate, to prefill the wizard (nothing is saved). */
  async lookupPlate(input: { plate: string; vehicleType?: VehicleType }) {
    return this.plates.lookup(input);
  }

  // -------------------------------------------------------------- documents

  async upload(auth: AuthContext, id: string, input: UploadInput) {
    if (!UPLOAD_KINDS.includes(input.kind)) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [{ path: "kind", issue: "invalid" }]);
    }
    if (!ALLOWED_MIME.has(input.contentType)) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "contentType", issue: "not_allowed" },
      ]);
    }
    const now = this.clock.now();
    const prepared = await withContext(this.db, auth.db, async (tx) => {
      const { request, scope } = await this.requireEditable(tx, auth, id);
      if (scope && !scope.documents.includes(input.kind)) {
        throw new ProblemError("CONFLICT", "The back office did not ask for this document");
      }
      const { "documents.maxUploadMb": maxMb } = await settingsAt(
        tx,
        ["documents.maxUploadMb"],
        now,
      );
      if (input.body.byteLength === 0 || input.body.byteLength > maxMb * 1024 * 1024) {
        throw new ProblemError("VALIDATION_FAILED", undefined, [{ path: "body", issue: "size" }]);
      }
      return request;
    });

    const storageKey = `requests/${prepared.id}/${randomUUID()}`;
    await this.storage.put({ key: storageKey, body: input.body, contentType: input.contentType });
    const extraction = (EXTRACTABLE_DOCUMENTS as readonly string[]).includes(input.kind)
      ? await this.reader.extract({
          kind: input.kind as ExtractableDocument,
          files: [{ key: storageKey, fileName: input.fileName, contentType: input.contentType }],
        })
      : null;

    return withContext(this.db, auth.db, async (tx) => {
      // A new file of the same kind (and driver) replaces the previous one.
      await tx.document.updateMany({
        where: {
          quoteRequestId: id,
          kind: input.kind,
          driverIndex: input.driverIndex,
          deletedAt: null,
        },
        data: { deletedAt: now },
      });
      const document = await tx.document.create({
        data: {
          kind: input.kind,
          ownerUserId: prepared.ownerUserId,
          ownerOrganizationId: prepared.ownerOrganizationId,
          quoteRequestId: id,
          customerId: prepared.customerId,
          driverIndex: input.driverIndex,
          storageKey,
          sha256: createHash("sha256").update(input.body).digest("hex"),
          mime: input.contentType,
          size: input.body.byteLength,
          fileName: input.fileName,
          uploadedByUserId: auth.userId,
          // Names, fiscal codes, licence numbers: stored encrypted (ADR 0007).
          extractionEnc: extraction
            ? encryptJson(this.cipher, {
                fields: extraction.fields,
                warnings: extraction.warnings,
                model: extraction.model,
                promptVersion: extraction.promptVersion,
              })
            : null,
          extractedAt: extraction ? now : null,
        },
      });
      await addRequestEvent(tx, prepared, {
        type: "DOCUMENT_ADDED",
        actorKind: "REQUESTER",
        actorUserId: auth.userId,
        at: now,
        details: { documentId: document.id, kind: input.kind },
      });
      this.logger.info(
        { requestId: id, documentId: document.id, kind: input.kind },
        "document uploaded",
      );
      return {
        id: document.id,
        kind: document.kind,
        driverIndex: document.driverIndex,
        fileName: document.fileName,
        extraction: extraction ? { fields: extraction.fields } : null,
      };
    });
  }

  /** The file of one of the caller's documents; every opening is logged (rule 4). */
  async documentFile(auth: AuthContext, id: string, documentId: string) {
    const document = await withContext(this.db, auth.db, async (tx) => {
      await this.findOwn(tx, auth, id);
      const found = await tx.document.findFirst({
        where: {
          id: documentId,
          quoteRequestId: id,
          deletedAt: null,
          kind: { not: "OFFER_QUOTE" },
        },
      });
      if (!found) throw new ProblemError("NOT_FOUND");
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "DOCUMENT_VIEWED",
        targetType: "Document",
        targetId: found.id,
      });
      return found;
    });
    return {
      body: await this.storage.get(document.storageKey),
      mime: document.mime,
      fileName: document.fileName,
    };
  }

  // -------------------------------------------------------------- submission

  /**
   * Submits the draft (first time or after an integration): blocking excluded
   * cases (ASTA-10), consent (LEG-04), required fields; then a new quoteData
   * version, the automatic check and the back office queue.
   */
  async submit(auth: AuthContext, id: string) {
    const now = this.clock.now();
    const today = romeCalendarDate(now);
    const result = await withContext(this.db, auth.db, async (tx) => {
      const { request } = await this.requireEditable(tx, auth, id);
      const draft = this.draftOf(request);
      const rules = await tx.exclusionRule.findMany({ where: { active: true } });
      const blocking = wizardBlockingExclusions(draft, rules);
      if (blocking.length > 0) {
        throw new ProblemError(
          "VALIDATION_FAILED",
          "An excluded case blocks the submission",
          blocking.map((code) => ({ path: "specialUses", issue: `EXCLUDED_CASE:${code}` })),
        );
      }
      const missing = missingDraftSections(draft);
      if (missing.length > 0) {
        throw new ProblemError(
          "VALIDATION_FAILED",
          undefined,
          missing.map((s) => ({ path: s, issue: "missing_section" })),
        );
      }
      const quoteData = quoteDataFromDraft(draft) as QuoteData;
      const settings = await settingsAt(
        tx,
        [
          "drivingFormula.expertMinAge",
          "auction.durationsWorkingHours",
          "guarantee.minValidityDaysOptions",
          "verification.autoApproveGreen",
        ],
        now,
      );
      const problems = submissionProblems(quoteData, {
        today,
        expertMinAge: settings["drivingFormula.expertMinAge"],
        auctionDurations: settings["auction.durationsWorkingHours"],
        minValidityDaysOptions: settings["guarantee.minValidityDaysOptions"],
        packageIncludesTheft: await this.reference.packageIncludesTheft(
          tx,
          quoteData.request.packageCode,
          quoteData.request.packageVersion,
        ),
      });
      if (problems.length > 0) {
        throw new ProblemError(
          "VALIDATION_FAILED",
          undefined,
          problems.map((p) => ({ path: "quoteData", issue: p })),
        );
      }
      const consent = request.customerId ? await this.activeConsent(tx, request.customerId) : null;
      if (!consent) {
        throw new ProblemError(
          "VALIDATION_FAILED",
          "Consent to share the data is required (LEG-04)",
          [{ path: "consent", issue: "CONSENT_REQUIRED" }],
        );
      }
      // LEG-04: the consent belongs to the customer, so the holder must be that
      // customer, never another person under the same consent.
      if (!(await this.holderIsCustomer(tx, request, quoteData))) {
        throw new ProblemError("VALIDATION_FAILED", "The policy holder is not the customer", [
          { path: "policyHolder.fiscalCode", issue: "HOLDER_NOT_CUSTOMER" },
        ]);
      }

      const resubmission = request.status === "INTEGRATION_REQUESTED";
      const version = (request.quoteDataVersion ?? 0) + 1;
      await tx.quoteDataVersion.create({
        data: {
          quoteRequestId: id,
          ownerUserId: request.ownerUserId,
          ownerOrganizationId: request.ownerOrganizationId,
          version,
          dataEnc: encryptJson(this.cipher, quoteData),
          dataSha256: sha256Of(quoteData),
          source: resubmission ? "INTEGRATION" : "SUBMISSION",
          createdByUserId: auth.userId,
        },
      });
      const derived = derivedColumns(quoteData);
      const auto = await this.autoCheck.check(tx, id, quoteData, now);
      // A consent uploaded by the broker is checked by the back office (Dan's answer to question 8).
      const consentItem: ChecklistItem =
        consent.method === "UPLOADED_BY_BROKER"
          ? {
              code: "CONSENT",
              outcome: "YELLOW",
              reasons: ["CONSENT_UPLOADED_TO_CHECK"],
              fields: [],
            }
          : { code: "CONSENT", outcome: "GREEN", reasons: [], fields: [] };
      const items = [...auto.items, consentItem];
      const check = { items, outcome: worstOutcome(items.map((i) => i.outcome)) };
      const round = (await tx.verification.count({ where: { quoteRequestId: id } })) + 1;
      await tx.verification.create({
        data: {
          quoteRequestId: id,
          ownerUserId: request.ownerUserId,
          ownerOrganizationId: request.ownerOrganizationId,
          round,
          quoteDataVersion: version,
          autoOutcome: check.outcome,
          checklist: check.items.map((i) => ({ ...i, correction: null, note: null })) as never,
        },
      });
      await tx.quoteRequest.update({
        where: { id },
        data: {
          status: "IN_VERIFICATION",
          draftEnc: null,
          quoteDataVersion: version,
          plate: quoteData.vehicle.plate,
          vehicleType: derived.vehicleType,
          province: derived.province,
          cuClass: derived.cuClass,
          claimsLast5y: derived.claimsLast5y,
          youngestDriverAge: derived.youngestDriverAge,
          packageCode: derived.packageCode,
          startDate: calendarDateToDbDate(derived.startDate),
          minValidityDays: derived.minValidityDays,
          auctionDurationHours: quoteData.request.auctionDurationHours,
          autoOutcome: check.outcome,
          submittedAt: request.submittedAt ?? now,
        },
      });
      await this.updateCustomerPerson(tx, request, quoteData);
      await this.saveVehicle(tx, request, quoteData);
      await addRequestEvent(tx, request, {
        type: resubmission ? "RESUBMITTED" : "SUBMITTED",
        actorKind: "REQUESTER",
        actorUserId: auth.userId,
        at: now,
        details: { quoteDataVersion: version },
      });
      await addRequestEvent(tx, request, {
        type: "AUTO_CHECKED",
        actorKind: "SYSTEM",
        actorUserId: null,
        at: now,
        details: { outcome: check.outcome, round },
      });
      await recordDomainEvent(tx, {
        aggregateType: "QuoteRequest",
        aggregateId: id,
        type: resubmission ? "RequestResubmitted" : "RequestSubmitted",
        at: now,
        actorUserId: auth.userId,
        data: { outcome: check.outcome, round, quoteDataVersion: version },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "REQUEST_SUBMITTED",
        targetType: "QuoteRequest",
        targetId: id,
        after: {
          quoteDataVersion: version,
          autoOutcome: check.outcome,
          sha256: sha256Of(quoteData),
        },
      });
      const autoApprove = settings["verification.autoApproveGreen"] && check.outcome === "GREEN";
      // A request approved by the system does not wait in the back office queue.
      if (!autoApprove) await this.notifyBackOffice(tx, request, quoteData, check.outcome);
      return {
        id,
        code: request.code,
        status: "IN_VERIFICATION" as const,
        autoOutcome: check.outcome,
        round,
        quoteDataVersion: version,
        autoApprove,
        request,
        quoteData,
      };
    });
    this.logger.info({ requestId: id, outcome: result.autoOutcome }, "request submitted");
    if (result.autoApprove) {
      // The approval needs the system's rights, so it runs after the submission.
      // If it fails the submission stands and the request goes to the back office.
      try {
        await this.autoApprove(id, result.round, result.quoteDataVersion, now);
      } catch (error) {
        this.logger.error({ requestId: id, err: errorForLog(error) }, "automatic approval failed");
        await withContext(this.db, SYSTEM_CONTEXT, (tx) =>
          this.notifyBackOffice(tx, result.request, result.quoteData, result.autoOutcome),
        );
      }
    }
    return {
      id: result.id,
      code: result.code,
      status: result.status,
      autoOutcome: result.autoOutcome,
    };
  }

  /**
   * verification.autoApproveGreen (off during the pilot, decision 18b): a green
   * request is approved by the system, with the same records as a decision of
   * the back office.
   */
  private async autoApprove(id: string, round: number, quoteDataVersion: number, now: Date) {
    await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id } });
      await tx.verification.update({
        where: { quoteRequestId_round: { quoteRequestId: id, round } },
        data: { decision: "APPROVED", decidedAt: now },
      });
      await addRequestEvent(tx, request, {
        type: "APPROVED",
        actorKind: "SYSTEM",
        actorUserId: null,
        at: now,
        details: { automatic: true },
      });
      await recordDomainEvent(tx, {
        aggregateType: "QuoteRequest",
        aggregateId: id,
        type: "RequestApproved",
        at: now,
        actorUserId: null,
        data: { round, quoteDataVersion, automatic: true },
      });
      await this.audit.inTransaction(
        tx,
        { userId: null, membershipId: null, organizationId: null, ip: null, userAgent: null },
        {
          action: "VERIFICATION_DECIDED",
          targetType: "QuoteRequest",
          targetId: id,
          after: { decision: "APPROVED", round, automatic: true },
        },
      );
    });
  }

  /**
   * True when the holder is the request's customer: same fiscal code (or VAT
   * number) as the customer's person, by blind index. Only for a broker's
   * request: a private user may ask for a policy held by someone else, for
   * example their spouse (Dan's answer to question 12).
   */
  private async holderIsCustomer(tx: DbTransaction, request: QuoteRequest, quoteData: QuoteData) {
    if (request.channel === "PRIVATE") return true;
    if (!request.customerId) return false;
    const customer = await tx.customer.findUniqueOrThrow({
      where: { id: request.customerId },
      include: { person: true },
    });
    const person = customer.person;
    const holder = quoteData.policyHolder;
    if (!person.fiscalCodeHash && !person.vatNumberHash) return true;
    if (holder.kind === "PERSON") {
      return person.fiscalCodeHash === this.cipher.blindIndex("fiscalCode", holder.fiscalCode);
    }
    return person.vatNumberHash === this.cipher.blindIndex("vatNumber", holder.vatNumber);
  }

  /** request.submitted.bo, in-app, to the verification operators and supervisors. */
  private async notifyBackOffice(
    tx: DbTransaction,
    request: QuoteRequest,
    quoteData: QuoteData,
    outcome: string,
  ) {
    // The requester may not read AstAx memberships (row level security): the
    // recipients are looked up as a system job, identifiers and locale only.
    const staff = await withContext(this.db, SYSTEM_CONTEXT, (system) =>
      system.membership.findMany({
        where: {
          role: { in: ["BO_VERIFIER", "BO_SUPERVISOR"] },
          status: "ACTIVE",
          organization: { type: "ASTAX" },
        },
        select: { user: { select: { id: true, locale: true } } },
      }),
    );
    const vehicle = `${quoteData.vehicle.make} ${quoteData.vehicle.model} ${quoteData.vehicle.plate}`;
    await this.notifications.inApp(
      tx,
      staff.map((m) => ({ userId: m.user.id, locale: m.user.locale })),
      "request.submitted.bo",
      (locale) => {
        const labels = locale === "sq" ? labelsSq : labelsIt;
        return {
          codice: request.code,
          canale: labels.channel[request.channel],
          veicolo: vehicle,
          esito_auto: labels.outcome[outcome as "GREEN" | "YELLOW" | "RED"],
          link: `/verifiche/${request.id}`,
        };
      },
      `/verifiche/${request.id}`,
      { requestId: request.id },
    );
  }

  /** The customer's person gets the holder's data: fiscal code encrypted with blind index. */
  private async updateCustomerPerson(
    tx: DbTransaction,
    request: QuoteRequest,
    quoteData: QuoteData,
  ) {
    // A private customer's person is the account holder, never the policy holder
    // of one request (question 12): it does not take the holder's data.
    if (!request.customerId || request.channel === "PRIVATE") return;
    const customer = await tx.customer.findUniqueOrThrow({
      where: { id: request.customerId },
      include: { person: true },
    });
    const holder = quoteData.policyHolder;
    // The identity is set once (holderIsCustomer checked it); the address follows the request.
    const identitySet = Boolean(customer.person.fiscalCodeHash || customer.person.vatNumberHash);
    await tx.person.update({
      where: { id: customer.personId },
      data:
        holder.kind === "PERSON"
          ? {
              ...(identitySet
                ? {}
                : {
                    kind: "PERSON" as const,
                    surname: holder.surname,
                    givenName: holder.givenName,
                    fiscalCodeEnc: this.cipher.encrypt(holder.fiscalCode),
                    fiscalCodeHash: this.cipher.blindIndex("fiscalCode", holder.fiscalCode),
                  }),
              birthDate: calendarDateToDbDate(holder.birthDate),
              birthPlace: holder.birthPlace,
              sex: holder.sex,
              residence: holder.residence,
            }
          : {
              ...(identitySet
                ? {}
                : {
                    kind: "COMPANY" as const,
                    companyName: holder.companyName,
                    vatNumberEnc: this.cipher.encrypt(holder.vatNumber),
                    vatNumberHash: this.cipher.blindIndex("vatNumber", holder.vatNumber),
                  }),
              residence: holder.registeredOffice,
            },
    });
  }

  private async saveVehicle(tx: DbTransaction, request: QuoteRequest, quoteData: QuoteData) {
    if (!request.customerId) return;
    const { plate, ...data } = quoteData.vehicle;
    await tx.vehicle.upsert({
      where: { customerId_plate: { customerId: request.customerId, plate } },
      create: {
        ownerUserId: request.ownerUserId,
        ownerOrganizationId: request.ownerOrganizationId,
        customerId: request.customerId,
        plate,
        data,
      },
      update: { data },
    });
  }

  async cancel(auth: AuthContext, id: string) {
    const now = this.clock.now();
    // The requester, or a back office supervisor (request.cancel).
    const backOffice = auth.membership?.organizationType === "ASTAX";
    const emails: Email[] = [];
    const out = await withContext(this.db, auth.db, async (tx) => {
      const request = backOffice
        ? await tx.quoteRequest.findUnique({ where: { id } })
        : await this.findOwn(tx, auth, id);
      if (!request) throw new ProblemError("NOT_FOUND");
      const cancellable = [
        "DRAFT",
        "IN_VERIFICATION",
        "INTEGRATION_REQUESTED",
        "OFFERS_AVAILABLE",
        "DESERTED",
        "EXPIRED",
      ];
      if (!cancellable.includes(request.status))
        throw new ProblemError("CONFLICT", "The request can no longer be cancelled");
      await tx.quoteRequest.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: now },
      });
      // A consent link of a cancelled request cannot be used any more.
      await tx.consentLink.updateMany({
        where: { quoteRequestId: id, status: "SENT" },
        data: { status: "REVOKED" },
      });
      await addRequestEvent(tx, request, {
        type: "CANCELLED",
        actorKind: backOffice ? "BACK_OFFICE" : "REQUESTER",
        actorUserId: auth.userId,
        at: now,
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "REQUEST_CANCELLED",
        targetType: "QuoteRequest",
        targetId: id,
        before: { status: request.status },
      });
      // CLA-02: cancelled without acceptance, the ranking of the last round with valid offers.
      await this.acceptanceEvents.publishRanking(tx, emails, request, now);
      return { id, status: "CANCELLED" as const };
    });
    await this.acceptanceEvents.sendAll(emails);
    return out;
  }
}

export function customerName(person: {
  kind: string;
  surname: string | null;
  givenName: string | null;
  companyName: string | null;
}): string {
  return person.kind === "COMPANY"
    ? (person.companyName ?? "")
    : `${person.givenName ?? ""} ${person.surname ?? ""}`.trim();
}
