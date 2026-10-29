import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import {
  asSystem,
  auctionWorkingTime,
  isUniqueViolation,
  settingsAt,
  withContext,
  type Auction,
  type DbClient,
  type DbTransaction,
  type Invitation,
  type QuoteRequest,
  filterableRequest,
  requesterExclusions,
} from "@astax/db";
import {
  addCalendarDays,
  effectiveRequirements,
  isGuaranteed,
  PackageRequirementsSchema,
  AgencyFilterCriteriaSchema,
  filterMismatches,
  romeInstant,
  VerificationChecksSchema,
  type QuoteData,
} from "@astax/shared/domain";
import { dbDateToCalendarDate, formatDateTime, romeCalendarDate } from "@astax/shared/format";
import { can } from "@astax/shared/permissions";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import { OffersService } from "../auctions/offers.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { storedAniaView } from "../verification/ania-view.js";
import { agencyRequestView, agencySheet } from "./agency-view.js";
import { joinOpenAuction, mayJoin } from "../auctions/open-auction.js";
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
  // Dan, 2026-10-29: every document of the customer, the identity card too.
  "IDENTITY_DOCUMENT",
  "OTHER",
] as const;
type AgencyDocumentKind = (typeof AGENCY_DOCUMENT_KINDS)[number];

export type IncomingState =
  "NEW" | "CLAIMED_BY_ME" | "CLAIMED_BY_COLLEAGUE" | "OFFERED" | "DECLINED";

export interface IncomingFilters {
  vehicleType?: string;
  province?: string;
  state?: IncomingState;
  /** «Partecipa all'asta» (docs/piano-agenzie.md B): open or closed auctions. */
  auction?: "OPEN" | "CLOSED";
  /** Open auctions closing within these hours. */
  closesWithinHours?: number;
  packageCode?: string;
  /** ADR 0014: only the requests of the brokers' lots sent without documents. */
  withoutDocuments?: "1";
  /** Dan, 2026-10-29: the filters of «I miei filtri», by hand. */
  cuClassMin?: number;
  cuClassMax?: number;
  maxClaims?: number;
  driverAgeMin?: number;
  driverAgeMax?: number;
  /** «Applica i miei filtri»: the saved filters of the agency and of the member (VIS-06). */
  mine?: "1";
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

  /**
   * The invitation of the agency and its request, within the member's filters
   * (VIS-06). ADR 0024: an open auction the agency was not emailed about is
   * joined on its first opening.
   */
  private async invited(tx: DbTransaction, auth: AuthContext, auctionId: string) {
    const m = this.agency(auth);
    const found = await tx.invitation.findUnique({
      where: { auctionId_organizationId: { auctionId, organizationId: m.organizationId } },
      include: { auction: true },
    });
    const auction = found
      ? null
      : await asSystem(tx, () => tx.auction.findUnique({ where: { id: auctionId } }));
    const invitation =
      found ??
      (auction ? await joinOpenAuction(tx, auction, m.organizationId, this.clock.now()) : null);
    if (!invitation) return null;
    const request = await asSystem(tx, () =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: invitation.auction.quoteRequestId } }),
    );
    const scope = await this.offers.memberScope(tx, auth);
    if (!this.offers.fitsScope(scope, request, invitation.auction.openedAt)) return null;
    return { invitation, auction: invitation.auction, request };
  }

  /** The saved filters that apply to the member: the agency's, and the member's own (VIS-06). */
  private async savedCriteria(tx: DbTransaction, auth: AuthContext) {
    const m = this.agency(auth);
    const [agency, member] = await Promise.all([
      tx.agencyFilter.findUnique({ where: { organizationId: m.organizationId } }),
      tx.memberFilter.findUnique({ where: { membershipId: m.id } }),
    ]);
    return [agency?.criteria, member?.criteria].flatMap((c) => {
      const parsed = AgencyFilterCriteriaSchema.safeParse(c);
      return c && parsed.success ? [parsed.data] : [];
    });
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
  /**
   * «Profilo» of the agency (Dan, 2026-10-21, docs/piano-agenzie.md D): the
   * agency's data, its mandates, the professional liability policy and the
   * team, for every member; the IBAN only masked.
   */
  async profile(auth: AuthContext) {
    const m = auth.membership;
    if (!m || m.organizationType !== "AGENCY") return this.denied(auth, "AgencyArea", "profile");
    return withContext(this.db, auth.db, async (tx) => {
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: m.organizationId },
      });
      const [mandates, members] = await Promise.all([
        tx.agencyMandate.findMany({
          where: { organizationId: m.organizationId },
          include: { company: { select: { name: true } } },
        }),
        tx.membership.count({ where: { organizationId: m.organizationId, status: "ACTIVE" } }),
      ]);
      const address = organization.address as {
        street?: string;
        postalCode?: string;
        municipalityIstat?: string;
        province?: string;
      } | null;
      const municipality = address?.municipalityIstat
        ? await tx.municipality.findUnique({ where: { istatCode: address.municipalityIstat } })
        : null;
      const iban = organization.ibanEnc ? this.cipher.decrypt(organization.ibanEnc) : null;
      return {
        legalName: organization.legalName,
        vatNumber: organization.vatNumber,
        ruiNumber: organization.ruiNumber,
        ruiSection: organization.ruiSection,
        pec: organization.pec,
        address: address
          ? {
              street: address.street ?? "",
              postalCode: address.postalCode ?? "",
              municipality: municipality?.name ?? "",
              province: address.province ?? "",
            }
          : null,
        iban: iban ? `${iban.slice(0, 4)} •••• ${iban.slice(-4)}` : null,
        status: organization.status,
        profInsuranceExpiresOn: organization.profInsuranceExpiresOn
          ? dbDateToCalendarDate(organization.profInsuranceExpiresOn)
          : null,
        mandates: mandates
          .map((x) => ({ company: x.company.name, verified: x.verifiedAt !== null }))
          .sort((a, b) => a.company.localeCompare(b.company)),
        activeMembers: members,
        role: m.role,
      };
    });
  }

  async incoming(auth: AuthContext, filters: IncomingFilters) {
    const m = auth.membership;
    // Rule 4: a member of another kind of organization is refused and logged.
    if (!m || m.organizationType !== "AGENCY") return this.denied(auth, "AgencyArea", "requests");
    return withContext(this.db, auth.db, async (tx) => {
      const invitations = await tx.invitation.findMany({
        where: { organizationId: m.organizationId },
        include: { auction: true },
        orderBy: { invitedAt: "desc" },
        take: 200,
      });
      // ADR 0024 (Dan, 2026-10-29): every open auction the agency may join, too.
      const others = await asSystem(tx, () =>
        tx.auction.findMany({
          where: {
            status: "OPEN",
            kind: { not: "RECONFIRMATION" },
            id: { notIn: invitations.map((i) => i.auctionId) },
          },
          orderBy: { scheduledCloseAt: "asc" },
          take: 200,
        }),
      );
      const joinable = [];
      for (const auction of others) {
        if (await mayJoin(tx, auction, m.organizationId)) joinable.push(auction);
      }
      const all = [
        ...invitations,
        ...joinable.map((auction) => ({ auctionId: auction.id, auction, invitation: null })),
      ].map((x) =>
        "invitation" in x ? x : { auctionId: x.auctionId, auction: x.auction, invitation: x },
      );
      const requests = await asSystem(tx, () =>
        tx.quoteRequest.findMany({
          where: { id: { in: all.map((i) => i.auction.quoteRequestId) } },
        }),
      );
      const saved = filters.mine ? await this.savedCriteria(tx, auth) : [];
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
      const now = this.clock.now();
      const { "agency.dashboard.closingSoonMinutes": soonMinutes } = await settingsAt(
        tx,
        ["agency.dashboard.closingSoonMinutes"],
        now,
      );
      const live = new Map(
        await Promise.all(
          all
            .filter((i) => i.auction.status === "OPEN")
            .map(async (i) => [i.auctionId, await auctionWorkingTime(tx, i.auction, now)] as const),
        ),
      );
      const rows = all.flatMap((i) => {
        const r = requests.find((q) => q.id === i.auction.quoteRequestId);
        if (!r || !this.offers.fitsScope(scope, r, i.auction.openedAt)) return [];
        if (filters.mine) {
          const facts = filterableRequest(r, i.auction.openedAt);
          if (!facts || saved.some((c) => filterMismatches(c, facts).length > 0)) return [];
        }
        const claim = claims.find((c) => c.auctionId === i.auctionId);
        const offer = offers.find((o) => o.auctionId === i.auctionId && o.status !== "WITHDRAWN");
        const holder = users.find((u) => u.id === claim?.userId);
        const state = i.invitation
          ? this.state(i.invitation, auth, claim, offer !== undefined)
          : "NEW";
        const time = live.get(i.auctionId) ?? null;
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
            startMode: r.startMode,
            minValidityDays: r.minValidityDays,
            minGuaranteeDate: dbDateToCalendarDate(i.auction.minGuaranteeDate),
            auctionStatus: i.auction.status,
            scheduledCloseAt: i.auction.scheduledCloseAt.toISOString(),
            state,
            // P5 radar: the working time left, from the server, and whether it closes
            // within the «closing soon» minutes with nothing sent yet.
            live: time,
            urgent:
              time !== null &&
              state !== "OFFERED" &&
              state !== "DECLINED" &&
              time.workingSecondsLeft <= soonMinutes * 60,
            claimedBy: holder ? `${holder.firstName} ${holder.lastName}`.trim() : null,
            elsewhere: elsewhere.get(i.auctionId) ?? null,
            offer: offer ? { id: offer.id, status: offer.status, version: offer.version } : null,
            withoutDocuments: r.withoutDocuments,
          },
        ];
      });
      const closesBy = filters.closesWithinHours
        ? new Date(now.getTime() + filters.closesWithinHours * 3_600_000).toISOString()
        : null;
      return rows
        .filter((row) => !filters.vehicleType || row.vehicleType === filters.vehicleType)
        .filter((row) => !filters.province || row.province === filters.province)
        .filter((row) => !filters.state || row.state === filters.state)
        .filter(
          (row) =>
            !filters.auction || (filters.auction === "OPEN") === (row.auctionStatus === "OPEN"),
        )
        .filter(
          (row) => !closesBy || (row.auctionStatus === "OPEN" && row.scheduledCloseAt <= closesBy),
        )
        .filter((row) => !filters.packageCode || row.packageCode === filters.packageCode)
        .filter((row) => !filters.withoutDocuments || row.withoutDocuments)
        .filter(
          (row) =>
            row.cuClass === null ||
            ((filters.cuClassMin === undefined || row.cuClass >= filters.cuClassMin) &&
              (filters.cuClassMax === undefined || row.cuClass <= filters.cuClassMax)),
        )
        .filter(
          (row) => filters.maxClaims === undefined || (row.claimsLast5y ?? 0) <= filters.maxClaims,
        )
        .filter((row) => {
          const age = row.youngestDriverAge;
          return (
            age === null ||
            ((filters.driverAgeMin === undefined || age >= filters.driverAgeMin) &&
              (filters.driverAgeMax === undefined || age <= filters.driverAgeMax))
          );
        })
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
    // Rule 4: a refusal to a member of another kind of organization is logged too.
    if (auth.membership?.organizationType !== "AGENCY") {
      return this.denied(auth, "Auction", auctionId);
    }
    const m = this.agency(auth);
    const found = await withContext(this.db, auth.db, async (tx) => {
      const target = await this.invited(tx, auth, auctionId);
      if (!target) return null;
      const { invitation, auction, request } = target;
      const now = this.clock.now();
      const quoteData = await this.quoteDataOf(tx, request);
      // Dan, 2026-10-28: the ANIA data the back office confirmed with the approval.
      const confirmed = await asSystem(tx, () =>
        tx.verification.findFirst({
          where: { quoteRequestId: request.id, decision: "APPROVED" },
          orderBy: { round: "desc" },
          select: { aniaEnc: true, aniaReadAt: true, checks: true },
        }),
      );
      const stored =
        confirmed?.aniaEnc && confirmed.aniaReadAt
          ? await storedAniaView(
              tx,
              this.cipher,
              { aniaEnc: confirmed.aniaEnc, aniaReadAt: confirmed.aniaReadAt },
              now,
            )
          : null;
      // Dan, 2026-10-29: no owner's name before the purchase, no cover expiry.
      const ania = stored ? { ...stored, sheet: agencySheet(stored.sheet) } : null;
      const checks = VerificationChecksSchema.safeParse(confirmed?.checks ?? {});
      const quoteType = (checks.success ? checks.data.QUOTE_TYPE?.value : undefined) ?? null;
      // The system read on its own: it must not overlap the agency's queries.
      const documents = await asSystem(tx, () =>
        tx.document.findMany({
          where: {
            quoteRequestId: request.id,
            deletedAt: null,
            kind: { in: [...AGENCY_DOCUMENT_KINDS] },
          },
          orderBy: { createdAt: "asc" },
        }),
      );
      const [claim, offer, pkg, mandates] = await Promise.all([
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
      // ADR 0015, answer 3B: not the companies of the agency that requested the quote.
      const excluded = (
        await asSystem(tx, () => requesterExclusions(tx, request.ownerOrganizationId))
      ).companies;
      const products = (
        await tx.insuranceProduct.findMany({
          where: { organizationId: m.organizationId, active: true },
        })
      ).filter((p) => !excluded.includes(p.companyId));
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
      // GAR-07, proposal C: in a reconfirmation, the agency's offer of the last
      // closed round, to confirm (same premium) or update; plain since that closing.
      const previous =
        auction.kind === "RECONFIRMATION"
          ? await tx.offer.findFirst({
              where: {
                organizationId: m.organizationId,
                status: "EXPIRED",
                auction: { quoteRequestId: request.id, status: "CLOSED" },
              },
              orderBy: { auction: { round: "desc" } },
            })
          : null;
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
        // ASTA-02: the working time from the server, for the ring.
        live: auction.status === "OPEN" ? await auctionWorkingTime(tx, auction, now) : null,
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
        request: await agencyRequestView(tx, quoteData),
        quoteType,
        ania,
        package: pkg
          ? {
              code: pkg.packageCode,
              name: pkg.package.name,
              // Dan, 2026-10-21: for «CUSTOM» only the coverages the customer chose.
              requirements: effectiveRequirements(
                pkg.packageCode,
                PackageRequirementsSchema.parse(pkg.requirements),
                request.chosenCoverages,
              ),
            }
          : null,
        companies: mandates
          .filter((x) => !excluded.includes(x.companyId))
          .map((x) => ({ id: x.companyId, name: x.company.name })),
        products: products.map((p) => ({ id: p.id, companyId: p.companyId, name: p.name })),
        documents: documents.map((d) => ({ id: d.id, kind: d.kind, driverIndex: d.driverIndex })),
        previousOffer:
          previous?.annualGrossPremiumCents != null && previous.guaranteeUntil
            ? {
                annualGrossPremiumCents: previous.annualGrossPremiumCents,
                companyId: previous.companyId,
                productId: previous.productId,
                coverage: previous.coverage,
                notes: previous.notes,
                guaranteeUntil: dbDateToCalendarDate(previous.guaranteeUntil),
                hasPdf: previous.pdfDocumentId !== null,
              }
            : null,
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
    if (auth.membership?.organizationType !== "AGENCY") {
      return this.denied(auth, "Document", documentId);
    }
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
    if (auth.membership?.organizationType !== "AGENCY") {
      return this.denied(auth, "AgencyArea", "dashboard");
    }
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
      const settings = await settingsAt(
        tx,
        ["agency.dashboard.statsDays", "agency.dashboard.closingSoonMinutes"],
        new Date(now),
      );
      // Calendar days in Rome (rule 6): from the start of the first of them.
      const since = romeInstant(
        addCalendarDays(romeCalendarDate(new Date(now)), -settings["agency.dashboard.statsDays"]),
        "00:00",
      );
      const soon = settings["agency.dashboard.closingSoonMinutes"] * 60_000;
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
            // The requests the agency declined are no longer its business.
            (r) =>
              r.state !== "OFFERED" &&
              r.state !== "DECLINED" &&
              Date.parse(r.scheduledCloseAt) - now <= soon,
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
      // BC-04: the own copies of the sealed offers, all at once (one audit entry).
      const copies = await this.offers.readOwnCopies(
        tx,
        auth,
        offers.filter((o) => o.annualGrossPremiumCents === null && o.status !== "WITHDRAWN"),
      );
      return { offers, requests, companies, users, copies };
    });
    const out = [];
    for (const o of rows.offers) {
      const payload = rows.copies.get(o.id);
      const copy = payload ? { offer: payload } : null;
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
        // GAR-08: still binding (by the server's clock): the «offerte aperte».
        guaranteed:
          o.status === "AWAITING_CUSTOMER" &&
          o.guaranteeUntil !== null &&
          isGuaranteed(dbDateToCalendarDate(o.guaranteeUntil), this.clock.now()),
      });
    }
    return out;
  }

  /**
   * «Da emettere» (spec 04, PAG-02, VIS-02): the requests the agency won and
   * the customer paid, with the customer's contacts, which reach the agency
   * only now. Every reading is logged (rule 4).
   */
  async toIssue(auth: AuthContext) {
    const m = this.agency(auth);
    return withContext(this.db, auth.db, async (tx) => {
      const won = await tx.offer.findMany({
        where: { organizationId: m.organizationId, status: "WINNING" },
        include: { auction: true },
      });
      const rows = [];
      for (const offer of won) {
        const data = await asSystem(tx, async () => {
          const request = await tx.quoteRequest.findUniqueOrThrow({
            where: { id: offer.auction.quoteRequestId },
            include: { customer: true },
          });
          if (request.status !== "IN_ISSUANCE") return null;
          const acceptance = await tx.acceptance.findFirst({
            where: { quoteRequestId: request.id, offerId: offer.id, status: "PAID" },
          });
          if (!acceptance) return null;
          const requester = await tx.user.findUniqueOrThrow({
            where: { id: request.requesterUserId },
          });
          const contacts =
            request.channel === "BROKER" && request.customer
              ? { emailEnc: request.customer.emailEnc, phoneEnc: request.customer.phoneEnc }
              : { emailEnc: requester.emailEnc, phoneEnc: requester.phoneEnc };
          return { request, acceptance, contacts };
        });
        if (!data) continue;
        const quoteData = await this.quoteDataOf(tx, data.request);
        const holder = quoteData.policyHolder;
        rows.push({
          auctionId: offer.auctionId,
          requestId: data.request.id,
          code: data.request.code,
          holder:
            holder.kind === "COMPANY"
              ? holder.companyName
              : `${holder.givenName} ${holder.surname}`,
          vehicle: `${quoteData.vehicle.make} ${quoteData.vehicle.model} ${quoteData.vehicle.plate}`,
          startDate: data.request.startDate ? dbDateToCalendarDate(data.request.startDate) : null,
          premiumCents: data.acceptance.premiumCents,
          paidAt: data.acceptance.paidAt?.toISOString() ?? null,
          issuanceDeadlineAt: data.acceptance.issuanceDeadlineAt?.toISOString() ?? null,
          // VIS-02: the contacts, only after the payment.
          email: data.contacts.emailEnc ? this.cipher.decrypt(data.contacts.emailEnc) : null,
          phone: data.contacts.phoneEnc ? this.cipher.decrypt(data.contacts.phoneEnc) : null,
        });
        await this.audit.inTransaction(tx, actorOf(auth), {
          action: "CUSTOMER_CONTACTS_VIEWED",
          targetType: "QuoteRequest",
          targetId: data.request.id,
        });
      }
      return rows.sort((a, b) =>
        (a.issuanceDeadlineAt ?? "").localeCompare(b.issuanceDeadlineAt ?? ""),
      );
    });
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
      // VIS-06: the colleague must see the request, or the claim would block everyone.
      const scope = await this.offers.memberScopeOf(tx, member);
      if (!this.offers.fitsScope(scope, target.request, auction.openedAt)) {
        throw new ProblemError("CONFLICT", "The request is outside the member's filters", [
          { path: "membershipId", issue: "OUTSIDE_MEMBER_FILTERS" },
        ]);
      }
      // OFF-02: one offer per person per round, also after a released claim.
      const offeredElsewhere = await asSystem(tx, () =>
        tx.offer.count({
          where: {
            auctionId,
            userId: member.userId,
            status: { not: "WITHDRAWN" },
            organizationId: { not: m.organizationId },
          },
        }),
      );
      // OFF-02: the colleague already holds a claim on this auction for another agency.
      const claimedElsewhere = await asSystem(tx, () =>
        tx.claim.count({
          where: {
            auctionId,
            userId: member.userId,
            releasedAt: null,
            organizationId: { not: m.organizationId },
          },
        }),
      );
      if (claimedElsewhere > 0) {
        throw new ProblemError("CONFLICT", "The person already works on this auction", [
          { path: "claim", issue: "ONE_PERSON_ONE_AGENCY" },
        ]);
      }
      if (offeredElsewhere > 0) {
        throw new ProblemError("CONFLICT", "The person already offered for another agency", [
          { path: "membershipId", issue: "ONE_PERSON_ONE_OFFER" },
        ]);
      }
      const now = this.clock.now();
      await tx.claim.updateMany({
        where: { auctionId, organizationId: m.organizationId, releasedAt: null },
        data: { releasedAt: now, releasedByUserId: auth.userId },
      });
      // A claim for a colleague: a system step, after the claim.override check above.
      // The savepoint sits inside the system step, so that a refused row is rolled
      // back before the step restores its flag and the original error is kept.
      const taken = await asSystem(tx, async () => {
        await tx.$executeRaw`SAVEPOINT claim_assign`;
        try {
          await tx.claim.create({
            data: {
              auctionId,
              organizationId: m.organizationId,
              membershipId: member.id,
              userId: member.userId,
              claimedAt: now,
            },
          });
          await tx.$executeRaw`RELEASE SAVEPOINT claim_assign`;
          return false;
        } catch (error) {
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT claim_assign`;
          // Only the unique index of a person's claim (a claim made at the same
          // instant elsewhere, after the checks above) means OFF-02.
          if (!isUniqueViolation(error)) throw error;
          return true;
        }
      });
      if (taken) {
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
