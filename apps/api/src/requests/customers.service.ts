import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import { withContext, type DbClient } from "@astax/db";
import {
  isValidFiscalCode,
  isValidVatNumber,
  normalizeFiscalCodeInput,
} from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB, FIELD_CIPHER } from "../infra/tokens.js";
import { customerScope } from "./request-support.js";
import { customerName } from "./requests.service.js";

export type NewCustomerInput =
  | {
      kind: "PERSON";
      surname: string;
      givenName: string;
      fiscalCode: string;
      email?: string;
      phone?: string;
    }
  | { kind: "COMPANY"; companyName: string; vatNumber: string; email?: string; phone?: string };

/** The broker's customers (brokerCustomer.manage, spec 02 «Clienti»). */
@Injectable()
export class CustomersService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async create(auth: AuthContext, input: NewCustomerInput) {
    const membership = auth.membership;
    if (!membership || membership.organizationType !== "BROKER")
      throw new ProblemError("FORBIDDEN");
    if (
      input.kind === "PERSON" &&
      !isValidFiscalCode(input.fiscalCode, romeCalendarDate(this.clock.now()))
    ) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "fiscalCode", issue: "INVALID_FISCAL_CODE" },
      ]);
    }
    if (input.kind === "COMPANY" && !isValidVatNumber(input.vatNumber)) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "vatNumber", issue: "INVALID_VAT_NUMBER" },
      ]);
    }
    const owner = { ownerOrganizationId: membership.organizationId };
    return withContext(this.db, auth.db, async (tx) => {
      if (input.kind === "PERSON") {
        const hash = this.cipher.blindIndex("fiscalCode", input.fiscalCode);
        const existing = await tx.customer.findFirst({
          where: { ...owner, person: { fiscalCodeHash: hash } },
          select: { id: true },
        });
        if (existing)
          throw new ProblemError("CONFLICT", "A customer with this fiscal code already exists");
      }
      const person = await tx.person.create({
        data:
          input.kind === "PERSON"
            ? {
                ...owner,
                kind: "PERSON",
                surname: input.surname,
                givenName: input.givenName,
                fiscalCodeEnc: this.cipher.encrypt(normalizeFiscalCodeInput(input.fiscalCode)),
                fiscalCodeHash: this.cipher.blindIndex("fiscalCode", input.fiscalCode),
              }
            : {
                ...owner,
                kind: "COMPANY",
                companyName: input.companyName,
                vatNumber: input.vatNumber,
              },
      });
      const customer = await tx.customer.create({
        data: {
          ...owner,
          ownerMembershipId: membership.id,
          personId: person.id,
          ...(input.email
            ? {
                emailEnc: this.cipher.encrypt(input.email),
                emailHash: this.cipher.blindIndex("email", input.email),
              }
            : {}),
          ...(input.phone
            ? {
                phoneEnc: this.cipher.encrypt(input.phone),
                phoneHash: this.cipher.blindIndex("phone", input.phone),
              }
            : {}),
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "CUSTOMER_CREATED",
        targetType: "Customer",
        targetId: customer.id,
      });
      return { id: customer.id };
    });
  }

  /** Search: an exact fiscal code uses the blind index; otherwise the start of the name. */
  async list(auth: AuthContext, query: string | undefined) {
    const q = (query ?? "").trim();
    const fiscal = normalizeFiscalCodeInput(q);
    return withContext(this.db, auth.db, async (tx) => {
      const rows = await tx.customer.findMany({
        where: {
          ...customerScope(auth),
          ...(q.length === 0
            ? {}
            : /^[A-Z0-9]{16}$/.test(fiscal)
              ? { person: { fiscalCodeHash: this.cipher.blindIndex("fiscalCode", fiscal) } }
              : {
                  person: {
                    OR: [
                      { surname: { startsWith: q, mode: "insensitive" } },
                      { givenName: { startsWith: q, mode: "insensitive" } },
                      { companyName: { startsWith: q, mode: "insensitive" } },
                    ],
                  },
                }),
        },
        include: {
          person: true,
          vehicles: { select: { plate: true } },
          _count: { select: { quoteRequests: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return rows.map((c) => ({
        id: c.id,
        name: customerName(c.person),
        kind: c.person.kind,
        fiscalCode: c.person.fiscalCodeEnc ? this.cipher.decrypt(c.person.fiscalCodeEnc) : null,
        vatNumber: c.person.vatNumber,
        vehicles: c.vehicles.map((v) => v.plate),
        requests: c._count.quoteRequests,
      }));
    });
  }

  /** The customer card, contacts included (the broker's own customer); the opening is logged. */
  async detail(auth: AuthContext, id: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id, ...customerScope(auth) },
        include: {
          person: true,
          vehicles: true,
          consents: { orderBy: { acceptedAt: "desc" } },
          quoteRequests: { orderBy: { createdAt: "desc" } },
        },
      });
      if (!customer) throw new ProblemError("NOT_FOUND");
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "CUSTOMER_VIEWED",
        targetType: "Customer",
        targetId: id,
      });
      const p = customer.person;
      return {
        id: customer.id,
        name: customerName(p),
        person: {
          kind: p.kind,
          surname: p.surname,
          givenName: p.givenName,
          companyName: p.companyName,
          fiscalCode: p.fiscalCodeEnc ? this.cipher.decrypt(p.fiscalCodeEnc) : null,
          vatNumber: p.vatNumber,
          birthDate: p.birthDate?.toISOString().slice(0, 10) ?? null,
          residence: p.residence,
        },
        contacts: {
          email: customer.emailEnc ? this.cipher.decrypt(customer.emailEnc) : null,
          phone: customer.phoneEnc ? this.cipher.decrypt(customer.phoneEnc) : null,
        },
        consents: customer.consents.map((c) => ({
          type: c.type,
          method: c.method,
          legalVersionId: c.legalVersionId,
          acceptedAt: c.acceptedAt.toISOString(),
          revokedAt: c.revokedAt?.toISOString() ?? null,
        })),
        vehicles: customer.vehicles.map((v) => ({ plate: v.plate, data: v.data })),
        requests: customer.quoteRequests.map((r) => ({
          id: r.id,
          code: r.code,
          status: r.status,
          plate: r.plate,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    });
  }
}
