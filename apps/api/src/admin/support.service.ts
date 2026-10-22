import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import { asSystem, settingsAt, withContext, type DbClient, type DbTransaction } from "@astax/db";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB, FIELD_CIPHER } from "../infra/tokens.js";
import { NotificationService } from "../notifications/notification.service.js";
import { customerName } from "../requests/requests.service.js";

const HOUR_MS = 3_600_000;
export type TicketStatus = "OPEN" | "WAITING_CUSTOMER" | "CLOSED";

const codeOf = (number: number) => `T-${String(number).padStart(6, "0")}`;

/**
 * Spec 06 «Assistenza», decision E of phase 7: the internal register of the
 * tickets (email, phone, chat), linked to a customer or a request; assignment,
 * ready replies (the «supportReply» list, edited by the administrator), the
 * due time of the first answer (support.responseHours). A reply goes to the
 * person by email; internal notes stay inside. Identifiers only in the log.
 */
@Injectable()
export class SupportService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  async list(auth: AuthContext, status: TicketStatus | "ALL", mine: boolean) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const tickets = await tx.supportTicket.findMany({
        where: {
          ...(status === "ALL" ? {} : { status }),
          ...(mine ? { assignedToUserId: auth.userId } : {}),
        },
        orderBy: [{ dueAt: "asc" }],
        take: 200,
      });
      const users = await asSystem(tx, () =>
        tx.user.findMany({
          where: {
            id: { in: tickets.flatMap((t) => (t.assignedToUserId ? [t.assignedToUserId] : [])) },
          },
          select: { id: true, firstName: true, lastName: true },
        }),
      );
      return tickets.map((t) => ({
        id: t.id,
        code: codeOf(t.number),
        subject: t.subject,
        channel: t.channel,
        status: t.status,
        dueAt: t.dueAt.toISOString(),
        answered: t.firstAnsweredAt !== null,
        late: t.status === "OPEN" && t.firstAnsweredAt === null && t.dueAt < now,
        assignedTo: (() => {
          const u = users.find((x) => x.id === t.assignedToUserId);
          return u ? `${u.firstName} ${u.lastName}`.trim() : null;
        })(),
      }));
    });
  }

  async open(
    auth: AuthContext,
    input: {
      subject: string;
      channel: "EMAIL" | "PHONE" | "CHAT";
      text: string;
      contactEmail: string | null;
      customerId: string | null;
      requestCode: string | null;
    },
  ) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const request = input.requestCode
        ? await asSystem(tx, () =>
            tx.quoteRequest.findUnique({ where: { code: input.requestCode ?? "" } }),
          )
        : null;
      if (input.requestCode && !request) {
        throw new ProblemError("VALIDATION_FAILED", undefined, [
          { path: "requestCode", issue: "NOT_FOUND" },
        ]);
      }
      if (input.customerId) {
        const customer = await asSystem(tx, () =>
          tx.customer.findUnique({ where: { id: input.customerId ?? "" } }),
        );
        if (!customer) throw new ProblemError("NOT_FOUND");
      }
      const { "support.responseHours": hours } = await settingsAt(
        tx,
        ["support.responseHours"],
        now,
      );
      const ticket = await tx.supportTicket.create({
        data: {
          subject: input.subject,
          channel: input.channel,
          contactEmailEnc: input.contactEmail ? this.cipher.encrypt(input.contactEmail) : null,
          customerId: input.customerId ?? request?.customerId ?? null,
          quoteRequestId: request?.id ?? null,
          assignedToUserId: auth.userId,
          createdByUserId: auth.userId,
          dueAt: new Date(now.getTime() + hours * HOUR_MS),
          createdAt: now,
          updatedAt: now,
          messages: {
            create: {
              kind: "INBOUND",
              text: input.text,
              authorUserId: auth.userId,
              createdAt: now,
            },
          },
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "TICKET_OPENED",
        targetType: "SupportTicket",
        targetId: ticket.id,
        after: {
          channel: input.channel,
          customerId: ticket.customerId,
          quoteRequestId: ticket.quoteRequestId,
        },
      });
      return { id: ticket.id, code: codeOf(ticket.number), dueAt: ticket.dueAt.toISOString() };
    });
  }

  private async ticket(tx: DbTransaction, id: string) {
    const t = await tx.supportTicket.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!t) throw new ProblemError("NOT_FOUND");
    return t;
  }

  async detail(auth: AuthContext, id: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const t = await this.ticket(tx, id);
      const extra = await asSystem(tx, async () => ({
        customer: t.customerId
          ? await tx.customer.findUnique({ where: { id: t.customerId }, include: { person: true } })
          : null,
        request: t.quoteRequestId
          ? await tx.quoteRequest.findUnique({
              where: { id: t.quoteRequestId },
              select: { code: true },
            })
          : null,
        authors: await tx.user.findMany({
          where: { id: { in: [...new Set(t.messages.map((m) => m.authorUserId))] } },
          select: { id: true, firstName: true, lastName: true },
        }),
      }));
      const replies = await tx.listValue.findMany({
        where: { listKey: "supportReply", active: true },
        orderBy: { sortOrder: "asc" },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "TICKET_VIEWED",
        targetType: "SupportTicket",
        targetId: id,
      });
      return {
        id: t.id,
        code: codeOf(t.number),
        subject: t.subject,
        channel: t.channel,
        status: t.status,
        contactEmail: t.contactEmailEnc ? this.cipher.decrypt(t.contactEmailEnc) : null,
        customer: extra.customer
          ? { id: extra.customer.id, name: customerName(extra.customer.person) }
          : null,
        requestCode: extra.request?.code ?? null,
        assignedToMe: t.assignedToUserId === auth.userId,
        dueAt: t.dueAt.toISOString(),
        firstAnsweredAt: t.firstAnsweredAt?.toISOString() ?? null,
        messages: t.messages.map((m) => {
          const a = extra.authors.find((u) => u.id === m.authorUserId);
          return {
            kind: m.kind,
            text: m.text,
            at: m.createdAt.toISOString(),
            author: a ? `${a.firstName} ${a.lastName}`.trim() : null,
          };
        }),
        readyReplies: replies.map((r) => ({
          code: r.code,
          text: r.labelIt,
        })),
      };
    });
  }

  /** A reply (by email to the person) or an internal note. */
  async addMessage(auth: AuthContext, id: string, kind: "REPLY" | "NOTE", text: string) {
    const now = this.clock.now();
    const sent = await withContext(this.db, auth.db, async (tx) => {
      const t = await this.ticket(tx, id);
      if (t.status === "CLOSED") {
        throw new ProblemError("CONFLICT", "Closed", [{ path: "ticket", issue: "WRONG_STATE" }]);
      }
      if (kind === "REPLY" && !t.contactEmailEnc) {
        throw new ProblemError("VALIDATION_FAILED", "No email to reply to", [
          { path: "contactEmail", issue: "NO_CONTACTS" },
        ]);
      }
      await tx.supportTicketMessage.create({
        data: { ticketId: id, kind, text, authorUserId: auth.userId, createdAt: now },
      });
      if (kind === "REPLY") {
        await tx.supportTicket.update({
          where: { id },
          data: {
            firstAnsweredAt: t.firstAnsweredAt ?? now,
            status: "WAITING_CUSTOMER",
            updatedAt: now,
          },
        });
      }
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: kind === "REPLY" ? "TICKET_REPLIED" : "TICKET_NOTE_ADDED",
        targetType: "SupportTicket",
        targetId: id,
        after: { late: kind === "REPLY" && !t.firstAnsweredAt && now > t.dueAt },
      });
      return kind === "REPLY"
        ? {
            to: this.cipher.decrypt(t.contactEmailEnc ?? ""),
            code: codeOf(t.number),
          }
        : null;
    });
    if (sent) {
      await this.notifications.sendEmail(
        sent.to,
        "support.reply",
        { codice: sent.code, testo: text },
        { ticketId: id },
      );
    }
    return { id, sent: sent !== null };
  }

  async setStatus(auth: AuthContext, id: string, status: TicketStatus) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const t = await this.ticket(tx, id);
      await tx.supportTicket.update({
        where: { id },
        data: { status, closedAt: status === "CLOSED" ? now : null, updatedAt: now },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "TICKET_STATUS_SET",
        targetType: "SupportTicket",
        targetId: id,
        before: { status: t.status },
        after: { status },
      });
      return { id, status };
    });
  }

  async assignToMe(auth: AuthContext, id: string) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const t = await this.ticket(tx, id);
      await tx.supportTicket.update({
        where: { id },
        data: { assignedToUserId: auth.userId, updatedAt: now },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "TICKET_ASSIGNED",
        targetType: "SupportTicket",
        targetId: id,
        before: { assignedToUserId: t.assignedToUserId },
        after: { assignedToUserId: auth.userId },
      });
      return { id };
    });
  }

  /** The tickets of a customer, for the card (spec 06 «Clienti»). */
  async ofCustomer(tx: DbTransaction, customerId: string) {
    return (
      await tx.supportTicket.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } })
    ).map((t) => ({ id: t.id, code: codeOf(t.number), subject: t.subject, status: t.status }));
  }
}
