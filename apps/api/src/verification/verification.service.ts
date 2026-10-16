import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
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
  QuoteDataSchema,
  submissionProblems,
  worstOutcome,
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
import { CLOCK, CONFIG, DB, FIELD_CIPHER, LOGGER, OBJECT_STORAGE } from "../infra/tokens.js";
import { NotificationService } from "../notifications/notification.service.js";
import { AutoCheckService } from "../requests/auto-check.service.js";
import { listCodeProblems } from "../requests/list-codes.js";
import { ReferenceService } from "../requests/reference.service.js";
import {
  addRequestEvent,
  decryptJson,
  encryptJson,
  extractionOf,
  settingsAt,
  sha256Of,
} from "../requests/request-support.js";
import { customerName } from "../requests/requests.service.js";
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
        assignedTo: r.assignedToUserId
          ? { id: r.assignedToUserId, name: nameOf.get(r.assignedToUserId) ?? "" }
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
        customer: customer ? customerName(customer.person) : null,
        reasons: {
          integration: lists
            .filter((l) => l.listKey === "integrationRequestReason")
            .map((l) => ({ code: l.code, it: l.labelIt, sq: l.labelSq })),
          exclusion: lists
            .filter((l) => l.listKey === "exclusionCase")
            .map((l) => ({ code: l.code, it: l.labelIt, sq: l.labelSq })),
        },
        quoteData,
        quoteDataVersion: request.quoteDataVersion,
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

  async assign(auth: AuthContext, id: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const { round } = await this.openRound(tx, id);
      await tx.verification.update({
        where: { id: round.id },
        data: { assignedToUserId: auth.userId },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "VERIFICATION_ASSIGNED",
        targetType: "QuoteRequest",
        targetId: id,
        before: { assignedToUserId: round.assignedToUserId },
        after: { assignedToUserId: auth.userId },
      });
      return { assignedToUserId: auth.userId };
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
      const { round } = await this.openRound(tx, id);
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
  async correct(auth: AuthContext, id: string, input: { quoteData: unknown; reason: string }) {
    const parsed = QuoteDataSchema.safeParse(input.quoteData);
    if (!parsed.success) throw ProblemError.fromZod(parsed.error);
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const { request, round } = await this.openRound(tx, id);
      const before = await this.quoteDataOf(tx, request);
      const after = parsed.data;
      const changed = changedPaths(before, after);
      if (changed.length === 0) throw new ProblemError("VALIDATION_FAILED", "Nothing changed");
      await this.checkLikeSubmission(tx, after, now);
      const version = (request.quoteDataVersion ?? 0) + 1;
      await tx.quoteDataVersion.create({
        data: {
          quoteRequestId: id,
          ownerUserId: request.ownerUserId,
          ownerOrganizationId: request.ownerOrganizationId,
          version,
          dataEnc: encryptJson(this.cipher, after),
          dataSha256: sha256Of(after),
          source: "BACK_OFFICE_CORRECTION",
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
      // The consent item does not depend on the data: it is kept as it was.
      const consent = previous.find((p) => p.code === "CONSENT");
      if (consent) checklist.push(consent);
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
          minValidityDays: derived.minValidityDays,
          auctionDurationHours: after.request.auctionDurationHours,
          autoOutcome: outcome,
        },
      });
      await addRequestEvent(tx, request, {
        type: "CORRECTED",
        actorKind: "BACK_OFFICE",
        actorUserId: auth.userId,
        at: now,
        details: { quoteDataVersion: version, changedFields: changed },
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
  private async checkLikeSubmission(tx: DbTransaction, data: QuoteData, now: Date) {
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
      ),
    });
    errors.push(...problems.map((p) => ({ path: "quoteData", issue: p })));
    if (errors.length > 0) throw new ProblemError("VALIDATION_FAILED", undefined, errors);
  }

  async approve(auth: AuthContext, id: string, note: string | undefined) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const { request, round } = await this.openRound(tx, id);
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
    await this.notifications.inApp(
      tx,
      [{ userId: user.id, locale: user.locale }],
      eventKey,
      () => all,
      link,
      {
        requestId: request.id,
      },
    );
    return { email: user.emailEnc ? this.cipher.decrypt(user.emailEnc) : null, variables: all };
  }

  async requestIntegration(auth: AuthContext, id: string, input: IntegrationInput) {
    const now = this.clock.now();
    const sent = await withContext(this.db, auth.db, async (tx) => {
      const { request, round } = await this.openRound(tx, id);
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
    if (sent.email) {
      await this.notifications.sendEmail(
        sent.email,
        "request.integration_requested",
        sent.variables,
        { requestId: id },
      );
    }
    this.logger.info({ requestId: id }, "integration requested");
    return { decision: "INTEGRATION_REQUESTED" as const };
  }

  async exclude(auth: AuthContext, id: string, input: { reasonCode: string; message?: string }) {
    const now = this.clock.now();
    const sent = await withContext(this.db, auth.db, async (tx) => {
      const { request, round } = await this.openRound(tx, id);
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
    if (sent.email)
      await this.notifications.sendEmail(sent.email, "request.excluded", sent.variables, {
        requestId: id,
      });
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
