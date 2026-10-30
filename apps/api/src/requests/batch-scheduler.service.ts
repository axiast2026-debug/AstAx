import { randomUUID } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import { SYSTEM_CONTEXT, withContext, withLease, type DbClient } from "@astax/db";
import { formatDate } from "@astax/shared/format";
import { errorForLog, type Logger } from "@astax/shared/logging";
import type { Actor } from "@astax/shared/permissions";
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import type { ApiConfig } from "../config/config.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, CONFIG, DB, FIELD_CIPHER, LOGGER } from "../infra/tokens.js";
import { NotificationService } from "../notifications/notification.service.js";
import { RequestsService } from "./requests.service.js";

const DAY_MS = 86_400_000;
const BATCH_SIZE = 50;

/**
 * ADR 0014 (Dan, 2026-10-21, answers 4 and 6): the drafts of the broker's
 * lots, every BATCH_SCHEDULE_INTERVAL_MS under a lease of the database.
 * - On the documents' day the broker is asked, once, for the registration
 *   certificate and the licence of the drafts still without them.
 * - On the scheduled day the draft leaves for the back office by itself, as
 *   if the broker pressed «Invia»: same use case, same checks and log. A draft
 *   that cannot leave (for instance the firm never signed the declaration on
 *   its customers' consent) is tried again the next day.
 */
@Injectable()
export class BatchSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  #timer: NodeJS.Timeout | null = null;
  readonly #holder = randomUUID();

  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(RequestsService) private readonly requests: RequestsService,
  ) {}

  onApplicationBootstrap(): void {
    const every = this.config.BATCH_SCHEDULE_INTERVAL_MS;
    if (every === 0) return;
    let running = false;
    this.#timer = setInterval(() => {
      if (running) return;
      running = true;
      this.run()
        .catch((error: unknown) =>
          this.logger.error({ err: errorForLog(error) }, "batch schedule round failed"),
        )
        .finally(() => {
          running = false;
        });
    }, every);
  }

  onApplicationShutdown(): void {
    if (this.#timer) clearInterval(this.#timer);
  }

  /** One round: the reminders first, then the submissions. */
  async run(): Promise<{ reminded: number; submitted: number; postponed: number } | null> {
    const now = this.clock.now();
    return withLease(this.db, "api.batches", this.#holder, now, 10 * 60_000, async () => {
      const reminded = await this.remindDocuments(now);
      const { submitted, postponed } = await this.submitDue(now);
      return { reminded, submitted, postponed };
    });
  }

  private async remindDocuments(now: Date): Promise<number> {
    const due = await withContext(this.db, SYSTEM_CONTEXT, (tx) =>
      tx.quoteRequest.findMany({
        where: {
          batchId: { not: null },
          status: "DRAFT",
          documentsDueAt: { lte: now },
          documentsNotifiedAt: null,
        },
        include: { customer: { include: { person: true } } },
        take: BATCH_SIZE,
      }),
    );
    let reminded = 0;
    for (const request of due) {
      const outbound = await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
        await tx.quoteRequest.update({
          where: { id: request.id },
          data: { documentsNotifiedAt: now },
        });
        const registration = await tx.document.count({
          where: { quoteRequestId: request.id, kind: "REGISTRATION_CERTIFICATE", deletedAt: null },
        });
        if (registration > 0) return [];
        const user = await tx.user.findUnique({ where: { id: request.requesterUserId } });
        if (!user || user.status !== "ACTIVE") return [];
        const person = request.customer?.person;
        return this.notifications.deliver(
          tx,
          [
            {
              userId: user.id,
              email: user.emailEnc ? this.cipher.decrypt(user.emailEnc) : null,
              phone: null,
            },
          ],
          "batch.documents_due",
          () => ({
            cliente: person
              ? (person.companyName ?? `${person.givenName ?? ""} ${person.surname ?? ""}`.trim())
              : "",
            veicolo: request.plate ?? "",
            data_asta: request.scheduledSubmitAt ? formatDate(request.scheduledSubmitAt) : "",
            link: `${this.config.WEB_URL}/richieste/${request.id}/dati`,
          }),
          `/richieste/${request.id}/dati`,
          { requestId: request.id },
        );
      });
      await this.notifications.send(outbound);
      if (outbound.length > 0) reminded += 1;
    }
    return reminded;
  }

  private async submitDue(now: Date): Promise<{ submitted: number; postponed: number }> {
    const due = await withContext(this.db, SYSTEM_CONTEXT, (tx) =>
      tx.quoteRequest.findMany({
        where: { batchId: { not: null }, status: "DRAFT", scheduledSubmitAt: { lte: now } },
        orderBy: { scheduledSubmitAt: "asc" },
        take: BATCH_SIZE,
      }),
    );
    let submitted = 0;
    let postponed = 0;
    for (const request of due) {
      const auth = await this.requesterOf(request.requesterUserId, request.requesterMembershipId);
      try {
        if (!auth) throw new ProblemError("FORBIDDEN", "The requester is no longer active");
        await this.requests.submit(auth, request.id);
        submitted += 1;
        await withContext(this.db, SYSTEM_CONTEXT, (tx) =>
          this.audit.inTransaction(tx, this.systemActor(), {
            action: "BATCH_REQUEST_SCHEDULED_SUBMIT",
            targetType: "QuoteRequest",
            targetId: request.id,
            after: { outcome: "SUBMITTED" },
          }),
        );
      } catch (error) {
        if (!(error instanceof ProblemError)) throw error;
        postponed += 1;
        // Tried again tomorrow; the broker sees the draft and its day in the work table.
        await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
          await tx.quoteRequest.update({
            where: { id: request.id },
            data: { scheduledSubmitAt: new Date(now.getTime() + DAY_MS) },
          });
          await this.audit.inTransaction(tx, this.systemActor(), {
            action: "BATCH_REQUEST_SCHEDULED_SUBMIT",
            targetType: "QuoteRequest",
            targetId: request.id,
            after: {
              outcome: "POSTPONED",
              issues: (error.errors ?? []).map((e) => e.issue).slice(0, 10),
            },
          });
        });
      }
    }
    return { submitted, postponed };
  }

  private systemActor() {
    return { userId: null, membershipId: null, organizationId: null, ip: null, userAgent: null };
  }

  /** The broker who uploaded the lot, in its context, as in its own requests. */
  private async requesterOf(
    userId: string,
    membershipId: string | null,
  ): Promise<AuthContext | null> {
    if (!membershipId) return null;
    const membership = await withContext(this.db, SYSTEM_CONTEXT, (tx) =>
      tx.membership.findFirst({
        where: {
          id: membershipId,
          userId,
          status: "ACTIVE",
          user: { status: "ACTIVE" },
          organization: { status: "ACTIVE", type: { in: ["BROKER", "AGENCY"] } },
        },
        include: { user: true, organization: { select: { type: true, ruiSection: true } } },
      }),
    );
    if (!membership) return null;
    const flags = {
      canIssue: membership.canIssue,
      canSeeColleagueOffers: membership.canSeeColleagueOffers,
      canSeeAccounting: membership.canSeeAccounting,
      seesAllClients: membership.seesAllClients,
    };
    const actor: Actor = {
      kind: "MEMBER",
      role: membership.role,
      organizationType: membership.organization.type,
      flags,
      sectionE: membership.organization.ruiSection === "E",
    };
    return {
      userId,
      keycloakId: membership.user.keycloakId ?? "",
      kind: "PROFESSIONAL",
      membership: {
        id: membership.id,
        organizationId: membership.organizationId,
        organizationType: membership.organization.type,
        role: membership.role,
        flags,
        sectionE: membership.organization.ruiSection === "E",
      },
      actor,
      db: {
        kind: "USER",
        userId,
        organizationId: membership.organizationId,
        isStaff: false,
        role: membership.role,
      },
      ip: null,
      userAgent: "astax-batch-scheduler",
    };
  }
}
