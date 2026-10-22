import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import {
  asSystem,
  registerComplaint,
  withContext,
  type DbClient,
  type DbTransaction,
  type NewComplaint,
} from "@astax/db";
import { romeInstant } from "@astax/shared/domain";
import { Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "../config/config.js";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { csvFile, romePeriod } from "../http/csv.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, CONFIG, DB, FIELD_CIPHER } from "../infra/tokens.js";
import { NotificationService, type Outbound } from "../notifications/notification.service.js";

const DAY_MS = 86_400_000;
export type ComplaintOutcome = "ACCEPTED" | "PARTIALLY_ACCEPTED" | "REJECTED";

const romeDay = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(d);

/**
 * Spec 06 «Reclami»: the register with the protocol and the answer due
 * within complaints.responseDays; the private files a complaint from the own
 * area (spec 03), the back office registers those arriving by email, PEC or
 * post (complaint.register) and the supervisor answers (complaint.manage); the
 * export for IVASS is itself logged. The reminder is sent by the worker.
 */
@Injectable()
export class ComplaintsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  private async supervisors(tx: DbTransaction) {
    const users = await asSystem(tx, () =>
      tx.user.findMany({
        where: {
          status: "ACTIVE",
          memberships: {
            some: { status: "ACTIVE", role: "BO_SUPERVISOR", organization: { type: "ASTAX" } },
          },
        },
      }),
    );
    return users.map((u) => ({
      userId: u.id,
      email: u.emailEnc ? this.cipher.decrypt(u.emailEnc) : null,
      phone: null,
    }));
  }

  /** Registration, receipt to the complainant and notice to the supervisors, in one go. */
  private async register(auth: AuthContext, tx: DbTransaction, input: NewComplaint) {
    const now = this.clock.now();
    const complaint = await asSystem(tx, () => registerComplaint(tx, input, now));
    await this.audit.inTransaction(tx, actorOf(auth), {
      action: "COMPLAINT_REGISTERED",
      targetType: "Complaint",
      targetId: complaint.id,
      after: {
        protocol: complaint.protocol,
        channel: input.channel,
        dueAt: complaint.dueAt.toISOString(),
      },
    });
    const ids = { complaintId: complaint.id };
    const outbound: Outbound[] = [];
    const email = input.complainantEmailEnc ? this.cipher.decrypt(input.complainantEmailEnc) : null;
    const receipt = {
      nome: input.complainantName,
      protocollo: complaint.protocol,
      scadenza: { date: complaint.dueAt.toISOString() },
    };
    if (input.complainantUserId) {
      outbound.push(
        ...(await this.notifications.deliver(
          tx,
          [
            {
              userId: input.complainantUserId,
              email,
              phone: null,
            },
          ],
          "complaint.received",
          () => receipt,
          "/reclami",
          ids,
        )),
      );
    }
    outbound.push(
      ...(await this.notifications.deliver(
        tx,
        await this.supervisors(tx),
        "complaint.new.bo",
        () => ({
          protocollo: complaint.protocol,
          data: { date: complaint.receivedAt.toISOString() },
          scadenza: { date: complaint.dueAt.toISOString() },
          link: `${this.config.ADMIN_URL}/reclami/${complaint.id}`,
        }),
        `/reclami/${complaint.id}`,
        ids,
      )),
    );
    return {
      complaint,
      outbound,
      // Without an account the receipt goes by email only.
      emailOnly: !input.complainantUserId && email ? { to: email } : null,
    };
  }

  private async afterCommit(result: Awaited<ReturnType<ComplaintsService["register"]>>) {
    await this.notifications.send(result.outbound);
    if (result.emailOnly) {
      await this.notifications.sendEmail(
        result.emailOnly.to,
        "complaint.received",
        {
          nome: result.complaint.complainantName,
          protocollo: result.complaint.protocol,
          scadenza: { date: result.complaint.dueAt.toISOString() },
        },
        { complaintId: result.complaint.id },
      );
    }
    return {
      id: result.complaint.id,
      protocol: result.complaint.protocol,
      dueAt: result.complaint.dueAt.toISOString(),
    };
  }

  private async requestOf(tx: DbTransaction, code: string | null) {
    if (!code) return null;
    const request = await asSystem(tx, () => tx.quoteRequest.findUnique({ where: { code } }));
    if (!request) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "requestCode", issue: "NOT_FOUND" },
      ]);
    }
    return request;
  }

  /** The private's formal complaint from the own area (spec 03 «Assistenza e reclami»). */
  async fileOwn(
    auth: AuthContext,
    input: { subject: string; description: string; requestCode: string | null },
  ) {
    const result = await withContext(this.db, auth.db, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: auth.userId } });
      const request = await this.requestOf(tx, input.requestCode);
      if (request && request.requesterUserId !== auth.userId) {
        throw new ProblemError("VALIDATION_FAILED", undefined, [
          { path: "requestCode", issue: "NOT_FOUND" },
        ]);
      }
      const policy = request
        ? await asSystem(tx, () => tx.policy.findUnique({ where: { quoteRequestId: request.id } }))
        : null;
      return this.register(auth, tx, {
        receivedAt: this.clock.now(),
        channel: "APP",
        complainantUserId: auth.userId,
        complainantName: `${user.firstName} ${user.lastName}`.trim(),
        complainantEmailEnc: user.emailEnc,
        customerId: request?.customerId ?? null,
        quoteRequestId: request?.id ?? null,
        organizationId: policy?.organizationId ?? null,
        subject: input.subject,
        description: input.description,
        createdByUserId: auth.userId,
      });
    });
    return this.afterCommit(result);
  }

  async own(auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) =>
      (
        await tx.complaint.findMany({
          where: { complainantUserId: auth.userId },
          orderBy: { receivedAt: "desc" },
        })
      ).map((c) => ({
        id: c.id,
        protocol: c.protocol,
        subject: c.subject,
        receivedAt: c.receivedAt.toISOString(),
        dueAt: c.dueAt.toISOString(),
        status: c.status,
        responseText: c.responseText,
        outcome: c.outcome,
        answeredAt: c.answeredAt?.toISOString() ?? null,
      })),
    );
  }

  /** A complaint received by email, PEC, post or phone, registered by the back office. */
  async registerReceived(
    auth: AuthContext,
    input: {
      channel: "EMAIL" | "PEC" | "POST" | "PHONE";
      receivedOn: string;
      complainantName: string;
      complainantEmail: string | null;
      subject: string;
      description: string;
      requestCode: string | null;
      organizationId: string | null;
    },
  ) {
    const now = this.clock.now();
    // The day of receipt in Rome (rule 6); the hour is not known, midday stands for it.
    const receivedAt = romeInstant(input.receivedOn, "12:00");
    if (receivedAt.getTime() > now.getTime() + DAY_MS) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "receivedOn", issue: "IN_THE_FUTURE" },
      ]);
    }
    const result = await withContext(this.db, auth.db, async (tx) => {
      const request = await this.requestOf(tx, input.requestCode);
      if (input.organizationId) {
        const org = await asSystem(tx, () =>
          tx.organization.findUnique({ where: { id: input.organizationId ?? "" } }),
        );
        if (!org)
          throw new ProblemError("VALIDATION_FAILED", undefined, [
            { path: "organizationId", issue: "NOT_FOUND" },
          ]);
      }
      return this.register(auth, tx, {
        receivedAt,
        channel: input.channel,
        complainantUserId: null,
        complainantName: input.complainantName,
        complainantEmailEnc: input.complainantEmail
          ? this.cipher.encrypt(input.complainantEmail)
          : null,
        customerId: request?.customerId ?? null,
        quoteRequestId: request?.id ?? null,
        organizationId: input.organizationId,
        subject: input.subject,
        description: input.description,
        createdByUserId: auth.userId,
      });
    });
    return this.afterCommit(result);
  }

  async list(auth: AuthContext, status: "OPEN" | "ANSWERED" | "ALL") {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const rows = await tx.complaint.findMany({
        where: status === "ALL" ? {} : { status },
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        take: 300,
      });
      const orgs = await asSystem(tx, () =>
        tx.organization.findMany({
          where: { id: { in: rows.flatMap((r) => (r.organizationId ? [r.organizationId] : [])) } },
        }),
      );
      return rows.map((c) => ({
        id: c.id,
        protocol: c.protocol,
        subject: c.subject,
        channel: c.channel,
        status: c.status,
        receivedAt: c.receivedAt.toISOString(),
        dueAt: c.dueAt.toISOString(),
        late: c.status === "OPEN" && c.dueAt < now,
        intermediary: orgs.find((o) => o.id === c.organizationId)?.legalName ?? null,
      }));
    });
  }

  async detail(auth: AuthContext, id: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const c = await tx.complaint.findUnique({ where: { id } });
      if (!c) throw new ProblemError("NOT_FOUND");
      const extra = await asSystem(tx, async () => ({
        org: c.organizationId
          ? await tx.organization.findUnique({ where: { id: c.organizationId } })
          : null,
        request: c.quoteRequestId
          ? await tx.quoteRequest.findUnique({
              where: { id: c.quoteRequestId },
              select: { code: true },
            })
          : null,
      }));
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "COMPLAINT_VIEWED",
        targetType: "Complaint",
        targetId: id,
      });
      return {
        id: c.id,
        protocol: c.protocol,
        channel: c.channel,
        status: c.status,
        receivedAt: c.receivedAt.toISOString(),
        dueAt: c.dueAt.toISOString(),
        complainantName: c.complainantName,
        complainantEmail: c.complainantEmailEnc ? this.cipher.decrypt(c.complainantEmailEnc) : null,
        fromApp: c.complainantUserId !== null,
        customerId: c.customerId,
        requestCode: extra.request?.code ?? null,
        intermediary: extra.org?.legalName ?? null,
        subject: c.subject,
        description: c.description,
        responseText: c.responseText,
        outcome: c.outcome,
        answeredAt: c.answeredAt?.toISOString() ?? null,
      };
    });
  }

  /** The answer, with its outcome; the complainant is told (in the app or by email). */
  async answer(auth: AuthContext, id: string, responseText: string, outcome: ComplaintOutcome) {
    const now = this.clock.now();
    const done = await withContext(this.db, auth.db, async (tx) => {
      const c = await tx.complaint.findUnique({ where: { id } });
      if (!c) throw new ProblemError("NOT_FOUND");
      if (c.status !== "OPEN") {
        throw new ProblemError("CONFLICT", "Already answered", [
          { path: "complaint", issue: "WRONG_STATE" },
        ]);
      }
      await tx.complaint.update({
        where: { id },
        data: {
          status: "ANSWERED",
          responseText,
          outcome,
          answeredAt: now,
          answeredByUserId: auth.userId,
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "COMPLAINT_ANSWERED",
        targetType: "Complaint",
        targetId: id,
        before: { status: "OPEN" },
        after: { status: "ANSWERED", outcome, late: now > c.dueAt },
      });
      const email = c.complainantEmailEnc ? this.cipher.decrypt(c.complainantEmailEnc) : null;
      const vars = {
        nome: c.complainantName,
        protocollo: c.protocol,
        link: `${this.config.WEB_URL}/reclami`,
      };
      const outbound = c.complainantUserId
        ? await this.notifications.deliver(
            tx,
            [
              {
                userId: c.complainantUserId,
                email,
                phone: null,
              },
            ],
            "complaint.answered",
            () => vars,
            "/reclami",
            { complaintId: id },
          )
        : [];
      return {
        outbound,
        email: c.complainantUserId ? null : email,
        vars,
      };
    });
    await this.notifications.send(done.outbound);
    if (done.email) {
      // Without an account the answer itself goes by email (the link would lead nowhere).
      await this.notifications.sendEmail(
        done.email,
        "support.reply",
        { codice: done.vars.protocollo, testo: responseText },
        { complaintId: id },
      );
    }
    return { id, status: "ANSWERED" as const };
  }

  /** For the IVASS reports (decision F: a simple CSV, to confirm with the lawyer); logged. */
  async exportCsv(auth: AuthContext, from: string, to: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const rows = await tx.complaint.findMany({
        where: {
          receivedAt: romePeriod(from, to),
        },
        orderBy: { number: "asc" },
      });
      const orgs = await asSystem(tx, () =>
        tx.organization.findMany({
          where: { id: { in: rows.flatMap((r) => (r.organizationId ? [r.organizationId] : [])) } },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "COMPLAINTS_EXPORTED",
        targetType: "Complaint",
        targetId: null,
        after: { from, to, rows: rows.length },
      });
      const header = [
        "protocollo",
        "data_ricezione",
        "canale",
        "oggetto",
        "intermediario",
        "rui_intermediario",
        "stato",
        "esito",
        "data_risposta",
        "giorni_per_rispondere",
      ];
      const lines = rows.map((c) => {
        const org = orgs.find((o) => o.id === c.organizationId);
        return [
          c.protocol,
          romeDay(c.receivedAt),
          c.channel,
          c.subject,
          org?.legalName ?? "AstAx",
          org?.ruiNumber ?? "",
          c.status,
          c.outcome ?? "",
          c.answeredAt ? romeDay(c.answeredAt) : "",
          c.answeredAt
            ? String(Math.ceil((c.answeredAt.getTime() - c.receivedAt.getTime()) / DAY_MS))
            : "",
        ];
      });
      return {
        body: csvFile(header, lines),
        mime: "text/csv; charset=utf-8",
        fileName: `reclami-${from}-${to}.csv`,
      };
    });
  }
}
