import { createHash } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import {
  asSystem,
  settingsAt,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
  type DbTransaction,
} from "@astax/db";
import { addCalendarDays } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { ApiConfig } from "../config/config.js";
import { CLOCK, CONFIG, DB, FIELD_CIPHER } from "../infra/tokens.js";
import labels from "../notifications/labels.it.json" with { type: "json" };
import { NotificationService } from "../notifications/notification.service.js";
import { Postbox, staffUsers } from "../notifications/postbox.js";

/** The customer answering from the link has no account (as a customer link). */
const SYSTEM_ACTOR = {
  userId: null,
  membershipId: null,
  organizationId: null,
  ip: null,
  userAgent: null,
};

export interface SurveyAnswers {
  /** 1-5: how it went overall, the clarity of the offers, the agency's service. */
  overall: number;
  clarity: number;
  agency: number;
  /** SIC: someone proposed an insurance outside AstAx (a possible circumvention). */
  contactedByOthers: boolean;
}

/**
 * The questionnaire after the sale (process 4, PolicyWorkflow): three scores
 * and whether someone contacted the customer to sell an insurance outside
 * AstAx. A «sì» opens a circumvention flag for the back office (spec 06
 * «Segnalazioni»), with the request and the agency; scores and choices only,
 * no free text (rule 8). The link's token is kept only as a hash.
 */
@Injectable()
export class SurveysService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  private hash(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  /** The questionnaire of a link still valid (`survey.linkValidDays` from the sending). */
  private async valid(tx: DbTransaction, token: string, lock: boolean) {
    const tokenHash = this.hash(token);
    if (lock) {
      await tx.$queryRaw`SELECT 1 FROM "PostSaleSurvey" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
    }
    const survey = await tx.postSaleSurvey.findUnique({ where: { tokenHash } });
    if (!survey) throw new ProblemError("NOT_FOUND");
    const now = this.clock.now();
    const { "survey.linkValidDays": days } = await settingsAt(tx, ["survey.linkValidDays"], now);
    // Rule 6: whole calendar days in Rome from the day of the sending.
    if (romeCalendarDate(now) > addCalendarDays(romeCalendarDate(survey.sentAt), days)) {
      throw new ProblemError("NOT_FOUND");
    }
    return survey;
  }

  async view(token: string) {
    const survey = await withContext(this.db, SYSTEM_CONTEXT, (tx) => this.valid(tx, token, false));
    return { answered: survey.answeredAt !== null };
  }

  async answer(token: string, answers: SurveyAnswers) {
    const now = this.clock.now();
    const postbox = new Postbox(this.notifications, this.cipher, this.config.WEB_URL);
    const out = await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      // Locked: two answers sent at once make one, and one flag.
      const survey = await this.valid(tx, token, true);
      if (survey.answeredAt) {
        throw new ProblemError("CONFLICT", "Already answered", [
          { path: "survey", issue: "ALREADY_ANSWERED" },
        ]);
      }
      await tx.postSaleSurvey.update({
        where: { id: survey.id },
        data: {
          answeredAt: now,
          answers: { overall: answers.overall, clarity: answers.clarity, agency: answers.agency },
          contactedByOthers: answers.contactedByOthers,
          updatedAt: now,
        },
      });
      if (answers.contactedByOthers) {
        const policy = await tx.policy.findUniqueOrThrow({ where: { id: survey.policyId } });
        await tx.flag.create({
          data: {
            type: "CIRCUMVENTION",
            source: "SURVEY",
            quoteRequestId: policy.quoteRequestId,
            organizationId: policy.organizationId,
            createdAt: now,
            updatedAt: now,
          },
        });
        const request = await tx.quoteRequest.findUniqueOrThrow({
          where: { id: policy.quoteRequestId },
        });
        const link = `${this.config.ADMIN_URL}/segnalazioni`;
        await postbox.tell(
          tx,
          await staffUsers(tx, ["BO_SUPERVISOR"]),
          "flag.new.bo",
          {
            tipo_segnalazione: labels.flagType.CIRCUMVENTION,
            codice: request.code,
            fonte: labels.flagSource.SURVEY,
            link,
          },
          link,
          { quoteRequestId: request.id },
        );
      }
      await this.audit.inTransaction(tx, SYSTEM_ACTOR, {
        action: "SURVEY_ANSWERED",
        targetType: "PostSaleSurvey",
        targetId: survey.id,
        after: { contactedByOthers: answers.contactedByOthers },
      });
      return { answered: true };
    });
    await postbox.flush();
    return out;
  }

  /** Spec 06 «Segnalazioni»: the open flags, with the request and the agency. */
  async flags(auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) =>
      asSystem(tx, async () => {
        const flags = await tx.flag.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
        const [requests, orgs] = await Promise.all([
          tx.quoteRequest.findMany({
            where: {
              id: { in: flags.flatMap((f) => (f.quoteRequestId ? [f.quoteRequestId] : [])) },
            },
            select: { id: true, code: true },
          }),
          tx.organization.findMany({
            where: {
              id: { in: flags.flatMap((f) => (f.organizationId ? [f.organizationId] : [])) },
            },
            select: { id: true, legalName: true },
          }),
        ]);
        return flags.map((f) => ({
          id: f.id,
          type: f.type,
          source: f.source,
          code: requests.find((q) => q.id === f.quoteRequestId)?.code ?? null,
          agency: orgs.find((o) => o.id === f.organizationId)?.legalName ?? null,
          status: f.status,
          outcome: f.outcome,
          createdAt: f.createdAt.toISOString(),
        }));
      }),
    );
  }

  /** The supervisor's outcome: archived, penalty proposed, suspension proposed. */
  async decide(
    auth: AuthContext,
    id: string,
    status: "ARCHIVED" | "PENALTY_PROPOSED" | "SUSPENSION_PROPOSED",
    outcome: string,
  ) {
    return withContext(this.db, auth.db, async (tx) => {
      const flag = await asSystem(tx, () => tx.flag.findUnique({ where: { id } }));
      if (!flag) throw new ProblemError("NOT_FOUND");
      if (flag.status !== "OPEN") throw new ProblemError("CONFLICT");
      await asSystem(tx, () =>
        tx.flag.update({
          where: { id },
          data: { status, outcome, updatedAt: this.clock.now() },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "FLAG_DECIDED",
        targetType: "Flag",
        targetId: id,
        after: { status },
        reason: outcome,
      });
      return { id, status };
    });
  }
}
