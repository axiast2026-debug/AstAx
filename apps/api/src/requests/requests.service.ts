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
  asSystem,
  auctionWorkingTime,
  recordDomainEvent,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
  type DbTransaction,
  type DocumentKind,
  type OfferStatus,
  type QuoteRequest,
  auctionSettings,
  auctionSettingsAt,
  loadWorkingCalendar,
} from "@astax/db";
import {
  derivedColumns,
  addCalendarDays,
  documentReadable,
  IntakeSchema,
  intakeDocuments,
  missingDraftSections,
  quoteDataFromDraft,
  QuoteDraftSchema,
  submissionProblems,
  wizardBlockingExclusions,
  withRequestDay,
  worstOutcome,
  type ChecklistItem,
  type QuoteData,
  type QuoteDraft,
  type QuoteDraftSection,
  auctionTimes,
} from "@astax/shared/domain";
import { calendarDateToDbDate, dbDateToCalendarDate, romeCalendarDate } from "@astax/shared/format";
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
import { NotificationService } from "../notifications/notification.service.js";
import { ConsentService } from "./consent.service.js";
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
  seesAllClients,
  settingsAt,
  sha256Of,
} from "./request-support.js";

/** The offers a requester is shown after the closing (PRES-01): their premium is plain. */
const PRESENTED_OFFER_STATUSES: OfferStatus[] = [
  "AWAITING_CUSTOMER",
  "WINNING",
  "ISSUED",
  "NOT_CHOSEN",
  "EXPIRED",
  "MISSED_ISSUANCE",
];
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const UPLOAD_KINDS: readonly DocumentKind[] = [
  "REGISTRATION_CERTIFICATE",
  "DRIVING_LICENCE",
  "RISK_CERTIFICATE",
  "FISCAL_CODE_CARD",
  // ADR 0013 and Dan, 2026-10-28: the ID card, for every vehicle.
  "IDENTITY_DOCUMENT",
  "CONSENT_FORM",
  "OTHER",
];

export interface UploadInput {
  kind: DocumentKind;
  driverIndex: number | null;
  fileName: string;
  contentType: string;
  body: Uint8Array;
  /**
   * Dan, 2026-10-28: one more file of the same document (back, other pages)
   * instead of a replacement, up to `documents.maxFilesPerDocument`.
   */
  append?: boolean;
}

/** What the integration lets the requester change (Dan's answer to question 9). */
export interface IntegrationScope {
  sections: QuoteDraftSection[];
  documents: DocumentKind[];
}

/** The requester's side of a request: draft, documents, submission (fase 2). */

/** The vehicle in the back office notice: make, model and plate. */
function vehicleText(quoteData: QuoteData): string {
  return `${quoteData.vehicle.make} ${quoteData.vehicle.model} ${quoteData.vehicle.plate}`;
}

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
    @Inject(ConsentService) private readonly consents: ConsentService,
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

  async list(
    auth: AuthContext,
    filter: {
      status?: string;
      statuses?: string[];
      q?: string;
      customer?: string;
      startWithinDays?: number;
      batchId?: string;
    },
  ) {
    const today = romeCalendarDate(this.clock.now());
    const name = filter.customer?.trim();
    return withContext(this.db, auth.db, async (tx) => {
      const rows = await tx.quoteRequest.findMany({
        where: {
          ...requesterScope(auth),
          ...(filter.status ? { status: filter.status as QuoteRequest["status"] } : {}),
          ...(filter.statuses
            ? { status: { in: filter.statuses as QuoteRequest["status"][] } }
            : {}),
          ...(filter.q ? { plate: { contains: filter.q.replace(/\s/g, "").toUpperCase() } } : {}),
          ...(filter.batchId ? { batchId: filter.batchId } : {}),
          ...(name
            ? {
                customer: {
                  person: {
                    OR: [
                      { surname: { contains: name, mode: "insensitive" as const } },
                      { givenName: { contains: name, mode: "insensitive" as const } },
                      { companyName: { contains: name, mode: "insensitive" as const } },
                    ],
                  },
                },
              }
            : {}),
          // The start of the new policy is the expiry of the current one.
          ...(filter.startWithinDays
            ? {
                startDate: {
                  gte: calendarDateToDbDate(today),
                  lte: calendarDateToDbDate(addCalendarDays(today, filter.startWithinDays)),
                },
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { customer: { include: { person: true } }, batch: { select: { code: true } } },
      });
      const { auctions, operators } = await this.listAuctions(tx, rows);
      return rows.map((r) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        channel: r.channel,
        plate: r.plate,
        packageCode: r.packageCode,
        // A draft of a lot starts, by default, at the expiry of the policy (ADR 0014).
        startDate: (r.startDate ?? r.policyExpiryDate)?.toISOString().slice(0, 10) ?? null,
        submittedAt: r.submittedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        customer: r.customer ? customerName(r.customer.person) : null,
        requesterMembershipId: r.requesterMembershipId,
        // ADR 0014: the lot and the day the draft leaves by itself.
        batch: r.batch?.code ?? null,
        scheduledSubmitAt:
          r.status === "DRAFT" ? (r.scheduledSubmitAt?.toISOString() ?? null) : null,
        operator: operators.get(r.id) ?? null,
        auction: auctions.get(r.id) ?? null,
      }));
    });
  }

  /**
   * The latest round of each request for the work table (broker, design):
   * during the auction the working time and the counters (VIS-03: offers and
   * invited agencies, never a price or a name); after the closing the lowest
   * premium with its guarantee date; who in the office made the request.
   */
  private async listAuctions(
    tx: DbTransaction,
    rows: { id: string; channel: string; requesterMembershipId: string | null }[],
  ) {
    const now = this.clock.now();
    const latest = new Map<string, Awaited<ReturnType<typeof tx.auction.findMany>>[number]>();
    for (const a of await tx.auction.findMany({
      where: { quoteRequestId: { in: rows.map((r) => r.id) } },
      orderBy: { round: "desc" },
    })) {
      if (!latest.has(a.quoteRequestId)) latest.set(a.quoteRequestId, a);
    }
    const ids = [...latest.values()].map((a) => a.id);
    const memberships = rows.flatMap((r) =>
      r.requesterMembershipId ? [r.requesterMembershipId] : [],
    );
    const [offers, invited, best, operators] = await asSystem(tx, () =>
      Promise.all([
        tx.offer.groupBy({
          by: ["auctionId"],
          where: { auctionId: { in: ids }, status: { notIn: ["WITHDRAWN", "EXCLUDED"] } },
          _count: { _all: true },
        }),
        tx.invitation.groupBy({
          by: ["auctionId"],
          where: { auctionId: { in: ids } },
          _count: { _all: true },
        }),
        // BC-02: plain premiums exist only after the closing, and only those are read.
        tx.offer.findMany({
          where: {
            auctionId: { in: ids },
            auction: { status: "CLOSED" },
            status: { in: PRESENTED_OFFER_STATUSES },
            annualGrossPremiumCents: { not: null },
          },
          select: { auctionId: true, annualGrossPremiumCents: true, guaranteeUntil: true },
          orderBy: { annualGrossPremiumCents: "asc" },
        }),
        tx.membership.findMany({
          where: { id: { in: memberships } },
          select: { id: true, user: { select: { firstName: true, lastName: true } } },
        }),
      ]),
    );
    const people = new Map<string, string>();
    const auctions = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      const operator = operators.find((m) => m.id === r.requesterMembershipId);
      if (operator) {
        people.set(r.id, `${operator.user.firstName} ${operator.user.lastName}`.trim());
      }
      const a = latest.get(r.id);
      if (!a) continue;
      const open = a.status === "OPEN";
      const lowest = open ? undefined : best.find((o) => o.auctionId === a.id);
      auctions.set(r.id, {
        status: a.status,
        kind: a.kind,
        scheduledCloseAt: a.scheduledCloseAt.toISOString(),
        live: open ? await auctionWorkingTime(tx, a, now) : null,
        offers: offers.find((o) => o.auctionId === a.id)?._count._all ?? 0,
        // VIS-03: only the broker learns how many agencies are invited.
        ...(r.channel === "BROKER"
          ? { invited: invited.find((i) => i.auctionId === a.id)?._count._all ?? 0 }
          : {}),
        bestPremiumCents: lowest?.annualGrossPremiumCents ?? null,
        bestGuaranteeUntil: lowest?.guaranteeUntil
          ? dbDateToCalendarDate(lowest.guaranteeUntil)
          : null,
      });
    }
    return { auctions, operators: people };
  }

  /** PERSON or COMPANY: the kind of the request's customer. */
  private async customerKind(tx: DbTransaction, request: QuoteRequest) {
    return (await this.customerCard(tx, request)).kind;
  }

  /**
   * What the customer's card already says (kind, birth date), so that the
   * wizard asks nothing twice (UX review 2026-10-23). No contact, no name.
   */
  private async customerCard(
    tx: DbTransaction,
    request: QuoteRequest,
  ): Promise<{ kind: "PERSON" | "COMPANY" | null; birthDate: string | null }> {
    if (!request.customerId) return { kind: null, birthDate: null };
    const customer = await tx.customer.findUnique({
      where: { id: request.customerId },
      include: { person: { select: { kind: true, birthDate: true } } },
    });
    return {
      kind: customer?.person.kind ?? null,
      birthDate: customer?.person.birthDate?.toISOString().slice(0, 10) ?? null,
    };
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
      const card = await this.customerCard(tx, request);
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
        // A company's request has no owner's birth date (question 25).
        customerKind: card.kind,
        customerBirthDate: card.birthDate,
        editable,
        draft: editable ? this.draftOf(request) : null,
        missingSections: editable ? missingDraftSections(this.draftOf(request)) : [],
        quoteData,
        quoteDataVersion: request.quoteDataVersion,
        submittedAt: request.submittedAt?.toISOString() ?? null,
        // ADR 0014: a draft of a lot leaves by itself on this day.
        scheduledSubmitAt: request.scheduledSubmitAt?.toISOString() ?? null,
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
        const seesAll = membership ? seesAllClients(membership) : false;
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
          // Rule 6: the time from Clock, not from the database.
          createdAt: now,
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
    // ADR 0013: the essential data has its own rules (private customer and, from the
    // broker plan of 2026-10-21, the broker for a single vehicle).
    if (section === "intake") {
      const intake = IntakeSchema.safeParse(value);
      if (!intake.success) throw ProblemError.fromZod(intake.error);
      value = intake.data;
    }
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
      const value =
        section === "request" && parsed.data.request
          ? withRequestDay(parsed.data.request, romeCalendarDate(this.clock.now()))
          : parsed.data[section];
      const draft = { ...this.draftOf(request), [section]: value };
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
    const preparedUpload = await withContext(this.db, auth.db, async (tx) => {
      const { request, scope } = await this.requireEditable(tx, auth, id);
      if (scope && !scope.documents.includes(input.kind)) {
        throw new ProblemError("CONFLICT", "The back office did not ask for this document");
      }
      const { "documents.maxUploadMb": maxMb, "documents.maxFilesPerDocument": maxFiles } =
        await settingsAt(tx, ["documents.maxUploadMb", "documents.maxFilesPerDocument"], now);
      if (input.body.byteLength === 0 || input.body.byteLength > maxMb * 1024 * 1024) {
        throw new ProblemError("VALIDATION_FAILED", undefined, [{ path: "body", issue: "size" }]);
      }
      const siblings = input.append
        ? await tx.document.findMany({
            where: {
              quoteRequestId: id,
              kind: input.kind,
              driverIndex: input.driverIndex,
              deletedAt: null,
            },
            orderBy: { createdAt: "asc" },
            select: { id: true, storageKey: true, fileName: true, mime: true },
          })
        : [];
      if (siblings.length >= maxFiles) {
        throw new ProblemError("VALIDATION_FAILED", undefined, [
          { path: "body", issue: "TOO_MANY_FILES" },
        ]);
      }
      return { request, siblings };
    });
    const { request: prepared, siblings } = preparedUpload;

    const storageKey = `requests/${prepared.id}/${randomUUID()}`;
    await this.storage.put({ key: storageKey, body: input.body, contentType: input.contentType });
    const extraction = (EXTRACTABLE_DOCUMENTS as readonly string[]).includes(input.kind)
      ? await this.reader.extract({
          kind: input.kind as ExtractableDocument,
          // All the files of the document read together: front and back are one ID card.
          files: [
            ...siblings.map((s) => ({
              key: s.storageKey,
              fileName: s.fileName,
              contentType: s.mime,
            })),
            { key: storageKey, fileName: input.fileName, contentType: input.contentType },
          ],
        })
      : null;

    return withContext(this.db, auth.db, async (tx) => {
      // A new file of the same kind (and driver) replaces the previous one, unless
      // it adds a page: then the reading of all of them lives on the newest file.
      if (input.append) {
        await tx.document.updateMany({
          where: { id: { in: siblings.map((s) => s.id) } },
          data: { extractionEnc: null, extractedAt: null },
        });
      } else {
        await tx.document.updateMany({
          where: {
            quoteRequestId: id,
            kind: input.kind,
            driverIndex: input.driverIndex,
            deletedAt: null,
          },
          data: { deletedAt: now },
        });
      }
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
      // ADR 0013: the customer learns at once whether the photo can be read.
      const { "documents.confidenceThreshold": threshold } = await settingsAt(
        tx,
        ["documents.confidenceThreshold"],
        now,
      );
      return {
        id: document.id,
        kind: document.kind,
        driverIndex: document.driverIndex,
        fileName: document.fileName,
        extraction: extraction ? { fields: extraction.fields } : null,
        readable: documentReadable(extraction, threshold),
      };
    });
  }

  /**
   * Dan, 2026-10-28: the customer takes away one file of a document before
   * sending. The other files of the same document are read again together.
   */
  async removeDocument(auth: AuthContext, id: string, documentId: string): Promise<void> {
    const now = this.clock.now();
    const removed = await withContext(this.db, auth.db, async (tx) => {
      const { request } = await this.requireEditable(tx, auth, id);
      const document = await tx.document.findFirst({
        where: {
          id: documentId,
          quoteRequestId: id,
          deletedAt: null,
          kind: { in: [...UPLOAD_KINDS] },
        },
      });
      if (!document) throw new ProblemError("NOT_FOUND");
      await tx.document.update({ where: { id: document.id }, data: { deletedAt: now } });
      const rest = await tx.document.findMany({
        where: {
          quoteRequestId: id,
          kind: document.kind,
          driverIndex: document.driverIndex,
          deletedAt: null,
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, storageKey: true, fileName: true, mime: true },
      });
      return { request, kind: document.kind, rest };
    });
    const { kind, rest } = removed;
    const newest = rest.at(-1);
    if (!newest || !(EXTRACTABLE_DOCUMENTS as readonly string[]).includes(kind)) return;
    const extraction = await this.reader.extract({
      kind: kind as ExtractableDocument,
      files: rest.map((r) => ({ key: r.storageKey, fileName: r.fileName, contentType: r.mime })),
    });
    await withContext(this.db, auth.db, async (tx) => {
      await tx.document.updateMany({
        where: { id: { in: rest.map((r) => r.id) } },
        data: { extractionEnc: null, extractedAt: null },
      });
      await tx.document.update({
        where: { id: newest.id },
        data: {
          extractionEnc: encryptJson(this.cipher, {
            fields: extraction.fields,
            warnings: extraction.warnings,
            model: extraction.model,
            promptVersion: extraction.promptVersion,
          }),
          extractedAt: now,
        },
      });
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
      if (draft.intake !== undefined) {
        return this.submitIntake(tx, auth, request, draft, now, today);
      }
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
      const fromDraft = quoteDataFromDraft(draft) as QuoteData;
      const quoteData = { ...fromDraft, request: withRequestDay(fromDraft.request, today) };
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
          quoteData.request.coverages,
        ),
      });
      if (problems.length > 0) {
        throw new ProblemError(
          "VALIDATION_FAILED",
          undefined,
          problems.map((p) => ({ path: "quoteData", issue: p })),
        );
      }
      // Broker plan, answer 3: a broker covered by its declaration needs no consent per customer.
      const consent =
        (request.customerId ? await this.activeConsent(tx, request.customerId) : null) ??
        (await this.consents.fromBrokerDeclaration(tx, auth, request));
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
          startMode: derived.startMode,
          chosenCoverages: derived.chosenCoverages,
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
      if (!autoApprove) {
        await this.notifyBackOffice(tx, request, vehicleText(quoteData), check.outcome);
      }
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
    if (result.autoApprove && result.quoteData && result.quoteDataVersion !== null) {
      // The approval needs the system's rights, so it runs after the submission.
      // If it fails the submission stands and the request goes to the back office.
      try {
        await this.autoApprove(id, result.round, result.quoteDataVersion, now);
      } catch (error) {
        this.logger.error({ requestId: id, err: errorForLog(error) }, "automatic approval failed");
        await withContext(this.db, SYSTEM_CONTEXT, (tx) =>
          this.notifyBackOffice(
            tx,
            result.request,
            vehicleText(result.quoteData),
            result.autoOutcome,
          ),
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
   * ADR 0013, Dan 2026-10-21: the private customer submits only the essential
   * data, the coverages and readable documents. The request goes «In verifica»
   * without quoteData: the back office completes it from what the bot read,
   * then approves (the approval refuses a request still to complete).
   */
  private async submitIntake(
    tx: DbTransaction,
    auth: AuthContext,
    request: QuoteRequest,
    draft: QuoteDraft,
    now: Date,
    today: string,
  ) {
    const intake = IntakeSchema.safeParse(draft.intake);
    if (!intake.success) throw ProblemError.fromZod(intake.error);
    // The owner's birth date: for a person always, never for a company (question 25).
    if (!intake.data.ownerBirthDate && (await this.customerKind(tx, request)) !== "COMPANY") {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "ownerBirthDate", issue: "REQUIRED" },
      ]);
    }
    if (!intake.data.drivingFormula) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "drivingFormula", issue: "REQUIRED" },
      ]);
    }
    if (!draft.request) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "request", issue: "missing_section" },
      ]);
    }
    const terms = withRequestDay(draft.request, today);
    // Every required document is there and was readable at the upload.
    const { "documents.confidenceThreshold": threshold } = await settingsAt(
      tx,
      ["documents.confidenceThreshold"],
      now,
    );
    const documents = await tx.document.findMany({
      where: { quoteRequestId: request.id, deletedAt: null },
    });
    const problems = intakeDocuments().flatMap((kind) => {
      const latest = documents
        .filter((d) => d.kind === kind)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      if (!latest) return [{ path: `documents.${kind}`, issue: "DOCUMENT_MISSING" }];
      const extraction = latest.extractionEnc
        ? (decryptJson(this.cipher, latest.extractionEnc) as {
            fields: Record<string, { confidence: number }>;
            warnings: string[];
          })
        : null;
      return documentReadable(extraction, threshold)
        ? []
        : [{ path: `documents.${kind}`, issue: "DOCUMENT_UNREADABLE" }];
    });
    // ADR 0014, answer 4: a request of a lot leaves even without documents; its
    // auction then invites only the agencies that accept that.
    const withoutDocuments = request.batchId !== null && problems.length > 0;
    if (problems.length > 0 && !withoutDocuments) {
      throw new ProblemError("VALIDATION_FAILED", undefined, problems);
    }
    // Broker plan, answer 3: a broker covered by its declaration needs no consent per customer.
    const consent =
      (request.customerId ? await this.activeConsent(tx, request.customerId) : null) ??
      (await this.consents.fromBrokerDeclaration(tx, auth, request));
    if (!consent) {
      throw new ProblemError(
        "VALIDATION_FAILED",
        "Consent to share the data is required (LEG-04)",
        [{ path: "consent", issue: "CONSENT_REQUIRED" }],
      );
    }

    const round = (await tx.verification.count({ where: { quoteRequestId: request.id } })) + 1;
    const toComplete: ChecklistItem = {
      code: "TO_COMPLETE",
      outcome: "YELLOW",
      reasons: ["ESSENTIAL_DATA_ONLY"],
      fields: [],
    };
    await tx.verification.create({
      data: {
        quoteRequestId: request.id,
        ownerUserId: request.ownerUserId,
        ownerOrganizationId: request.ownerOrganizationId,
        round,
        quoteDataVersion: null,
        autoOutcome: "YELLOW",
        checklist: [{ ...toComplete, correction: null, note: null }] as never,
      },
    });
    await tx.quoteRequest.update({
      where: { id: request.id },
      data: {
        status: "IN_VERIFICATION",
        // The draft stays: it holds the essential data the back office completes.
        draftEnc: encryptJson(this.cipher, { ...draft, intake: intake.data, request: terms }),
        plate: intake.data.plate,
        packageCode: terms.packageCode,
        startDate: calendarDateToDbDate(terms.startDate),
        startMode: terms.startMode ?? "DATE",
        chosenCoverages: terms.packageCode === "CUSTOM" ? [...(terms.coverages ?? [])] : [],
        minValidityDays: terms.minValidityDays,
        auctionDurationHours: terms.auctionDurationHours,
        autoOutcome: "YELLOW",
        submittedAt: request.submittedAt ?? now,
        withoutDocuments,
      },
    });
    await addRequestEvent(tx, request, {
      type: "SUBMITTED",
      actorKind: "REQUESTER",
      actorUserId: auth.userId,
      at: now,
      details: { essentialDataOnly: true, ...(withoutDocuments ? { withoutDocuments } : {}) },
    });
    await recordDomainEvent(tx, {
      aggregateType: "QuoteRequest",
      aggregateId: request.id,
      type: "RequestSubmitted",
      at: now,
      actorUserId: auth.userId,
      data: { outcome: "YELLOW", round, essentialDataOnly: true },
    });
    await this.audit.inTransaction(tx, actorOf(auth), {
      action: "REQUEST_SUBMITTED",
      targetType: "QuoteRequest",
      targetId: request.id,
      after: { essentialDataOnly: true, round },
    });
    await this.notifyBackOffice(tx, request, intake.data.plate, "YELLOW");
    return {
      id: request.id,
      code: request.code,
      status: "IN_VERIFICATION" as const,
      autoOutcome: "YELLOW" as const,
      round,
      quoteDataVersion: null,
      autoApprove: false,
      request,
      quoteData: null,
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
    vehicle: string,
    outcome: string,
  ) {
    // The requester may not read AstAx memberships (row level security): the
    // recipients are looked up as a system job, identifiers only.
    const staff = await withContext(this.db, SYSTEM_CONTEXT, (system) =>
      system.membership.findMany({
        where: {
          role: { in: ["BO_VERIFIER", "BO_SUPERVISOR"] },
          status: "ACTIVE",
          organization: { type: "ASTAX" },
        },
        select: { user: { select: { id: true } } },
      }),
    );
    await this.notifications.inApp(
      tx,
      staff.map((m) => ({ userId: m.user.id })),
      "request.submitted.bo",
      () => ({
        codice: request.code,
        canale: labelsIt.channel[request.channel],
        veicolo: vehicle,
        esito_auto: labelsIt.outcome[outcome as "GREEN" | "YELLOW" | "RED"],
        link: `/verifiche/${request.id}`,
      }),
      `/verifiche/${request.id}`,
      // Each submission is its own event: a second one after an integration is not a duplicate.
      { requestId: request.id, submittedAt: this.clock.now().toISOString() },
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
