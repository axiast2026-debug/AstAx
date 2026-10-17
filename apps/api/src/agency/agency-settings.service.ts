import { createHash, randomUUID } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import {
  asSystem,
  looksLikePdf,
  settingsAt,
  withContext,
  type DbClient,
  type DbTransaction,
} from "@astax/db";
import {
  AgencyFilterCriteriaSchema,
  memberFilterProblems,
  WeeklyHoursSchema,
  type AgencyFilterCriteria,
} from "@astax/shared/domain";
import { can } from "@astax/shared/permissions";
import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB, OBJECT_STORAGE } from "../infra/tokens.js";

/** The information set of a product (decision 17). */
export const PRODUCT_DOCUMENT_KINDS = [
  "PRODUCT_DIP",
  "PRODUCT_DIP_ADDITIONAL",
  "PRODUCT_CONDITIONS",
] as const;
export type ProductDocumentKind = (typeof PRODUCT_DOCUMENT_KINDS)[number];

export const CapacityInputSchema = z.strictObject({
  // The upper bound only refuses typing mistakes; it is not a business limit.
  dailyMax: z.number().int().positive().max(1000).nullable(),
  receptionHours: WeeklyHoursSchema,
  pausedUntil: z.iso.datetime({ offset: true }).nullable(),
  distribution: z.enum(["ALL_USERS", "BY_MEMBER_FILTERS"]),
});
export type CapacityInput = z.infer<typeof CapacityInputSchema>;

/** What the owner sees in the access log (VIS-08): openings of customer data and refusals. */
const ACCESS_ACTIONS = [
  "QUOTE_DATA_VIEWED",
  "DOCUMENT_VIEWED",
  "OFFER_OWNER_COPY_READ",
  "ACCESS_DENIED",
  "SEALED_BID_ACCESS_DENIED",
];

const fullName = (u: { firstName: string; lastName: string } | undefined) =>
  u ? `${u.firstName} ${u.lastName}`.trim() : null;

/**
 * The agency's own settings (spec 04 «Filtri e capacità», «Agenzia», «Team»):
 * the agency's filters and capacity (ASTA-05), each member's personal filters,
 * which only narrow the agency's (VIS-06), the product library (decision 17)
 * and the owner's access log of the agency's users (VIS-08).
 */
@Injectable()
export class AgencySettingsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private agency(auth: AuthContext) {
    const m = auth.membership;
    if (!m || m.organizationType !== "AGENCY") throw new ProblemError("NOT_FOUND");
    return m;
  }

  private async verifiedCompanies(tx: DbTransaction, organizationId: string) {
    const mandates = await tx.agencyMandate.findMany({
      where: { organizationId, verifiedAt: { not: null } },
      include: { company: true },
      orderBy: { company: { name: "asc" } },
    });
    return mandates.map((x) => ({ id: x.companyId, name: x.company.name }));
  }

  private criteriaOf(raw: unknown): AgencyFilterCriteria | null {
    const parsed = AgencyFilterCriteriaSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  private parseCriteria(raw: unknown): AgencyFilterCriteria {
    const parsed = AgencyFilterCriteriaSchema.safeParse(raw);
    if (!parsed.success) throw ProblemError.fromZod(parsed.error);
    return parsed.data;
  }

  // ------------------------------------------------------------ filters

  /** The filters page: the agency's filters and capacity, the member's own, the choices. */
  async filters(auth: AuthContext) {
    const m = this.agency(auth);
    return withContext(this.db, auth.db, async (tx) => {
      const [filter, capacity, mine, companies, packages, vehicleTypes] = await Promise.all([
        tx.agencyFilter.findUnique({ where: { organizationId: m.organizationId } }),
        tx.agencyCapacity.findUnique({ where: { organizationId: m.organizationId } }),
        tx.memberFilter.findUnique({ where: { membershipId: m.id } }),
        this.verifiedCompanies(tx, m.organizationId),
        tx.coveragePackage.findMany({ orderBy: { code: "asc" } }),
        tx.listValue.findMany({
          where: { listKey: "vehicleType", active: true },
          orderBy: { sortOrder: "asc" },
        }),
      ]);
      return {
        agency: filter ? this.criteriaOf(filter.criteria) : null,
        capacity: capacity
          ? {
              dailyMax: capacity.dailyMax,
              receptionHours: capacity.receptionHours,
              pausedUntil: capacity.pausedUntil?.toISOString() ?? null,
              distribution: capacity.distribution,
            }
          : null,
        mine: mine ? this.criteriaOf(mine.criteria) : null,
        canManageAgency: can(auth.actor, "agencyFilters.manage"),
        appliesToMe: m.role === "OPERATOR" && capacity?.distribution === "BY_MEMBER_FILTERS",
        choices: {
          companies,
          packages: packages.map((p) => ({ code: p.code, name: p.name })),
          vehicleTypes: vehicleTypes.map((v) => ({ code: v.code, label: v.labelIt })),
        },
      };
    });
  }

  /**
   * ASTA-05: the agency's filters. The companies must be among the verified
   * mandates. Members whose own filters now go beyond are returned, so the
   * page can say so: their filters keep working inside the agency's.
   */
  async saveAgencyFilters(auth: AuthContext, raw: unknown) {
    const m = this.agency(auth);
    if (!can(auth.actor, "agencyFilters.manage")) throw new ProblemError("FORBIDDEN");
    const criteria = this.parseCriteria(raw);
    return withContext(this.db, auth.db, async (tx) => {
      const companies = (await this.verifiedCompanies(tx, m.organizationId)).map((c) => c.id);
      if (!criteria.companies.every((c) => companies.includes(c))) {
        throw new ProblemError("VALIDATION_FAILED", undefined, [
          { path: "companies", issue: "COMPANY_NOT_MANDATED" },
        ]);
      }
      const before = await tx.agencyFilter.findUnique({
        where: { organizationId: m.organizationId },
      });
      await tx.agencyFilter.upsert({
        where: { organizationId: m.organizationId },
        create: { organizationId: m.organizationId, criteria, updatedByUserId: auth.userId },
        update: { criteria, updatedByUserId: auth.userId },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "AGENCY_FILTERS_CHANGED",
        targetType: "Organization",
        targetId: m.organizationId,
        before: (before?.criteria as object | undefined) ?? null,
        after: criteria,
      });
      const members = await tx.membership.findMany({
        where: { organizationId: m.organizationId, status: { not: "REMOVED" } },
        include: { user: { select: { firstName: true, lastName: true } } },
      });
      const filters = await tx.memberFilter.findMany({
        where: { membershipId: { in: members.map((x) => x.id) } },
      });
      const wider = filters.flatMap((f) => {
        const own = this.criteriaOf(f.criteria);
        if (!own || memberFilterProblems(criteria, own).length === 0) return [];
        return [fullName(members.find((x) => x.id === f.membershipId)?.user) ?? ""];
      });
      return { saved: true, membersBeyond: wider };
    });
  }

  /** ASTA-05: daily maximum, reception hours, pause and distribution among the members. */
  async saveCapacity(auth: AuthContext, input: CapacityInput) {
    const m = this.agency(auth);
    if (!can(auth.actor, "agencyFilters.manage")) throw new ProblemError("FORBIDDEN");
    const data = {
      dailyMax: input.dailyMax,
      receptionHours: input.receptionHours,
      pausedUntil: input.pausedUntil ? new Date(input.pausedUntil) : null,
      distribution: input.distribution,
    };
    return withContext(this.db, auth.db, async (tx) => {
      await tx.agencyCapacity.upsert({
        where: { organizationId: m.organizationId },
        create: { organizationId: m.organizationId, ...data },
        update: data,
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "AGENCY_CAPACITY_CHANGED",
        targetType: "Organization",
        targetId: m.organizationId,
        after: input,
      });
      return { saved: true };
    });
  }

  /**
   * VIS-06: the member's personal filters, only narrowing the agency's; null
   * removes them. They decide what an operator sees when the agency
   * distributes the requests by personal filters.
   */
  async saveMyFilters(auth: AuthContext, raw: unknown) {
    const m = this.agency(auth);
    const criteria = raw === null ? null : this.parseCriteria(raw);
    return withContext(this.db, auth.db, async (tx) => {
      if (criteria === null) {
        await tx.memberFilter.deleteMany({ where: { membershipId: m.id } });
      } else {
        const filter = await tx.agencyFilter.findUnique({
          where: { organizationId: m.organizationId },
        });
        const agency = filter ? this.criteriaOf(filter.criteria) : null;
        if (!agency) throw new ProblemError("CONFLICT", "The agency has no filters yet");
        const problems = memberFilterProblems(agency, criteria);
        if (problems.length > 0) {
          throw new ProblemError(
            "VALIDATION_FAILED",
            "Personal filters may only narrow the agency's",
            problems.map((p) => ({ path: `mine.${p}`, issue: "WIDER_THAN_AGENCY" })),
          );
        }
        await tx.memberFilter.upsert({
          where: { membershipId: m.id },
          create: { membershipId: m.id, criteria },
          update: { criteria },
        });
      }
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "MEMBER_FILTERS_CHANGED",
        targetType: "Membership",
        targetId: m.id,
        after: criteria,
      });
      return { saved: true };
    });
  }

  // ------------------------------------------------------------ products

  /** The product library (decision 17), with the current document of each kind. */
  async products(auth: AuthContext) {
    const m = this.agency(auth);
    return withContext(this.db, auth.db, async (tx) => {
      const [products, companies] = await Promise.all([
        tx.insuranceProduct.findMany({
          where: { organizationId: m.organizationId },
          include: {
            company: true,
            documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
          },
          orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
        }),
        this.verifiedCompanies(tx, m.organizationId),
      ]);
      return {
        canManage: can(auth.actor, "productLibrary.manage"),
        companies,
        products: products.map((p) => ({
          id: p.id,
          companyId: p.companyId,
          company: p.company.name,
          name: p.name,
          active: p.active,
          documents: Object.fromEntries(
            PRODUCT_DOCUMENT_KINDS.map((kind) => {
              const current = p.documents.find((d) => d.kind === kind);
              return [
                kind,
                current ? { id: current.id, uploadedAt: current.createdAt.toISOString() } : null,
              ];
            }),
          ),
        })),
      };
    });
  }

  async createProduct(auth: AuthContext, input: { companyId: string; name: string }) {
    const m = this.agency(auth);
    if (!can(auth.actor, "productLibrary.manage")) throw new ProblemError("FORBIDDEN");
    return withContext(this.db, auth.db, async (tx) => {
      const companies = (await this.verifiedCompanies(tx, m.organizationId)).map((c) => c.id);
      if (!companies.includes(input.companyId)) {
        throw new ProblemError("VALIDATION_FAILED", undefined, [
          { path: "companyId", issue: "COMPANY_NOT_MANDATED" },
        ]);
      }
      const same = await tx.insuranceProduct.findFirst({
        where: { organizationId: m.organizationId, companyId: input.companyId, name: input.name },
      });
      if (same) {
        throw new ProblemError("CONFLICT", "A product with this name already exists", [
          { path: "name", issue: "PRODUCT_EXISTS" },
        ]);
      }
      const product = await tx.insuranceProduct.create({
        data: { organizationId: m.organizationId, companyId: input.companyId, name: input.name },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "PRODUCT_CREATED",
        targetType: "InsuranceProduct",
        targetId: product.id,
        after: { companyId: input.companyId, name: input.name },
      });
      return { id: product.id };
    });
  }

  /** A product out of use stays in the offers that named it, and leaves the offer form. */
  async setProductActive(auth: AuthContext, productId: string, active: boolean) {
    const m = this.agency(auth);
    if (!can(auth.actor, "productLibrary.manage")) throw new ProblemError("FORBIDDEN");
    return withContext(this.db, auth.db, async (tx) => {
      const product = await tx.insuranceProduct.findFirst({
        where: { id: productId, organizationId: m.organizationId },
      });
      if (!product) throw new ProblemError("NOT_FOUND");
      await tx.insuranceProduct.update({ where: { id: productId }, data: { active } });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "PRODUCT_UPDATED",
        targetType: "InsuranceProduct",
        targetId: productId,
        before: { active: product.active },
        after: { active },
      });
      return { active };
    });
  }

  /** One document of the information set, as a PDF; the previous one stays as history. */
  async uploadProductDocument(
    auth: AuthContext,
    productId: string,
    kind: string,
    file: { body: Uint8Array; contentType: string },
  ) {
    const m = this.agency(auth);
    if (!can(auth.actor, "productLibrary.manage")) throw new ProblemError("FORBIDDEN");
    if (!(PRODUCT_DOCUMENT_KINDS as readonly string[]).includes(kind)) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [{ path: "kind", issue: "invalid" }]);
    }
    if (file.contentType !== "application/pdf" || !looksLikePdf(file.body)) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "file", issue: "NOT_A_PDF" },
      ]);
    }
    const now = this.clock.now();
    await withContext(this.db, auth.db, async (tx) => {
      const product = await tx.insuranceProduct.findFirst({
        where: { id: productId, organizationId: m.organizationId },
      });
      if (!product) throw new ProblemError("NOT_FOUND");
      const { "documents.maxUploadMb": maxMb } = await settingsAt(
        tx,
        ["documents.maxUploadMb"],
        now,
      );
      if (file.body.byteLength === 0 || file.body.byteLength > maxMb * 1024 * 1024) {
        throw new ProblemError("VALIDATION_FAILED", undefined, [
          { path: "file", issue: "TOO_LARGE" },
        ]);
      }
    });
    const storageKey = `products/${productId}/${randomUUID()}`;
    await this.storage.put({ key: storageKey, body: file.body, contentType: file.contentType });
    return withContext(this.db, auth.db, async (tx) => {
      const document = await tx.document.create({
        data: {
          kind: kind as ProductDocumentKind,
          ownerOrganizationId: m.organizationId,
          productId,
          storageKey,
          sha256: createHash("sha256").update(file.body).digest("hex"),
          mime: file.contentType,
          size: file.body.byteLength,
          fileName: `${kind.toLowerCase()}.pdf`,
          uploadedByUserId: auth.userId,
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "PRODUCT_DOCUMENT_UPLOADED",
        targetType: "InsuranceProduct",
        targetId: productId,
        after: { kind, documentId: document.id },
      });
      return { id: document.id };
    });
  }

  async productDocument(auth: AuthContext, productId: string, documentId: string) {
    const m = this.agency(auth);
    const document = await withContext(this.db, auth.db, (tx) =>
      tx.document.findFirst({
        where: {
          id: documentId,
          productId,
          ownerOrganizationId: m.organizationId,
          deletedAt: null,
        },
      }),
    );
    if (!document) throw new ProblemError("NOT_FOUND");
    return {
      body: await this.storage.get(document.storageKey),
      mime: document.mime,
      fileName: document.fileName,
    };
  }

  // ------------------------------------------------------------ access log

  /**
   * VIS-08: the openings of customer data by the agency's users, and the
   * refused attempts. Reading the log is itself logged (rule 4).
   */
  async accessLog(auth: AuthContext, before?: bigint) {
    const m = this.agency(auth);
    if (!can(auth.actor, "accessLog.viewOwnAgency")) throw new ProblemError("FORBIDDEN");
    return withContext(this.db, auth.db, async (tx) => {
      const rows = await tx.auditLog.findMany({
        where: {
          actorOrganizationId: m.organizationId,
          action: { in: ACCESS_ACTIONS },
          ...(before ? { seq: { lt: before } } : {}),
        },
        orderBy: { seq: "desc" },
        take: 100,
      });
      const userIds = [...new Set(rows.flatMap((r) => (r.actorUserId ? [r.actorUserId] : [])))];
      const users = await tx.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true },
      });
      const codes = await this.requestCodes(tx, rows);
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "AUDIT_LOG_READ",
        targetType: "Organization",
        targetId: m.organizationId,
        after: { scope: "agencyAccessLog", before: before?.toString() ?? null },
      });
      return {
        entries: rows.map((r) => ({
          seq: r.seq.toString(),
          at: r.at.toISOString(),
          action: r.action,
          user: fullName(users.find((u) => u.id === r.actorUserId)),
          requestCode: codes.get(r.seq) ?? null,
          targetType: r.targetType,
        })),
        next: rows.length === 100 ? rows[rows.length - 1]?.seq.toString() : null,
      };
    });
  }

  /** The request code of each entry: the target may be the request, a document, an auction, an offer. */
  private async requestCodes(
    tx: DbTransaction,
    rows: { seq: bigint; targetType: string | null; targetId: string | null }[],
  ): Promise<Map<bigint, string>> {
    const ids = (type: string) =>
      rows.flatMap((r) => (r.targetType === type && r.targetId ? [r.targetId] : []));
    return asSystem(tx, async () => {
      const [documents, auctions, offers] = await Promise.all([
        tx.document.findMany({
          where: { id: { in: ids("Document") } },
          select: { id: true, quoteRequestId: true },
        }),
        tx.auction.findMany({
          where: { id: { in: ids("Auction") } },
          select: { id: true, quoteRequestId: true },
        }),
        tx.offer.findMany({
          where: { id: { in: ids("Offer") } },
          select: { id: true, auction: { select: { quoteRequestId: true } } },
        }),
      ]);
      const requestOf = new Map<string, string | null>([
        ...ids("QuoteRequest").map((id) => [id, id] as [string, string]),
        ...documents.map((d) => [d.id, d.quoteRequestId] as [string, string | null]),
        ...auctions.map((a) => [a.id, a.quoteRequestId] as [string, string]),
        ...offers.map((o) => [o.id, o.auction.quoteRequestId] as [string, string]),
      ]);
      const requestIds = [...new Set([...requestOf.values()].filter((x): x is string => !!x))];
      const requests = await tx.quoteRequest.findMany({
        where: { id: { in: requestIds } },
        select: { id: true, code: true },
      });
      const out = new Map<bigint, string>();
      for (const r of rows) {
        const requestId = r.targetId ? requestOf.get(r.targetId) : null;
        const code = requests.find((q) => q.id === requestId)?.code;
        if (code) out.set(r.seq, code);
      }
      return out;
    });
  }
}
