import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import { asSystem, settingsAt, withContext, type DbClient, type DbTransaction } from "@astax/db";
import { normalizeFiscalCodeInput } from "@astax/shared/domain";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB, FIELD_CIPHER } from "../infra/tokens.js";
import { customerName } from "../requests/requests.service.js";

const DAY_MS = 86_400_000;

/** The actions that open a customer's data: they make the access log of the card. */
const ACCESS_ACTIONS = [
  "CUSTOMER_VIEWED",
  "CUSTOMER_DATA_EXPORTED",
  "QUOTE_DATA_VIEWED",
  "DOCUMENT_VIEWED",
  "CUSTOMER_CONTACTS_VIEWED",
  "CUSTOMER_LINK_OPENED",
];

export type DataSubjectKind = "ACCESS" | "RECTIFICATION" | "ERASURE";

/**
 * Spec 06 «Clienti» (accessLog.viewCustomer): search by name, fiscal code or
 * plate; the card with requests, policies, consents, the requests about
 * personal data and the log of who opened the data; the copy of the data as
 * a file. Opening a card and exporting are in the log themselves (rule 4).
 */
@Injectable()
export class CustomersBackOfficeService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async search(auth: AuthContext, query: string) {
    const q = query.trim();
    if (q.length < 2) return [];
    return withContext(this.db, auth.db, async (tx) => {
      const ids = await asSystem(tx, async () => {
        const fiscal = normalizeFiscalCodeInput(q);
        const byFiscal = /^[A-Z0-9]{11,16}$/.test(fiscal)
          ? await tx.customer.findMany({
              where: {
                person: {
                  OR: [
                    { fiscalCodeHash: this.cipher.blindIndex("fiscalCode", fiscal) },
                    { vatNumberHash: this.cipher.blindIndex("vatNumber", fiscal) },
                  ],
                },
              },
              select: { id: true },
            })
          : [];
        const plate = q.replace(/\s+/g, "").toUpperCase();
        const byPlate = /^[A-Z0-9]{5,8}$/.test(plate)
          ? [
              ...(
                await tx.vehicle.findMany({ where: { plate }, select: { customerId: true } })
              ).map((v) => ({ id: v.customerId })),
              ...(
                await tx.quoteRequest.findMany({
                  where: { plate, customerId: { not: null } },
                  select: { customerId: true },
                })
              ).map((r) => ({ id: r.customerId ?? "" })),
            ]
          : [];
        const byName = await tx.customer.findMany({
          where: {
            person: {
              OR: [
                { surname: { contains: q, mode: "insensitive" } },
                { givenName: { contains: q, mode: "insensitive" } },
                { companyName: { contains: q, mode: "insensitive" } },
              ],
            },
          },
          select: { id: true },
          take: 50,
        });
        return [...new Set([...byFiscal, ...byPlate, ...byName].map((c) => c.id))].slice(0, 50);
      });
      const customers = await asSystem(tx, () =>
        tx.customer.findMany({
          where: { id: { in: ids } },
          include: { person: true, _count: { select: { quoteRequests: true } } },
        }),
      );
      const orgs = await asSystem(tx, () =>
        tx.organization.findMany({
          where: {
            id: {
              in: customers.flatMap((c) => (c.ownerOrganizationId ? [c.ownerOrganizationId] : [])),
            },
          },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "CUSTOMERS_SEARCHED",
        targetType: "Customer",
        targetId: null,
        after: { results: customers.length },
      });
      return customers.map((c) => ({
        id: c.id,
        name: customerName(c.person),
        channel: c.ownerOrganizationId ? "BROKER" : "PRIVATE",
        broker: orgs.find((o) => o.id === c.ownerOrganizationId)?.legalName ?? null,
        requests: c._count.quoteRequests,
      }));
    });
  }

  private async customer(tx: DbTransaction, id: string) {
    const c = await asSystem(tx, () =>
      tx.customer.findUnique({ where: { id }, include: { person: true, vehicles: true } }),
    );
    if (!c) throw new ProblemError("NOT_FOUND");
    return c;
  }

  async card(auth: AuthContext, id: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const c = await this.customer(tx, id);
      const data = await asSystem(tx, async () => {
        const requests = await tx.quoteRequest.findMany({
          where: { customerId: id },
          select: {
            id: true,
            code: true,
            status: true,
            channel: true,
            createdAt: true,
            plate: true,
          },
          orderBy: { createdAt: "desc" },
        });
        const requestIds = requests.map((r) => r.id);
        return {
          requests,
          policies: await tx.policy.findMany({
            where: { quoteRequestId: { in: requestIds } },
            select: {
              id: true,
              policyNumber: true,
              status: true,
              startDate: true,
              endDate: true,
              quoteRequestId: true,
            },
          }),
          consents: await tx.consent.findMany({
            where: { customerId: id },
            orderBy: { acceptedAt: "desc" },
          }),
          access: await tx.auditLog.findMany({
            where: {
              action: { in: ACCESS_ACTIONS },
              OR: [
                { targetType: "Customer", targetId: id },
                { targetType: "QuoteRequest", targetId: { in: requestIds } },
              ],
            },
            orderBy: { seq: "desc" },
            take: 100,
          }),
        };
      });
      const actors = await asSystem(tx, () =>
        tx.user.findMany({
          where: {
            id: {
              in: [...new Set(data.access.flatMap((a) => (a.actorUserId ? [a.actorUserId] : [])))],
            },
          },
          select: { id: true, firstName: true, lastName: true, kind: true },
        }),
      );
      const tickets = await tx.supportTicket.findMany({
        where: { customerId: id },
        orderBy: { createdAt: "desc" },
      });
      const dsr = await tx.dataSubjectRequest.findMany({
        where: { customerId: id },
        orderBy: { receivedAt: "desc" },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "CUSTOMER_VIEWED",
        targetType: "Customer",
        targetId: id,
      });
      const p = c.person;
      return {
        id: c.id,
        name: customerName(p),
        kind: p.kind,
        fiscalCode: p.fiscalCodeEnc ? this.cipher.decrypt(p.fiscalCodeEnc) : null,
        vatNumber: p.vatNumberEnc ? this.cipher.decrypt(p.vatNumberEnc) : null,
        birthDate: p.birthDate?.toISOString().slice(0, 10) ?? null,
        residence: p.residence,
        email: c.emailEnc ? this.cipher.decrypt(c.emailEnc) : null,
        phone: c.phoneEnc ? this.cipher.decrypt(c.phoneEnc) : null,
        vehicles: c.vehicles.map((v) => v.plate),
        requests: data.requests.map((r) => ({
          id: r.id,
          code: r.code,
          status: r.status,
          channel: r.channel,
          plate: r.plate,
          createdAt: r.createdAt.toISOString(),
        })),
        policies: data.policies.map((x) => ({
          id: x.id,
          number: x.policyNumber,
          status: x.status,
          startDate: x.startDate.toISOString().slice(0, 10),
          endDate: x.endDate.toISOString().slice(0, 10),
          requestCode: data.requests.find((r) => r.id === x.quoteRequestId)?.code ?? "",
        })),
        consents: data.consents.map((x) => ({
          type: x.type,
          method: x.method,
          acceptedAt: x.acceptedAt.toISOString(),
          revokedAt: x.revokedAt?.toISOString() ?? null,
        })),
        tickets: tickets.map((t) => ({
          id: t.id,
          code: `T-${String(t.number).padStart(6, "0")}`,
          subject: t.subject,
          status: t.status,
        })),
        dataRequests: dsr.map((d) => ({
          id: d.id,
          kind: d.kind,
          status: d.status,
          description: d.description,
          receivedAt: d.receivedAt.toISOString(),
          dueAt: d.dueAt.toISOString(),
          outcome: d.outcome,
          closedAt: d.closedAt?.toISOString() ?? null,
        })),
        accessLog: data.access.map((a) => {
          const who = actors.find((u) => u.id === a.actorUserId);
          return {
            at: a.at.toISOString(),
            action: a.action,
            who: who ? `${who.firstName} ${who.lastName}`.trim() : null,
            whoKind: who?.kind ?? null,
            organizationId: a.actorOrganizationId,
          };
        }),
      };
    });
  }

  /** GDPR art. 15: the copy of the data, as a JSON file; the export is logged. */
  async exportData(auth: AuthContext, id: string) {
    const card = await this.card(auth, id);
    await withContext(this.db, auth.db, (tx) =>
      this.audit.inTransaction(tx, actorOf(auth), {
        action: "CUSTOMER_DATA_EXPORTED",
        targetType: "Customer",
        targetId: id,
      }),
    );
    // The person's data only: not the internal log, requests and tickets of the back office.
    const data = Object.fromEntries(
      Object.entries(card).filter(
        ([key]) => !["accessLog", "dataRequests", "tickets"].includes(key),
      ),
    );
    return {
      body: new TextEncoder().encode(
        JSON.stringify({ exportedAt: this.clock.now().toISOString(), ...data }, null, 2),
      ),
      mime: "application/json",
      fileName: "dati-personali.json",
    };
  }

  async openRequest(
    auth: AuthContext,
    customerId: string,
    input: { kind: DataSubjectKind; description: string; receivedOn: string },
  ) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      await this.customer(tx, customerId);
      const receivedAt = new Date(`${input.receivedOn}T12:00:00.000Z`);
      if (receivedAt.getTime() > now.getTime() + DAY_MS) {
        throw new ProblemError("VALIDATION_FAILED", undefined, [
          { path: "receivedOn", issue: "IN_THE_FUTURE" },
        ]);
      }
      const { "privacy.requestResponseDays": days } = await settingsAt(
        tx,
        ["privacy.requestResponseDays"],
        now,
      );
      const created = await tx.dataSubjectRequest.create({
        data: {
          customerId,
          kind: input.kind,
          description: input.description,
          receivedAt,
          dueAt: new Date(receivedAt.getTime() + days * DAY_MS),
          createdByUserId: auth.userId,
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "DATA_REQUEST_OPENED",
        targetType: "Customer",
        targetId: customerId,
        after: { requestId: created.id, kind: input.kind, dueAt: created.dueAt.toISOString() },
      });
      return { id: created.id, dueAt: created.dueAt.toISOString() };
    });
  }

  async closeRequest(auth: AuthContext, id: string, done: boolean, outcome: string) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const request = await tx.dataSubjectRequest.findUnique({ where: { id } });
      if (!request) throw new ProblemError("NOT_FOUND");
      if (request.status !== "OPEN") {
        throw new ProblemError("CONFLICT", "Already closed", [
          { path: "request", issue: "WRONG_STATE" },
        ]);
      }
      await tx.dataSubjectRequest.update({
        where: { id },
        data: {
          status: done ? "DONE" : "REJECTED",
          outcome,
          closedByUserId: auth.userId,
          closedAt: now,
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "DATA_REQUEST_CLOSED",
        targetType: "Customer",
        targetId: request.customerId,
        before: { status: "OPEN" },
        after: { requestId: id, status: done ? "DONE" : "REJECTED", late: now > request.dueAt },
        reason: outcome,
      });
      return { id, status: done ? "DONE" : "REJECTED" };
    });
  }

  /** The open requests, the nearest due date first (the queue of the dashboard). */
  async openRequests(auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) => {
      const rows = await tx.dataSubjectRequest.findMany({
        where: { status: "OPEN" },
        orderBy: { dueAt: "asc" },
        take: 200,
      });
      const customers = await asSystem(tx, () =>
        tx.customer.findMany({
          where: { id: { in: rows.map((r) => r.customerId) } },
          include: { person: true },
        }),
      );
      return rows.map((r) => ({
        id: r.id,
        customerId: r.customerId,
        customer: customerName(
          customers.find((c) => c.id === r.customerId)?.person ?? {
            kind: "PERSON",
            surname: null,
            givenName: null,
            companyName: null,
          },
        ),
        kind: r.kind,
        dueAt: r.dueAt.toISOString(),
      }));
    });
  }
}
