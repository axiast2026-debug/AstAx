import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import {
  asSystem,
  withContext,
  type Auction,
  type DbClient,
  type DbTransaction,
  type Invitation,
  type QuoteRequest,
} from "@astax/db";
import { isGuaranteed, type QuoteData } from "@astax/shared/domain";
import { dbDateToCalendarDate, formatDateTime } from "@astax/shared/format";
import { can } from "@astax/shared/permissions";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import { OffersService } from "../auctions/offers.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB, FIELD_CIPHER, OBJECT_STORAGE } from "../infra/tokens.js";
import labels from "../notifications/labels.it.json" with { type: "json" };
import { watermarked } from "./watermark.js";

/** Kinds of documents an invited agency may see (VIS-01: never the consent, never others' quotes). */
const AGENCY_DOCUMENT_KINDS = [
  "REGISTRATION_CERTIFICATE",
  "DRIVING_LICENCE",
  "RISK_CERTIFICATE",
  "FISCAL_CODE_CARD",
  "OTHER",
] as const;
type AgencyDocumentKind = (typeof AGENCY_DOCUMENT_KINDS)[number];

export type IncomingState =
  "NEW" | "CLAIMED_BY_ME" | "CLAIMED_BY_COLLEAGUE" | "OFFERED" | "DECLINED";

export interface IncomingFilters {
  vehicleType?: string;
  province?: string;
  state?: IncomingState;
}

/** Latin-1 only: the standard PDF fonts cannot draw other characters. */
const latin1 = (text: string) => text.replace(/[^ -ÿ]/g, "?");

/**
 * The agency area (spec 04): requests in target, their detail and documents,
 * the dashboard and «Le mie offerte». Never the customer's phone or email
 * (VIS-01): quoteData has none by construction and nothing here adds them.
 * Every opening of a request or a document is logged (VIS-09) and every
 * document is watermarked (VIS-10).
 */
@Injectable()
export class AgencyService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OffersService) private readonly offers: OffersService,
  ) {}

  private agency(auth: AuthContext) {
    const m = auth.membership;
    if (!m || m.organizationType !== "AGENCY") throw new ProblemError("NOT_FOUND");
    return m;
  }

  private async denied(auth: AuthContext, targetType: string, targetId: string): Promise<never> {
    await this.audit.record(actorOf(auth), { action: "ACCESS_DENIED", targetType, targetId });
    throw new ProblemError("NOT_FOUND");
  }

  /** The invitation of the agency and its request, within the member's filters (VIS-06). */
  private async invited(tx: DbTransaction, auth: AuthContext, auctionId: string) {
    const m = this.agency(auth);
    const invitation = await tx.invitation.findUnique({
      where: { auctionId_organizationId: { auctionId, organizationId: m.organizationId } },
      include: { auction: true },
    });
    if (!invitation) return null;
    const request = await asSystem(tx, () =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: invitation.auction.quoteRequestId } }),
    );
    const scope = await this.offers.memberScope(tx, auth);
    if (!this.offers.fitsScope(scope, request, invitation.auction.openedAt)) return null;
    return { invitation, auction: invitation.auction, request };
  }

  private async quoteDataOf(tx: DbTransaction, request: QuoteRequest): Promise<QuoteData> {
    const version = await asSystem(tx, () =>
      tx.quoteDataVersion.findUniqueOrThrow({
        where: {
          quoteRequestId_version: {
            quoteRequestId: request.id,
            version: request.quoteDataVersion ?? 0,
          },
        },
      }),
    );
    return JSON.parse(this.cipher.decrypt(version.dataEnc)) as QuoteData;
  }

  private state(
    invitation: Invitation,
    auth: AuthContext,
    claim: { userId: string } | undefined,
    offered: boolean,
  ): IncomingState {
    if (invitation.status === "DECLINED") return "DECLINED";
    if (offered) return "OFFERED";
    if (claim) return claim.userId === auth.userId ? "CLAIMED_BY_ME" : "CLAIMED_BY_COLLEAGUE";
    return "NEW";
  }

  /**
   * OFF-02 OFF-03 (spec 05 «Più agenzie»): the auctions this person already
   * works on for another of their agencies, with that agency and whether they
   * offered there. Only the caller's own claims and offers are read.
   */
  private async elsewhere(
    tx: DbTransaction,
    auth: AuthContext,
    auctionIds: string[],
  ): Promise<Map<string, { agency: string; offered: boolean }>> {
    const m = this.agency(auth);
    return asSystem(tx, async () => {
      const where = {
        auctionId: { in: auctionIds },
        userId: auth.userId,
        organizationId: { not: m.organizationId },
      };
      const [claims, offers] = await Promise.all([
        tx.claim.findMany({ where: { ...where, releasedAt: null } }),
        tx.offer.findMany({ where: { ...where, status: { not: "WITHDRAWN" } } }),
      ]);
      const orgIds = [...new Set([...claims, ...offers].map((x) => x.organizationId))];
      const orgs = await tx.organization.findMany({ where: { id: { in: orgIds } } });
      const name = (id: string) => orgs.find((o) => o.id === id)?.legalName ?? "";
      const out = new Map<string, { agency: string; offered: boolean }>();
      for (const c of claims)
        out.set(c.auctionId, { agency: name(c.organizationId), offered: false });
      for (const o of offers)
        out.set(o.auctionId, { agency: name(o.organizationId), offered: true });
      return out;
    });
  }

  /** «Richieste in arrivo» (spec 04): in target, ordered by closing, with the columns of the spec. */
  async incoming(auth: AuthContext, filters: IncomingFilters) {
    const m = auth.membership;
    if (!m || m.organizationType !== "AGENCY") return [];
    return withContext(this.db, auth.db, async (tx) => {
      const all = await tx.invitation.findMany({
        where: { organizationId: m.organizationId },
        include: { auction: true },
        orderBy: { invitedAt: "desc" },
        take: 200,
      });
      const requests = await asSystem(tx, () =>
        tx.quoteRequest.findMany({
          where: { id: { in: all.map((i) => i.auction.quoteRequestId) } },
        }),
      );
      const scope = await this.offers.memberScope(tx, auth);
      const ids = all.map((i) => i.auctionId);
      const [offers, claims, packages] = await Promise.all([
        tx.offer.findMany({ where: { organizationId: m.organizationId, auctionId: { in: ids } } }),
        tx.claim.findMany({
          where: { organizationId: m.organizationId, releasedAt: null, auctionId: { in: ids } },
        }),
        tx.coveragePackage.findMany(),
      ]);
      const users = await tx.user.findMany({
        where: { id: { in: claims.map((c) => c.userId) } },
        select: { id: true, firstName: true, lastName: true },
      });
      const elsewhere = await this.elsewhere(tx, auth, ids);
      const rows = all.flatMap((i) => {
        const r = requests.find((q) => q.id === i.auction.quoteRequestId);
        if (!r || !this.offers.fitsScope(scope, r, i.auction.openedAt)) return [];
        const claim = claims.find((c) => c.auctionId === i.auctionId);
        const offer = offers.find((o) => o.auctionId === i.auctionId && o.status !== "WITHDRAWN");
        const holder = users.find((u) => u.id === claim?.userId);
        return [
          {
            auctionId: i.auctionId,
            code: r.code,
            kind: i.auction.kind,
            vehicleType: r.vehicleType,
            province: r.province,
            cuClass: r.cuClass,
            claimsLast5y: r.claimsLast5y,
            youngestDriverAge: r.youngestDriverAge,
            packageCode: r.packageCode,
            packageName: packages.find((p) => p.code === r.packageCode)?.name ?? r.packageCode,
            startDate: r.startDate ? dbDateToCalendarDate(r.startDate) : null,
            minValidityDays: r.minValidityDays,
            minGuaranteeDate: dbDateToCalendarDate(i.auction.minGuaranteeDate),
            auctionStatus: i.auction.status,
            scheduledCloseAt: i.auction.scheduledCloseAt.toISOString(),
            state: this.state(i, auth, claim, offer !== undefined),
            claimedBy: holder ? `${holder.firstName} ${holder.lastName}`.trim() : null,
            elsewhere: elsewhere.get(i.auctionId) ?? null,
            offer: offer ? { id: offer.id, status: offer.status, version: offer.version } : null,
          },
        ];
      });
      return rows
        .filter((row) => !filters.vehicleType || row.vehicleType === filters.vehicleType)
        .filter((row) => !filters.province || row.province === filters.province)
        .filter((row) => !filters.state || row.state === filters.state)
        .sort((a, b) => {
          const open = (x: typeof a) => (x.auctionStatus === "OPEN" ? 0 : 1);
          return open(a) - open(b) || a.scheduledCloseAt.localeCompare(b.scheduledCloseAt);
        });
    });
  }

  /**
   * The request as the agency sees it (spec 04 «Dettaglio della richiesta»):
   * all the data useful to quote, never the contacts (VIS-01). The opening is
   * logged and the page says so (VIS-09).
   */
  async detail(auth: AuthContext, auctionId: string) {
    const m = this.agency(auth);
    const found = await withContext(this.db, auth.db, async (tx) => {
      const target = await this.invited(tx, auth, auctionId);
      if (!target) return null;
      const { invitation, auction, request } = target;
      const now = this.clock.now();
      const quoteData = await this.quoteDataOf(tx, request);
      const [documents, claim, offer, pkg, mandates] = await Promise.all([
        asSystem(tx, () =>
          tx.document.findMany({
            where: {
              quoteRequestId: request.id,
              deletedAt: null,
              kind: { in: [...AGENCY_DOCUMENT_KINDS] },
            },
            orderBy: { createdAt: "asc" },
          }),
        ),
        tx.claim.findFirst({
          where: { auctionId, organizationId: m.organizationId, releasedAt: null },
        }),
        tx.offer.findFirst({
          where: { auctionId, organizationId: m.organizationId, status: { not: "WITHDRAWN" } },
        }),
        tx.coveragePackageVersion.findFirst({
          where: { packageCode: request.packageCode ?? "", validFrom: { lte: auction.openedAt } },
          orderBy: { version: "desc" },
          include: { package: true },
        }),
        tx.agencyMandate.findMany({
          where: { organizationId: m.organizationId, verifiedAt: { not: null } },
          include: { company: true },
        }),
      ]);
      const products = await tx.insuranceProduct.findMany({
        where: { organizationId: m.organizationId, active: true },
      });
      // OFF-02: the same person may already work on this auction for another agency.
      const elsewhere = await asSystem(tx, async () => {
        const other = await tx.claim.findFirst({
          where: {
            auctionId,
            userId: auth.userId,
            releasedAt: null,
            organizationId: { not: m.organizationId },
          },
        });
        const offered = await tx.offer.findFirst({
          where: {
            auctionId,
            userId: auth.userId,
            status: { not: "WITHDRAWN" },
            organizationId: { not: m.organizationId },
          },
        });
        const orgId = offered?.organizationId ?? other?.organizationId;
        if (!orgId) return null;
        const org = await tx.organization.findUnique({ where: { id: orgId } });
        return { agency: org?.legalName ?? "", offered: offered !== null };
      });
      // OFF-03: who the owner or a supervisor may give the claim to.
      const members = can(auth.actor, "claim.override")
        ? await tx.membership.findMany({
            where: { organizationId: m.organizationId, status: "ACTIVE" },
            include: { user: { select: { firstName: true, lastName: true } } },
          })
        : [];
      const holder = claim
        ? await tx.user.findUnique({
            where: { id: claim.userId },
            select: { firstName: true, lastName: true },
          })
        : null;
      if (!invitation.firstViewedAt) {
        await tx.invitation.update({
          where: { id: invitation.id },
          data: {
            firstViewedAt: now,
            ...(invitation.status === "INVITED" ? { status: "VIEWED" as const } : {}),
          },
        });
      }
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "QUOTE_DATA_VIEWED",
        targetType: "QuoteRequest",
        targetId: request.id,
        after: { auctionId },
      });
      return {
        auctionId,
        code: request.code,
        kind: auction.kind,
        auctionStatus: auction.status,
        scheduledCloseAt: auction.scheduledCloseAt.toISOString(),
        minGuaranteeDate: dbDateToCalendarDate(auction.minGuaranteeDate),
        invitation: invitation.status,
        claim: claim
          ? {
              byMe: claim.userId === auth.userId,
              holder: holder ? `${holder.firstName} ${holder.lastName}`.trim() : null,
            }
          : null,
        elsewhere,
        offer: offer ? { id: offer.id, status: offer.status, version: offer.version } : null,
        quoteData,
        package: pkg
          ? { code: pkg.packageCode, name: pkg.package.name, requirements: pkg.requirements }
          : null,
        companies: mandates.map((x) => ({ id: x.companyId, name: x.company.name })),
        products: products.map((p) => ({ id: p.id, companyId: p.companyId, name: p.name })),
        documents: documents.map((d) => ({ id: d.id, kind: d.kind, driverIndex: d.driverIndex })),
        members: members.map((x) => ({
          membershipId: x.id,
          name: `${x.user.firstName} ${x.user.lastName}`.trim(),
        })),
        accessLogged: true,
      };
    });
    if (!found) return this.denied(auth, "Auction", auctionId);
    return found;
  }

  /** A document of the request, always as a watermarked PDF (VIS-10), logged (VIS-09). */
  async documentFile(auth: AuthContext, auctionId: string, documentId: string) {
    const m = this.agency(auth);
    const found = await withContext(this.db, auth.db, async (tx) => {
      const target = await this.invited(tx, auth, auctionId);
      if (!target) return null;
      const document = await asSystem(tx, () =>
        tx.document.findFirst({
          where: {
            id: documentId,
            quoteRequestId: target.request.id,
            deletedAt: null,
            kind: { in: [...AGENCY_DOCUMENT_KINDS] },
          },
        }),
      );
      if (!document) return null;
      const [organization, user] = await Promise.all([
        tx.organization.findUniqueOrThrow({ where: { id: m.organizationId } }),
        tx.user.findUniqueOrThrow({ where: { id: auth.userId } }),
      ]);
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "DOCUMENT_VIEWED",
        targetType: "Document",
        targetId: document.id,
        after: { auctionId, watermarked: true },
      });
      return { document, organization, user };
    });
    if (!found) return this.denied(auth, "Document", documentId);
    const { document, organization, user } = found;
    const text = latin1(
      labels.agencyDocument.watermark
        .replace("{agency}", organization.legalName)
        .replace("{user}", `${user.firstName} ${user.lastName}`.trim())
        .replace("{at}", formatDateTime(this.clock.now())),
    );
    const body = await watermarked(
      await this.storage.get(document.storageKey),
      document.mime,
      text,
      latin1(labels.agencyDocument.unreadable),
    );
    return {
      body,
      mime: "application/pdf",
      // VIS-01: never the original file name, which may hold the customer's name.
      fileName: labels.agencyDocument.fileName[document.kind as AgencyDocumentKind],
    };
  }

  /** Dashboard (spec 04): counters now; the indicators that need phases 5-6 stay null. */
  async dashboard(auth: AuthContext) {
    const rows = await this.incoming(auth, {});
    const now = this.clock.now().getTime();
    const m = this.agency(auth);
    return withContext(this.db, auth.db, async (tx) => {
      const mine = can(auth.actor, "offer.readColleagueDuringAuction")
        ? {}
        : { userId: auth.userId };
      const awaiting = await tx.offer.findMany({
        where: { organizationId: m.organizationId, status: "AWAITING_CUSTOMER", ...mine },
      });
      const since = new Date(now - 30 * 86_400_000);
      const closedInvitations = await tx.invitation.count({
        where: {
          organizationId: m.organizationId,
          invitedAt: { gte: since },
          auction: { status: "CLOSED" },
        },
      });
      const answered = await tx.offer.count({
        where: {
          organizationId: m.organizationId,
          submittedAt: { gte: since },
          status: { notIn: ["SUBMITTED", "WITHDRAWN"] },
        },
      });
      const open = rows.filter((r) => r.auctionStatus === "OPEN");
      return {
        counters: {
          newInTarget: open.filter((r) => r.state === "NEW").length,
          closingWithinHourWithoutOffer: open.filter(
            (r) => r.state !== "OFFERED" && Date.parse(r.scheduledCloseAt) - now <= 3_600_000,
          ).length,
          awaitingCustomer: awaiting.length,
          openGuarantees: awaiting.filter(
            (o) =>
              o.guaranteeUntil &&
              isGuaranteed(dbDateToCalendarDate(o.guaranteeUntil), new Date(now)),
          ).length,
          toIssue: null,
          remittancesDue: null,
        },
        last30Days: {
          responseRate: closedInvitations === 0 ? null : answered / closedInvitations,
          winRate: null,
          averageGapFromWinner: null,
          averageIssuanceTime: null,
        },
      };
    });
  }

  /**
   * «Le mie offerte» (spec 04): views by status; the owner, supervisors and
   * operators with canSeeColleagueOffers see the whole agency's. The premium
   * of an offer still sealed is read from the owner copy, and logged (BC-04).
   */
  async myOffers(auth: AuthContext) {
    const m = this.agency(auth);
    const all = can(auth.actor, "offer.readColleagueDuringAuction");
    const rows = await withContext(this.db, auth.db, async (tx) => {
      const offers = await tx.offer.findMany({
        where: { organizationId: m.organizationId, ...(all ? {} : { userId: auth.userId }) },
        include: { auction: true },
        orderBy: { submittedAt: "desc" },
        take: 200,
      });
      const requests = await asSystem(tx, () =>
        tx.quoteRequest.findMany({
          where: { id: { in: offers.map((o) => o.auction.quoteRequestId) } },
        }),
      );
      const [companies, users] = await Promise.all([
        tx.insuranceCompany.findMany(),
        tx.user.findMany({
          where: { id: { in: offers.map((o) => o.userId) } },
          select: { id: true, firstName: true, lastName: true },
        }),
      ]);
      return { offers, requests, companies, users };
    });
    const out = [];
    for (const o of rows.offers) {
      const sealed = o.annualGrossPremiumCents === null && o.status !== "WITHDRAWN";
      const copy = sealed ? await this.offers.read(auth, o.id).catch(() => null) : null;
      const r = rows.requests.find((q) => q.id === o.auction.quoteRequestId);
      const author = rows.users.find((u) => u.id === o.userId);
      const companyId = o.companyId ?? copy?.offer.companyId ?? null;
      out.push({
        id: o.id,
        auctionId: o.auctionId,
        code: r?.code ?? "",
        profile: {
          vehicleType: r?.vehicleType ?? null,
          province: r?.province ?? null,
          packageCode: r?.packageCode ?? null,
        },
        status: o.status,
        kind: o.auction.kind,
        annualGrossPremiumCents:
          o.annualGrossPremiumCents ?? copy?.offer.annualGrossPremiumCents ?? null,
        company: rows.companies.find((c) => c.id === companyId)?.name ?? null,
        guaranteeUntil: o.guaranteeUntil
          ? dbDateToCalendarDate(o.guaranteeUntil)
          : (copy?.offer.guaranteeUntil ?? null),
        author: author ? `${author.firstName} ${author.lastName}`.trim() : null,
        exclusionReason: o.exclusionReason,
        scheduledCloseAt: o.auction.scheduledCloseAt.toISOString(),
      });
    }
    return out;
  }

  /** OFF-03: the owner or a supervisor gives a request claimed by a colleague to another member. */
  async assignClaim(auth: AuthContext, auctionId: string, membershipId: string) {
    const m = this.agency(auth);
    if (!can(auth.actor, "claim.override")) throw new ProblemError("FORBIDDEN");
    return withContext(this.db, auth.db, async (tx) => {
      const target = await this.invited(tx, auth, auctionId);
      if (!target) return this.denied(auth, "Auction", auctionId);
      const auction: Auction = target.auction;
      if (auction.status !== "OPEN" || this.clock.now() >= auction.scheduledCloseAt) {
        throw new ProblemError("AUCTION_CLOSED");
      }
      const member = await tx.membership.findFirst({
        where: { id: membershipId, organizationId: m.organizationId, status: "ACTIVE" },
      });
      if (!member) throw new ProblemError("NOT_FOUND");
      const now = this.clock.now();
      await tx.claim.updateMany({
        where: { auctionId, organizationId: m.organizationId, releasedAt: null },
        data: { releasedAt: now, releasedByUserId: auth.userId },
      });
      try {
        await tx.$executeRaw`SAVEPOINT claim_assign`;
        // A claim for a colleague: a system step, after the claim.override check above.
        await asSystem(tx, () =>
          tx.claim.create({
            data: {
              auctionId,
              organizationId: m.organizationId,
              membershipId: member.id,
              userId: member.userId,
              claimedAt: now,
            },
          }),
        );
        await tx.$executeRaw`RELEASE SAVEPOINT claim_assign`;
      } catch {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT claim_assign`;
        // OFF-02: that person already works on this auction for another agency.
        throw new ProblemError("CONFLICT", "The person already works on this auction", [
          { path: "claim", issue: "ONE_PERSON_ONE_AGENCY" },
        ]);
      }
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "AUCTION_CLAIM_ASSIGNED",
        targetType: "Auction",
        targetId: auctionId,
        after: { membershipId },
      });
      return { assigned: true };
    });
  }
}
