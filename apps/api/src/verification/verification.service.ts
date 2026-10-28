import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { AniaReaderPort } from "@astax/adapters/ania";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import {
  recordDomainEvent,
  withContext,
  type DbClient,
  type DbTransaction,
  type DocumentKind,
  type QuoteRequest,
} from "@astax/db";
import {
  derivedColumns,
  IntakeSchema,
  quoteDataFromIntake,
  RequestTermsSchema,
  QuoteDataSchema,
  submissionProblems,
  worstOutcome,
  quoteDataFromBot,
  type IntakeCandidate,
  AniaRecordSchema,
  type AniaRecord,
  checkProblem,
  missingChecks,
  VERIFICATION_STEPS,
  normalizePlate,
  VerificationChecksSchema,
  type CheckInput,
  type VerificationChecks,
  type VerificationStep,
  type ChecklistItem,
  type QuoteData,
  type QuoteDraft,
  type QuoteDraftSection,
} from "@astax/shared/domain";
import { calendarDateToDbDate, romeCalendarDate } from "@astax/shared/format";
import type { Logger } from "@astax/shared/logging";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import type { ApiConfig } from "../config/config.js";
import { ProblemError } from "../http/problem.js";
import {
  ANIA_READER,
  CLOCK,
  CONFIG,
  DB,
  FIELD_CIPHER,
  LOGGER,
  OBJECT_STORAGE,
} from "../infra/tokens.js";
import { NotificationService } from "../notifications/notification.service.js";
import { AutoCheckService } from "../requests/auto-check.service.js";
import { listCodeProblems } from "../requests/list-codes.js";
import { ReferenceService } from "../requests/reference.service.js";
import {
  addRequestEvent,
  decryptJson,
  encryptJson,
  extractionOf,
  hasSharingConsent,
  settingsAt,
  sha256Of,
} from "../requests/request-support.js";
import { customerName } from "../requests/requests.service.js";
import { aniaViewOf } from "./ania-view.js";
import { changedPaths } from "./json-diff.js";

export interface IntegrationInput {
  reasonCodes: string[];
  message?: string;
  sections: QuoteDraftSection[];
  documents: DocumentKind[];
}

type StoredChecklistItem = ChecklistItem & { correction: string | null; note: string | null };

/**
 * The back office verification (spec 06 «Coda verifiche», «Scheda di
 * verifica»). Every opening of the card or of a document is logged (rule 4);
 * corrections create a new quoteData version (ADR 0007); the decisions are
 * APPROVED (the auction opens in phase 3), INTEGRATION_REQUESTED, EXCLUDED.
 */
@Injectable()
export class VerificationService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(AutoCheckService) private readonly autoCheck: AutoCheckService,
    @Inject(ReferenceService) private readonly reference: ReferenceService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(ANIA_READER) private readonly ania: AniaReaderPort,
  ) {}

  /** Requests waiting for a decision, oldest first. */
  async queue(auth: AuthContext, filter: { outcome?: string; mine?: boolean }) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const rounds = await tx.verification.findMany({
        where: {
          decision: null,
          quoteRequest: { status: "IN_VERIFICATION" },
          ...(filter.outcome ? { autoOutcome: filter.outcome as "GREEN" | "YELLOW" | "RED" } : {}),
          ...(filter.mine ? { assignedToUserId: auth.userId } : {}),
        },
        include: { quoteRequest: true },
        orderBy: { createdAt: "asc" },
        take: 200,
      });
      const assignees = await tx.user.findMany({
        where: {
          id: { in: rounds.flatMap((r) => (r.assignedToUserId ? [r.assignedToUserId] : [])) },
        },
        select: { id: true, firstName: true, lastName: true },
      });
      const nameOf = new Map(assignees.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
      return rounds.map((r) => ({
        requestId: r.quoteRequestId,
        code: r.quoteRequest.code,
        channel: r.quoteRequest.channel,
        round: r.round,
        autoOutcome: r.autoOutcome,
        waitingSince: r.createdAt.toISOString(),
        waitingMinutes: Math.floor((now.getTime() - r.createdAt.getTime()) / 60_000),
        plate: r.quoteRequest.plate,
        quoteType: checksOf(r.checks).QUOTE_TYPE?.value ?? null,
        checksDone: VERIFICATION_STEPS.length - missingChecks(checksOf(r.checks)).length,
        assignedTo: r.assignedToUserId
          ? {
              id: r.assignedToUserId,
              name: nameOf.get(r.assignedToUserId) ?? "",
              since: r.assignedAt?.toISOString() ?? null,
            }
          : null,
      }));
    });
  }

  private async load(tx: DbTransaction, id: string) {
    const request = await tx.quoteRequest.findUnique({ where: { id } });
    if (!request) throw new ProblemError("NOT_FOUND");
    const round = await tx.verification.findFirst({
      where: { quoteRequestId: id },
      orderBy: { round: "desc" },
    });
    return { request, round };
  }

  private async quoteDataOf(tx: DbTransaction, request: QuoteRequest): Promise<QuoteData | null> {
    if (request.quoteDataVersion === null) return null;
    const version = await tx.quoteDataVersion.findUniqueOrThrow({
      where: {
        quoteRequestId_version: { quoteRequestId: request.id, version: request.quoteDataVersion },
      },
    });
    return decryptJson(this.cipher, version.dataEnc) as QuoteData;
  }

  /**
   * ADR 0013: for a request with the essential data only, the data the back
   * office starts from: the essential data, and quoteData prepared from the
   * documents read by the bot, with the list of what is missing.
   */
  private async completionOf(
    tx: DbTransaction,
    request: QuoteRequest,
    documents: { kind: string; createdAt: Date; extractionEnc: string | null }[],
  ) {
    if (!request.draftEnc) return null;
    const draft = decryptJson(this.cipher, request.draftEnc) as {
      intake?: unknown;
      request?: unknown;
    };
    const intake = IntakeSchema.safeParse(draft.intake);
    const terms = RequestTermsSchema.safeParse(draft.request);
    if (!intake.success || !terms.success) return null;
    const latest = (kind: string) => {
      const found = documents
        .filter((d) => d.kind === kind)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      const extraction = found ? extractionOf(this.cipher, found.extractionEnc) : null;
      return extraction
        ? Object.fromEntries(Object.entries(extraction.fields).map(([k, v]) => [k, v.value]))
        : undefined;
    };
    const registration = latest("REGISTRATION_CERTIFICATE");
    const make = typeof registration?.make === "string" ? registration.make : undefined;
    const model = typeof registration?.model === "string" ? registration.model : undefined;
    // A broker's request: the holder is its customer (LEG-04, docs/piano-broker.md B).
    const customer = request.customerId
      ? await tx.customer.findUnique({
          where: { id: request.customerId },
          include: { person: true },
        })
      : null;
    const holder =
      request.channel !== "BROKER" || !customer
        ? null
        : customer.person.kind === "COMPANY"
          ? {
              // Question 25: a company customer is the holder, with its VAT number.
              kind: "COMPANY" as const,
              companyName: customer.person.companyName ?? "",
              vatNumber: customer.person.vatNumberEnc
                ? this.cipher.decrypt(customer.person.vatNumberEnc)
                : "",
            }
          : {
              kind: "PERSON" as const,
              surname: customer.person.surname ?? undefined,
              givenName: customer.person.givenName ?? undefined,
              fiscalCode: customer.person.fiscalCodeEnc
                ? this.cipher.decrypt(customer.person.fiscalCodeEnc)
                : undefined,
            };
    const fiscalCode =
      (holder?.kind === "PERSON" ? holder.fiscalCode : undefined) ??
      registration?.ownerFiscalCode ??
      latest("IDENTITY_DOCUMENT")?.fiscalCode;
    const cadastral =
      typeof fiscalCode === "string" && fiscalCode.length === 16 ? fiscalCode.slice(11, 15) : null;
    const municipality = cadastral
      ? await tx.municipality.findFirst({ where: { cadastralCode: cadastral } })
      : null;
    const candidate = quoteDataFromIntake(intake.data, terms.data, {
      extracted: {
        REGISTRATION_CERTIFICATE: registration,
        DRIVING_LICENCE: latest("DRIVING_LICENCE"),
        RISK_CERTIFICATE: latest("RISK_CERTIFICATE"),
        IDENTITY_DOCUMENT: latest("IDENTITY_DOCUMENT"),
      },
      vehicle:
        make && model
          ? {
              make,
              model,
              fuel: typeof registration?.fuel === "string" ? registration.fuel : undefined,
              powerKw: typeof registration?.powerKw === "number" ? registration.powerKw : undefined,
              displacementCc:
                typeof registration?.displacementCc === "number"
                  ? registration.displacementCc
                  : undefined,
              firstRegistrationDate:
                typeof registration?.firstRegistrationDate === "string"
                  ? registration.firstRegistrationDate
                  : undefined,
            }
          : null,
      customer: holder,
      istatOfCadastral: (code) => (code === cadastral ? (municipality?.istatCode ?? null) : null),
      today: romeCalendarDate(this.clock.now()),
    });
    // Answer 6B: what the bot did not read, the back office asks the customer by phone.
    const [requester, lists] = await Promise.all([
      tx.user.findUnique({ where: { id: request.requesterUserId } }),
      tx.listValue.findMany({
        where: {
          listKey: { in: ["vehicleType", "vehicleUse", "fuel", "provenance", "licenceCategory"] },
          active: true,
        },
        orderBy: { sortOrder: "asc" },
      }),
    ]);
    const phoneEnc = customer?.phoneEnc ?? requester?.phoneEnc ?? null;
    return {
      intake: intake.data,
      candidate,
      phone: phoneEnc ? this.cipher.decrypt(phoneEnc) : null,
      lists: Object.fromEntries(
        ["vehicleType", "vehicleUse", "fuel", "provenance", "licenceCategory"].map((key) => [
          key,
          lists.filter((l) => l.listKey === key).map((l) => ({ code: l.code, it: l.labelIt })),
        ]),
      ),
    };
  }

  /** The verification card; reading it is logged (QUOTE_DATA_VIEWED). */
  async card(auth: AuthContext, id: string) {
    backOfficeOnly(auth);
    return withContext(this.db, auth.db, async (tx) => {
      const { request, round } = await this.load(tx, id);
      const [quoteData, documents, events, versions, customer, consent] = await Promise.all([
        this.quoteDataOf(tx, request),
        tx.document.findMany({
          where: { quoteRequestId: id, deletedAt: null },
          orderBy: { createdAt: "asc" },
        }),
        tx.quoteRequestEvent.findMany({ where: { quoteRequestId: id }, orderBy: { at: "asc" } }),
        tx.quoteDataVersion.findMany({
          where: { quoteRequestId: id },
          orderBy: { version: "asc" },
          select: {
            version: true,
            source: true,
            changedFields: true,
            reason: true,
            createdAt: true,
          },
        }),
        request.customerId
          ? tx.customer.findUnique({ where: { id: request.customerId }, include: { person: true } })
          : Promise.resolve(null),
        request.customerId
          ? tx.consent.findFirst({
              where: {
                customerId: request.customerId,
                type: "DATA_SHARING_AGENCIES",
                revokedAt: null,
              },
              orderBy: { acceptedAt: "desc" },
            })
          : Promise.resolve(null),
      ]);
      const holder = round?.assignedToUserId
        ? await tx.user.findUnique({
            where: { id: round.assignedToUserId },
            select: { firstName: true, lastName: true },
          })
        : null;
      const lists = await tx.listValue.findMany({
        where: { listKey: { in: ["integrationRequestReason", "exclusionCase"] }, active: true },
        orderBy: { sortOrder: "asc" },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "QUOTE_DATA_VIEWED",
        targetType: "QuoteRequest",
        targetId: id,
        after: { quoteDataVersion: request.quoteDataVersion },
      });
      return {
        id: request.id,
        code: request.code,
        status: request.status,
        channel: request.channel,
        // ADR 0014, answer 4: a request of a broker's lot sent without documents.
        withoutDocuments: request.withoutDocuments,
        customer: customer ? customerName(customer.person) : null,
        reasons: {
          integration: lists
            .filter((l) => l.listKey === "integrationRequestReason")
            .map((l) => ({ code: l.code, it: l.labelIt })),
          exclusion: lists
            .filter((l) => l.listKey === "exclusionCase")
            .map((l) => ({ code: l.code, it: l.labelIt })),
        },
        quoteData,
        quoteDataVersion: request.quoteDataVersion,
        completion: quoteData === null ? await this.completionOf(tx, request, documents) : null,
        versions: versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })),
        consent: consent
          ? {
              method: consent.method,
              acceptedAt: consent.acceptedAt.toISOString(),
              evidence: consent.evidence,
            }
          : null,
        verification: round
          ? {
              round: round.round,
              autoOutcome: round.autoOutcome,
              checklist: round.checklist,
              assignedToUserId: round.assignedToUserId,
              assignedTo: round.assignedToUserId
                ? {
                    id: round.assignedToUserId,
                    name: holder ? `${holder.firstName} ${holder.lastName}`.trim() : "",
                    since: round.assignedAt?.toISOString() ?? null,
                  }
                : null,
              checks: checksOf(round.checks),
              ania:
                round.aniaEnc && round.aniaReadAt
                  ? await this.aniaView(
                      tx,
                      decryptJson(this.cipher, round.aniaEnc) as AniaRecord,
                      round.aniaReadAt,
                    )
                  : null,
              decision: round.decision,
              reasonCodes: round.reasonCodes,
              message: round.message,
              decidedAt: round.decidedAt?.toISOString() ?? null,
            }
          : null,
        documents: documents.map((d) => ({
          id: d.id,
          kind: d.kind,
          driverIndex: d.driverIndex,
          fileName: d.fileName,
          mime: d.mime,
          size: d.size,
          extraction: extractionOf(this.cipher, d.extractionEnc),
          uploadedAt: d.createdAt.toISOString(),
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

  async documentFile(auth: AuthContext, id: string, documentId: string) {
    backOfficeOnly(auth);
    const document = await withContext(this.db, auth.db, async (tx) => {
      const found = await tx.document.findFirst({
        where: { id: documentId, quoteRequestId: id, deletedAt: null },
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

  private async openRound(tx: DbTransaction, id: string) {
    const { request, round } = await this.load(tx, id);
    if (request.status !== "IN_VERIFICATION" || !round || round.decision !== null) {
      throw new ProblemError("CONFLICT", "The request is not waiting for a verification decision");
    }
    return { request, round };
  }

  /**
   * Dan, 2026-10-28: only the operator who holds the request decides on it.
   * A request nobody holds becomes the caller's with the first action; one
   * held by a colleague answers 409 (the supervisor takes it with assign).
   */
  private async heldRound(tx: DbTransaction, auth: AuthContext, id: string) {
    const opened = await this.openRound(tx, id);
    const { round } = opened;
    if (round.assignedToUserId === auth.userId) return opened;
    if (round.assignedToUserId === null) {
      const now = this.clock.now();
      // Only one of two operators acting at the same moment gets it.
      const taken = await tx.verification.updateMany({
        where: { id: round.id, assignedToUserId: null },
        data: { assignedToUserId: auth.userId, assignedAt: now },
      });
      if (taken.count === 1) {
        await this.audit.inTransaction(tx, actorOf(auth), {
          action: "VERIFICATION_ASSIGNED",
          targetType: "QuoteRequest",
          targetId: id,
          before: { assignedToUserId: null },
          after: { assignedToUserId: auth.userId },
        });
        return { ...opened, round: { ...round, assignedToUserId: auth.userId, assignedAt: now } };
      }
    }
    throw new ProblemError("CONFLICT", "A colleague holds the request", [
      { path: "assignedTo", issue: "ASSIGNED_TO_COLLEAGUE" },
    ]);
  }

  /** «Prendo io in carico»; a request held by a colleague only the supervisor takes over. */
  async assign(auth: AuthContext, id: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const { round } = await this.openRound(tx, id);
      if (round.assignedToUserId === auth.userId) {
        return { assignedToUserId: auth.userId, assignedAt: round.assignedAt?.toISOString() };
      }
      if (round.assignedToUserId !== null && !isSupervisor(auth)) {
        throw new ProblemError("CONFLICT", "A colleague holds the request", [
          { path: "assignedTo", issue: "ASSIGNED_TO_COLLEAGUE" },
        ]);
      }
      const now = this.clock.now();
      const taken = await tx.verification.updateMany({
        where: { id: round.id, assignedToUserId: round.assignedToUserId },
        data: { assignedToUserId: auth.userId, assignedAt: now },
      });
      if (taken.count !== 1) {
        throw new ProblemError("CONFLICT", "A colleague holds the request", [
          { path: "assignedTo", issue: "ASSIGNED_TO_COLLEAGUE" },
        ]);
      }
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "VERIFICATION_ASSIGNED",
        targetType: "QuoteRequest",
        targetId: id,
        before: { assignedToUserId: round.assignedToUserId },
        after: { assignedToUserId: auth.userId },
      });
      return { assignedToUserId: auth.userId, assignedAt: now.toISOString() };
    });
  }

  /** Gives the request back to the queue: its holder, or the supervisor. */
  async release(auth: AuthContext, id: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const { round } = await this.openRound(tx, id);
      if (round.assignedToUserId === null) return { assignedToUserId: null };
      if (round.assignedToUserId !== auth.userId && !isSupervisor(auth)) {
        throw new ProblemError("CONFLICT", "A colleague holds the request", [
          { path: "assignedTo", issue: "ASSIGNED_TO_COLLEAGUE" },
        ]);
      }
      await tx.verification.update({
        where: { id: round.id },
        data: { assignedToUserId: null, assignedAt: null },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "VERIFICATION_RELEASED",
        targetType: "QuoteRequest",
        targetId: id,
        before: { assignedToUserId: round.assignedToUserId },
        after: { assignedToUserId: null },
      });
      return { assignedToUserId: null };
    });
  }

  /**
   * One of the five checks (Dan, 2026-10-28). The corrected plate or birth
   * date is kept with the check; the approval wants it in the data in force.
   * The log keeps the step and whether a value was corrected, not the value.
   */
  async recordCheck(auth: AuthContext, id: string, input: CheckInput) {
    const issue = checkProblem(input);
    if (issue) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [{ path: "value", issue }]);
    }
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const { round } = await this.heldRound(tx, auth, id);
      const value =
        "value" in input && input.value !== undefined
          ? input.step === "PLATE"
            ? normalizePlate(input.value)
            : input.value
          : undefined;
      const checks: VerificationChecks = {
        ...checksOf(round.checks),
        [input.step]: {
          at: now.toISOString(),
          byUserId: auth.userId,
          ...(value !== undefined ? { value } : {}),
        },
      };
      await tx.verification.update({ where: { id: round.id }, data: { checks: checks as never } });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "VERIFICATION_CHECK_RECORDED",
        targetType: "QuoteRequest",
        targetId: id,
        after: {
          round: round.round,
          step: input.step,
          corrected:
            input.step === "PLATE" || input.step === "BIRTH_DATE" ? value !== undefined : false,
          ...(input.step === "QUOTE_TYPE" ? { quoteType: input.value } : {}),
        },
      });
      return checks;
    });
  }

  /**
   * «Leggi da ANIA» (Dan, 2026-10-28): the record of the plate in force (the
   * corrected one, if any), kept encrypted on the round; the sheet and the
   * warnings are derived from it. The log keeps that it was read, not what.
   */
  async readAnia(auth: AuthContext, id: string) {
    const now = this.clock.now();
    const { plate, owner, roundId, round } = await withContext(this.db, auth.db, async (tx) => {
      const { request, round } = await this.heldRound(tx, auth, id);
      const quoteData = await this.quoteDataOf(tx, request);
      const plate =
        checksOf(round.checks).PLATE?.value ?? quoteData?.vehicle.plate ?? request.plate;
      if (!plate) {
        throw new ProblemError("CONFLICT", undefined, [{ path: "plate", issue: "NO_PLATE" }]);
      }
      return { plate, owner: ownerOf(quoteData), roundId: round.id, round: round.round };
    });
    // The reader may take seconds: outside the transaction.
    const result = await this.ania.read({ plate, owner, requestId: id, operatorId: auth.userId });
    if (!result.found) {
      throw new ProblemError("CONFLICT", undefined, [
        { path: "plate", issue: `ANIA_${result.reason}` },
      ]);
    }
    const parsed = AniaRecordSchema.safeParse(result.record);
    if (!parsed.success) {
      this.logger.warn({ requestId: id }, "ANIA record not in the expected shape");
      throw new ProblemError("CONFLICT", undefined, [
        { path: "plate", issue: "ANIA_PROVIDER_ERROR" },
      ]);
    }
    return withContext(this.db, auth.db, async (tx) => {
      // The request may have been decided or taken over meanwhile.
      const held = await this.heldRound(tx, auth, id);
      if (held.round.id !== roundId) throw new ProblemError("CONFLICT");
      await tx.verification.update({
        where: { id: roundId },
        data: { aniaEnc: encryptJson(this.cipher, parsed.data), aniaReadAt: now },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "ANIA_READ",
        targetType: "QuoteRequest",
        targetId: id,
        after: { round },
      });
      return this.aniaView(tx, parsed.data, now);
    });
  }

  /** The sheet, the warnings and the name of the birth place of a stored record. */
  private aniaView(tx: DbTransaction, record: AniaRecord, readAt: Date) {
    return aniaViewOf(tx, record, readAt, this.clock.now());
  }

  /**
   * Dan, 2026-10-28 (docs/piano-dati-dal-bot.md): «Confermo la correttezza dei
   * dati estratti dal bot». The data of the request are built from documents,
   * plate data and ANIA, with the corrected plate and birth date of the
   * checks; they become a version of the data and the auction opens at once.
   */
  async confirmBotData(auth: AuthContext, id: string) {
    const built = await this.saveBotData(auth, id, true);
    await withContext(this.db, auth.db, (tx) =>
      this.audit.inTransaction(tx, actorOf(auth), {
        action: "VERIFICATION_BOT_DATA_CONFIRMED",
        targetType: "QuoteRequest",
        targetId: id,
        after: { round: built.round, notAvailable: built.notAvailable },
      }),
    );
    return this.approve(auth, id, undefined);
  }

  /**
   * The bots' data as a version of the data of the request. Before the
   * approval the five checks are required; before an integration on a request
   * with the essential data only they are not (the document may be unreadable).
   */
  private async saveBotData(auth: AuthContext, id: string, requireChecks: boolean) {
    const built = await withContext(this.db, auth.db, async (tx) => {
      const { request, round } = await this.heldRound(tx, auth, id);
      const checks = checksOf(round.checks);
      const missing = missingChecks(checks);
      if (requireChecks && missing.length > 0) {
        throw new ProblemError(
          "CONFLICT",
          "The checks are not complete",
          missing.map((step) => ({ path: `checks.${step}`, issue: "CHECKS_INCOMPLETE" })),
        );
      }
      const quoteData = await this.quoteDataOf(tx, request);
      let base: QuoteData | Omit<IntakeCandidate, "missing">;
      if (quoteData) base = quoteData;
      else {
        const documents = await tx.document.findMany({
          where: { quoteRequestId: id, deletedAt: null },
          orderBy: { createdAt: "asc" },
        });
        const completion = await this.completionOf(tx, request, documents);
        if (!completion) throw new ProblemError("CONFLICT", "The request has no data");
        // The list of what was missing is for the screen, not for the data.
        const { missing: _missing, ...candidate } = completion.candidate;
        void _missing;
        base = candidate;
      }
      const sheet =
        round.aniaEnc && round.aniaReadAt
          ? (
              await this.aniaView(
                tx,
                decryptJson(this.cipher, round.aniaEnc) as AniaRecord,
                round.aniaReadAt,
              )
            ).sheet
          : null;
      const result = quoteDataFromBot({
        base: withChecks(base, checks),
        sheet,
        quoteType: checks.QUOTE_TYPE?.value ?? null,
      });
      return {
        ...result,
        round: round.round,
        changed: changedPaths(quoteData, result.quoteData).length > 0,
      };
    });
    if (built.changed) {
      await this.correct(auth, id, {
        quoteData: built.quoteData,
        reason: requireChecks
          ? "Dati del bot confermati dall'operatore"
          : "Dati del bot prima della richiesta di integrazione",
        fromBot: true,
      });
    }
    return built;
  }

  /** Takes a check back. */
  async clearCheck(auth: AuthContext, id: string, step: VerificationStep) {
    return withContext(this.db, auth.db, async (tx) => {
      const { round } = await this.heldRound(tx, auth, id);
      const checks = checksOf(round.checks);
      if (!checks[step]) return checks;
      const rest = Object.fromEntries(
        Object.entries(checks).filter(([key]) => key !== step),
      ) as VerificationChecks;
      await tx.verification.update({ where: { id: round.id }, data: { checks: rest as never } });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "VERIFICATION_CHECK_CLEARED",
        targetType: "QuoteRequest",
        targetId: id,
        after: { round: round.round, step },
      });
      return rest;
    });
  }

  /** Manual correction and note on one checklist item (spec 06). */
  async updateChecklistItem(
    auth: AuthContext,
    id: string,
    code: string,
    input: { correction?: string; note?: string },
  ) {
    return withContext(this.db, auth.db, async (tx) => {
      const { round } = await this.heldRound(tx, auth, id);
      const items = round.checklist as unknown as StoredChecklistItem[];
      const item = items.find((i) => i.code === code);
      if (!item) throw new ProblemError("NOT_FOUND");
      const updated = items.map((i) =>
        i.code === code
          ? {
              ...i,
              // An empty field clears the value.
              correction: input.correction === undefined ? i.correction : input.correction || null,
              note: input.note === undefined ? i.note : input.note || null,
            }
          : i,
      );
      await tx.verification.update({
        where: { id: round.id },
        data: { checklist: updated as never },
      });
      // The texts may hold personal data: the log keeps which item changed, not the words.
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "VERIFICATION_CHECKLIST_UPDATED",
        targetType: "QuoteRequest",
        targetId: id,
        after: { round: round.round, item: code },
      });
      return updated.find((i) => i.code === code);
    });
  }

  /**
   * A correction of the data by the back office: a new quoteData version, the
   * changed paths and both fingerprints in the log, never the values; the
   * automatic check runs again on the corrected data.
   */
  async correct(
    auth: AuthContext,
    id: string,
    input: { quoteData: unknown; reason: string; fromBot?: boolean },
  ) {
    const parsed = QuoteDataSchema.safeParse(input.quoteData);
    if (!parsed.success) throw ProblemError.fromZod(parsed.error);
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const { request, round } = await this.heldRound(tx, auth, id);
      const before = await this.quoteDataOf(tx, request);
      const after = parsed.data;
      // ADR 0013: with the essential data only, this is the completion: version 1.
      const completion = before === null;
      const changed = changedPaths(before, after);
      if (changed.length === 0) throw new ProblemError("VALIDATION_FAILED", "Nothing changed");
      await this.checkLikeSubmission(tx, request, before, after, now, input.fromBot ?? false);
      const version = (request.quoteDataVersion ?? 0) + 1;
      await tx.quoteDataVersion.create({
        data: {
          quoteRequestId: id,
          ownerUserId: request.ownerUserId,
          ownerOrganizationId: request.ownerOrganizationId,
          version,
          dataEnc: encryptJson(this.cipher, after),
          dataSha256: sha256Of(after),
          source: completion ? "BACK_OFFICE_COMPLETION" : "BACK_OFFICE_CORRECTION",
          changedFields: changed,
          reason: input.reason,
          createdByUserId: auth.userId,
        },
      });
      const derived = derivedColumns(after);
      const check = await this.autoCheck.check(tx, id, after, now);
      const previous = round.checklist as unknown as StoredChecklistItem[];
      const checklist = check.items.map((i) => {
        const old = previous.find((p) => p.code === i.code);
        return { ...i, correction: old?.correction ?? null, note: old?.note ?? null };
      });
      // The consent item does not depend on the data: it is kept as it was. After
      // a completion the private customer's consent (given in the app) is green.
      const consent = previous.find((p) => p.code === "CONSENT");
      if (consent) checklist.push(consent);
      else if (completion) {
        checklist.push({
          code: "CONSENT",
          outcome: "GREEN",
          reasons: [],
          fields: [],
          correction: null,
          note: null,
        });
      }
      const outcome = worstOutcome(checklist.map((i) => i.outcome));
      await tx.verification.update({
        where: { id: round.id },
        data: { quoteDataVersion: version, autoOutcome: outcome, checklist: checklist as never },
      });
      await tx.quoteRequest.update({
        where: { id },
        data: {
          quoteDataVersion: version,
          plate: after.vehicle.plate,
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
          auctionDurationHours: after.request.auctionDurationHours,
          autoOutcome: outcome,
          // The essential data has done its job once the data is complete.
          ...(completion ? { draftEnc: null } : {}),
        },
      });
      await addRequestEvent(tx, request, {
        type: "CORRECTED",
        actorKind: "BACK_OFFICE",
        actorUserId: auth.userId,
        at: now,
        details: { quoteDataVersion: version, changedFields: changed, completion },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "QUOTE_DATA_CORRECTED",
        targetType: "QuoteRequest",
        targetId: id,
        before: {
          quoteDataVersion: request.quoteDataVersion,
          sha256: before ? sha256Of(before) : null,
        },
        after: { quoteDataVersion: version, sha256: sha256Of(after), changedFields: changed },
        reason: input.reason,
      });
      return { quoteDataVersion: version, changedFields: changed, autoOutcome: outcome };
    });
  }

  /**
   * A corrected quoteData must pass the same checks as a submission: active
   * list codes, an existing package, options in force (rule 7), drivers.
   */
  private async checkLikeSubmission(
    tx: DbTransaction,
    request: QuoteRequest,
    before: QuoteData | null,
    data: QuoteData,
    now: Date,
    fromBot = false,
  ) {
    const codes = await this.reference.activeCodes(tx);
    const draft: QuoteDraft = {
      policyHolder: data.policyHolder,
      vehicleOwner: data.vehicleOwner,
      vehicle: data.vehicle,
      history: data.history,
      driving: { drivers: data.drivers, drivingFormula: data.drivingFormula },
      request: data.request,
    };
    const errors: { path: string; issue: string }[] = listCodeProblems(draft, codes);
    if (
      !(await this.reference.packageExists(
        tx,
        data.request.packageCode,
        data.request.packageVersion,
      ))
    ) {
      errors.push({ path: "request.packageVersion", issue: "unknown_package" });
    }
    const settings = await settingsAt(
      tx,
      [
        "drivingFormula.expertMinAge",
        "auction.durationsWorkingHours",
        "guarantee.minValidityDaysOptions",
      ],
      now,
    );
    const problems = submissionProblems(data, {
      today: romeCalendarDate(now),
      expertMinAge: settings["drivingFormula.expertMinAge"],
      auctionDurations: settings["auction.durationsWorkingHours"],
      minValidityDaysOptions: settings["guarantee.minValidityDaysOptions"],
      packageIncludesTheft: await this.reference.packageIncludesTheft(
        tx,
        data.request.packageCode,
        data.request.packageVersion,
        data.request.coverages,
      ),
    });
    // A request waiting past its start date can still be corrected: the date
    // is checked only when the correction changes it.
    const startChanged = before?.request.startDate !== data.request.startDate;
    errors.push(
      ...problems
        .filter((p) => startChanged || p !== "START_DATE_IN_THE_PAST")
        // Dan, 2026-10-28: with the bots' data what they did not find stays «non disponibile».
        .filter((p) => !fromBot || !BOT_TOLERATED_PROBLEMS.has(p))
        .map((p) => ({ path: "quoteData", issue: p })),
    );
    // LEG-04: on a broker's request the holder stays the customer who gave the
    // consent; a private user may hold the request for someone else (question 12).
    if (request.customerId && request.channel === "BROKER") {
      const customer = await tx.customer.findUniqueOrThrow({
        where: { id: request.customerId },
        include: { person: true },
      });
      const holder = data.policyHolder;
      const same =
        holder.kind === "PERSON"
          ? customer.person.fiscalCodeHash ===
            this.cipher.blindIndex("fiscalCode", holder.fiscalCode)
          : customer.person.vatNumberHash === this.cipher.blindIndex("vatNumber", holder.vatNumber);
      if (!same) errors.push({ path: "policyHolder.fiscalCode", issue: "HOLDER_NOT_CUSTOMER" });
    }
    if (errors.length > 0) throw new ProblemError("VALIDATION_FAILED", undefined, errors);
  }

  async approve(auth: AuthContext, id: string, note: string | undefined) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const { request, round } = await this.heldRound(tx, auth, id);
      // ADR 0013: a request with the essential data only is completed first.
      if (request.quoteDataVersion === null) {
        throw new ProblemError("CONFLICT", "Complete the data before the approval", [
          { path: "quoteData", issue: "TO_COMPLETE" },
        ]);
      }
      // Dan, 2026-10-28: the approval goes only with the five checks done, and
      // a corrected plate or birth date must be the one in the data in force.
      const checks = checksOf(round.checks);
      const missing = missingChecks(checks);
      if (missing.length > 0) {
        throw new ProblemError(
          "CONFLICT",
          "The checks are not complete",
          missing.map((step) => ({ path: `checks.${step}`, issue: "CHECKS_INCOMPLETE" })),
        );
      }
      const quoteData = await this.quoteDataOf(tx, request);
      const owner =
        quoteData?.vehicleOwner === "SAME_AS_POLICY_HOLDER"
          ? quoteData.policyHolder
          : quoteData?.vehicleOwner;
      if (checks.PLATE?.value && quoteData?.vehicle.plate !== checks.PLATE.value) {
        throw new ProblemError("CONFLICT", undefined, [
          { path: "checks.PLATE", issue: "CORRECTION_NOT_IN_DATA" },
        ]);
      }
      if (
        checks.BIRTH_DATE?.value &&
        owner?.kind === "PERSON" &&
        owner.birthDate !== checks.BIRTH_DATE.value
      ) {
        throw new ProblemError("CONFLICT", undefined, [
          { path: "checks.BIRTH_DATE", issue: "CORRECTION_NOT_IN_DATA" },
        ]);
      }
      if (!(await hasSharingConsent(tx, request.customerId))) {
        throw new ProblemError("CONFLICT", undefined, [
          { path: "consent", issue: "CONSENT_REVOKED" },
        ]);
      }
      await tx.verification.update({
        where: { id: round.id },
        data: {
          decision: "APPROVED",
          message: note ?? null,
          decidedByUserId: auth.userId,
          decidedAt: now,
        },
      });
      await addRequestEvent(tx, request, {
        type: "APPROVED",
        actorKind: "BACK_OFFICE",
        actorUserId: auth.userId,
        at: now,
      });
      // Phase 3 turns this event into the opening of the auction.
      await recordDomainEvent(tx, {
        aggregateType: "QuoteRequest",
        aggregateId: id,
        type: "RequestApproved",
        at: now,
        actorUserId: auth.userId,
        data: { round: round.round, quoteDataVersion: request.quoteDataVersion },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "VERIFICATION_DECIDED",
        targetType: "QuoteRequest",
        targetId: id,
        after: { decision: "APPROVED", round: round.round },
      });
      return { decision: "APPROVED" as const };
    });
  }

  private async reasonLabels(tx: DbTransaction, listKey: string, codes: readonly string[]) {
    const values = await tx.listValue.findMany({
      where: { listKey, code: { in: [...codes] }, active: true },
    });
    if (values.length !== new Set(codes).size) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "reasonCodes", issue: `NOT_IN_LIST:${listKey}` },
      ]);
    }
    return codes.map((c) => values.find((v) => v.code === c)?.labelIt ?? c);
  }

  /** The requester gets the message in the app and by email. */
  private async notifyRequester(
    tx: DbTransaction,
    request: QuoteRequest,
    eventKey: "request.integration_requested" | "request.excluded",
    variables: { motivo: string; messaggio_back_office: string },
  ) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: request.requesterUserId } });
    const quoteData = await this.quoteDataOf(tx, request);
    const vehicle = quoteData
      ? `${quoteData.vehicle.make} ${quoteData.vehicle.model} ${quoteData.vehicle.plate}`
      : "";
    const link =
      request.channel === "PRIVATE" ? `/preventivi/${request.id}` : `/richieste/${request.id}`;
    const all = {
      nome: user.firstName,
      codice: request.code,
      veicolo: vehicle,
      link: `${this.config.WEB_URL}${link}`,
      ...variables,
    };
    // The channels follow the template and the requester's choices; sent after the commit.
    return this.notifications.deliver(
      tx,
      [
        {
          userId: user.id,
          email: user.emailEnc ? this.cipher.decrypt(user.emailEnc) : null,
          phone: null,
        },
      ],
      eventKey,
      () => all,
      link,
      // Each decision is its own event (a second integration is not a duplicate).
      { requestId: request.id, decidedAt: this.clock.now().toISOString() },
    );
  }

  async requestIntegration(auth: AuthContext, id: string, input: IntegrationInput) {
    // Dan, 2026-10-28: no «Completa i dati» any more: a request with the essential
    // data only gets the bots' data first, so the customer changes only what is asked.
    const toComplete = await withContext(this.db, auth.db, async (tx) => {
      const { request } = await this.heldRound(tx, auth, id);
      return request.quoteDataVersion === null;
    });
    if (toComplete) await this.saveBotData(auth, id, false);
    const now = this.clock.now();
    const sent = await withContext(this.db, auth.db, async (tx) => {
      const { request, round } = await this.heldRound(tx, auth, id);
      const labels = await this.reasonLabels(tx, "integrationRequestReason", input.reasonCodes);
      const quoteData = await this.quoteDataOf(tx, request);
      if (!quoteData) throw new ProblemError("CONFLICT", "The request has no data");
      // The draft starts from the data in force; only the sections asked for can change.
      const draft: QuoteDraft = {
        policyHolder: quoteData.policyHolder,
        vehicleOwner: quoteData.vehicleOwner,
        vehicle: quoteData.vehicle,
        history: quoteData.history,
        driving: { drivers: quoteData.drivers, drivingFormula: quoteData.drivingFormula },
        request: quoteData.request,
      };
      await tx.verification.update({
        where: { id: round.id },
        data: {
          decision: "INTEGRATION_REQUESTED",
          reasonCodes: input.reasonCodes,
          message: input.message ?? null,
          integrationScope: { sections: input.sections, documents: input.documents },
          decidedByUserId: auth.userId,
          decidedAt: now,
        },
      });
      await tx.quoteRequest.update({
        where: { id },
        data: { status: "INTEGRATION_REQUESTED", draftEnc: encryptJson(this.cipher, draft) },
      });
      await addRequestEvent(tx, request, {
        type: "INTEGRATION_REQUESTED",
        actorKind: "BACK_OFFICE",
        actorUserId: auth.userId,
        at: now,
        details: {
          reasonCodes: input.reasonCodes,
          sections: input.sections,
          documents: input.documents,
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "VERIFICATION_DECIDED",
        targetType: "QuoteRequest",
        targetId: id,
        after: {
          decision: "INTEGRATION_REQUESTED",
          round: round.round,
          reasonCodes: input.reasonCodes,
        },
        reason: input.message ?? null,
      });
      return this.notifyRequester(tx, request, "request.integration_requested", {
        motivo: labels.join(", ").toLowerCase(),
        messaggio_back_office: input.message ?? "",
      });
    });
    await this.notifications.send(sent);
    this.logger.info({ requestId: id }, "integration requested");
    return { decision: "INTEGRATION_REQUESTED" as const };
  }

  async exclude(auth: AuthContext, id: string, input: { reasonCode: string; message?: string }) {
    const now = this.clock.now();
    const sent = await withContext(this.db, auth.db, async (tx) => {
      const { request, round } = await this.heldRound(tx, auth, id);
      const [label] = await this.reasonLabels(tx, "exclusionCase", [input.reasonCode]);
      await tx.verification.update({
        where: { id: round.id },
        data: {
          decision: "EXCLUDED",
          reasonCodes: [input.reasonCode],
          message: input.message ?? null,
          decidedByUserId: auth.userId,
          decidedAt: now,
        },
      });
      await tx.quoteRequest.update({ where: { id }, data: { status: "EXCLUDED" } });
      await addRequestEvent(tx, request, {
        type: "EXCLUDED",
        actorKind: "BACK_OFFICE",
        actorUserId: auth.userId,
        at: now,
        details: { reasonCode: input.reasonCode },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "VERIFICATION_DECIDED",
        targetType: "QuoteRequest",
        targetId: id,
        after: { decision: "EXCLUDED", round: round.round, reasonCode: input.reasonCode },
        reason: input.message ?? null,
      });
      return this.notifyRequester(tx, request, "request.excluded", {
        motivo: (label ?? input.reasonCode).toLowerCase(),
        messaggio_back_office: input.message ?? "",
      });
    });
    await this.notifications.send(sent);
    return { decision: "EXCLUDED" as const };
  }
}

/**
 * The card is for AstAx staff. Agencies also hold request.viewQuoteData, but
 * only for requests of auctions they are invited to (phase 3): for them the
 * request does not exist here.
 */
function backOfficeOnly(auth: AuthContext): void {
  if (auth.membership?.organizationType !== "ASTAX") throw new ProblemError("NOT_FOUND");
}

/** Dan, 2026-10-28: the supervisor reassigns a request held by a colleague. */
function isSupervisor(auth: AuthContext): boolean {
  return auth.membership?.role === "BO_SUPERVISOR" || auth.membership?.role === "ADMIN";
}

/** The checks stored on the round; a broken value counts as none. */
function checksOf(value: unknown): VerificationChecks {
  const parsed = VerificationChecksSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

/** Dan, 2026-10-28: the problems a request built from the bots' data may keep. */
const BOT_TOLERATED_PROBLEMS = new Set([
  "CU_CLASS_REQUIRED",
  "CURRENT_INSURER_REQUIRED",
  "FAMILY_RC_REQUIRED",
]);

/** The plate and birth date corrected in the checks, in the data. */
function withChecks<T extends { vehicle: unknown; policyHolder: unknown; drivers: unknown }>(
  base: T,
  checks: VerificationChecks,
): T {
  const plate = checks.PLATE?.value;
  const birthDate = checks.BIRTH_DATE?.value;
  const holder = base.policyHolder as Record<string, unknown>;
  const fix = (p: Record<string, unknown>) =>
    birthDate &&
    p.kind === "PERSON" &&
    (p.fiscalCode === holder.fiscalCode || p.fiscalCode === undefined)
      ? { ...p, birthDate }
      : p;
  return {
    ...base,
    vehicle: plate ? { ...(base.vehicle as object), plate } : base.vehicle,
    policyHolder: fix(holder),
    drivers: (base.drivers as { person: Record<string, unknown> }[]).map((d) => ({
      ...d,
      person: fix(d.person),
    })),
  };
}

/** What the request says of the vehicle owner, for the fake reader. */
function ownerOf(quoteData: QuoteData | null): { fiscalCode: string; fullName: string } | null {
  if (!quoteData) return null;
  const owner =
    quoteData.vehicleOwner === "SAME_AS_POLICY_HOLDER"
      ? quoteData.policyHolder
      : quoteData.vehicleOwner;
  return owner.kind === "PERSON"
    ? { fiscalCode: owner.fiscalCode, fullName: `${owner.surname} ${owner.givenName}` }
    : null;
}
