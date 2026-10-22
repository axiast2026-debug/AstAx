import { errorForLog, type Logger } from "@astax/shared/logging";
import { randomUUID } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import { decryptFile, encryptFile, KMS_KEYS, seal, wipe, type KmsPort } from "@astax/adapters/kms";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import {
  asSystem,
  filterableRequest,
  looksLikePdf,
  settingsAt,
  withContext,
  type Auction,
  type DbClient,
  type DbTransaction,
  type Offer,
  type QuoteRequest,
  requestRequirements,
  requesterExclusions,
} from "@astax/db";
import {
  AgencyFilterCriteriaSchema,
  coverageShortfalls,
  filterMismatches,
  guaranteeDateAccepted,
  noteProblems,
  OfferPayloadSchema,
  type AgencyFilterCriteria,
  type OfferPayload,
} from "@astax/shared/domain";
import { dbDateToCalendarDate } from "@astax/shared/format";
import { can } from "@astax/shared/permissions";
import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB, KMS, OBJECT_STORAGE, LOGGER } from "../infra/tokens.js";
import { RealtimeHub } from "../realtime/realtime-hub.js";

/** OFF-04: the content plus the explicit confirmation that the offer is binding. */
export const OfferInputSchema = OfferPayloadSchema.extend({ binding: z.literal(true) });

/** JSON with the keys in order, to compare two coverages whatever their key order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export interface PdfInput {
  body: Uint8Array;
  contentType: string;
}

interface OwnerCopy {
  payload: OfferPayload;
  pdfKey: string | null;
  /** Base64 key of the encrypted PDF, readable only through the owner key. */
  pdfDataKey: string | null;
}

const text = new TextEncoder();

/**
 * Offers during the auction (docs/busta-chiusa.md, steps 2-4). The content is
 * checked in memory, sealed with the auction's public key, and never written
 * or logged in clear (BC-02, BC-07). The agency reads its own copy, under a
 * separate key, and each reading is logged (BC-04). Everyone else gets 403
 * and SEALED_BID_ACCESS_DENIED in the log (BC-01).
 */
/** Owner copies decrypted at the same time (KMS calls in parallel, a few at a time). */
const OWNER_COPY_PARALLEL = 8;

@Injectable()
export class OffersService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(KMS) private readonly kms: KmsPort,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(RealtimeHub) private readonly realtime: RealtimeHub,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  private agency(auth: AuthContext) {
    const m = auth.membership;
    if (!m || m.organizationType !== "AGENCY") throw new ProblemError("FORBIDDEN");
    return m;
  }

  /** BC-01: a reading refused, with the event in the log. */
  async sealedDenied(auth: AuthContext, targetType: string, targetId: string): Promise<never> {
    await this.audit.record(actorOf(auth), {
      action: "SEALED_BID_ACCESS_DENIED",
      targetType,
      targetId,
    });
    throw new ProblemError("SEALED_BID");
  }

  /**
   * BC-05: the row lock of the auction, the same the closing takes; then the
   * auction must be open and the server time before the closing.
   */
  private async lockOpen(
    tx: DbTransaction,
    auth: AuthContext,
    auctionId: string,
  ): Promise<Auction> {
    // Only an auction the caller may see (its agency is invited) is locked.
    const visible = await tx.auction.findUnique({ where: { id: auctionId }, select: { id: true } });
    if (visible) {
      await asSystem(
        tx,
        () => tx.$queryRaw`SELECT 1 FROM "Auction" WHERE "id" = ${auctionId}::uuid FOR UPDATE`,
      );
    }
    const auction = visible ? await tx.auction.findUnique({ where: { id: auctionId } }) : null;
    if (!auction) {
      await this.audit.record(actorOf(auth), {
        action: "ACCESS_DENIED",
        targetType: "Auction",
        targetId: auctionId,
      });
      throw new ProblemError("NOT_FOUND");
    }
    if (auction.status !== "OPEN" || this.clock.now() >= auction.scheduledCloseAt) {
      throw new ProblemError("AUCTION_CLOSED");
    }
    return auction;
  }

  /**
   * VIS-06: when the agency distributes the requests by the members' filters,
   * an operator works only the requests inside their own filters. "all" for
   * everyone else; null for an operator without a valid filter.
   */
  async memberScope(
    tx: DbTransaction,
    auth: AuthContext,
  ): Promise<AgencyFilterCriteria | "all" | null> {
    return this.memberScopeOf(tx, this.agency(auth));
  }

  /** VIS-06: what one member of the agency sees (the caller, or a colleague given a claim). */
  async memberScopeOf(
    tx: DbTransaction,
    m: { id: string; organizationId: string; role: string },
  ): Promise<AgencyFilterCriteria | "all" | null> {
    if (m.role !== "OPERATOR") return "all";
    const capacity = await tx.agencyCapacity.findUnique({
      where: { organizationId: m.organizationId },
    });
    if (capacity?.distribution !== "BY_MEMBER_FILTERS") return "all";
    const filter = await tx.memberFilter.findUnique({ where: { membershipId: m.id } });
    const criteria = filter ? AgencyFilterCriteriaSchema.safeParse(filter.criteria) : null;
    return criteria?.success ? criteria.data : null;
  }

  fitsScope(
    scope: AgencyFilterCriteria | "all" | null,
    request: QuoteRequest,
    openedAt: Date,
  ): boolean {
    if (scope === "all") return true;
    if (scope === null) return false;
    const filterable = filterableRequest(request, openedAt);
    return filterable !== null && filterMismatches(scope, filterable).length === 0;
  }

  /**
   * VIS-06 checked in its own short transaction, before the auction is locked:
   * a refusal is logged without holding the lock (no second connection under it).
   */
  private async checkMemberFilters(
    auth: AuthContext,
    target: { auctionId?: string; offerId?: string },
  ) {
    const fits = await withContext(this.db, auth.db, async (tx) => {
      const auctionId =
        target.auctionId ??
        (await tx.offer.findUnique({ where: { id: target.offerId ?? "" } }))?.auctionId;
      const auction = auctionId ? await tx.auction.findUnique({ where: { id: auctionId } }) : null;
      if (!auction) return { ok: true, auctionId };
      const request = await asSystem(tx, () =>
        tx.quoteRequest.findUniqueOrThrow({ where: { id: auction.quoteRequestId } }),
      );
      return {
        ok: this.fitsScope(await this.memberScope(tx, auth), request, auction.openedAt),
        auctionId,
      };
    });
    if (!fits.ok) {
      await this.audit.record(actorOf(auth), {
        action: "ACCESS_DENIED",
        targetType: "Auction",
        targetId: fits.auctionId ?? null,
      });
      throw new ProblemError("NOT_FOUND");
    }
  }

  /** OFF-03: the claim of the agency is the user's; otherwise owner or supervisor. */
  private async ensureClaim(tx: DbTransaction, auth: AuthContext, auction: Auction) {
    const m = this.agency(auth);
    const claim = await tx.claim.findFirst({
      where: { auctionId: auction.id, organizationId: m.organizationId, releasedAt: null },
    });
    if (claim) {
      if (claim.userId !== auth.userId && !can(auth.actor, "claim.override")) {
        throw new ProblemError("CLAIMED_BY_COLLEAGUE");
      }
      return;
    }
    await this.createClaim(tx, auth, auction);
  }

  private async createClaim(tx: DbTransaction, auth: AuthContext, auction: Auction) {
    const m = this.agency(auth);
    try {
      await tx.$executeRaw`SAVEPOINT claim_insert`;
      await tx.claim.create({
        data: {
          auctionId: auction.id,
          organizationId: m.organizationId,
          membershipId: m.id,
          userId: auth.userId,
          claimedAt: this.clock.now(),
        },
      });
      await tx.$executeRaw`RELEASE SAVEPOINT claim_insert`;
    } catch {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT claim_insert`;
      const colleague = await tx.claim.findFirst({
        where: { auctionId: auction.id, organizationId: m.organizationId, releasedAt: null },
      });
      if (colleague) throw new ProblemError("CLAIMED_BY_COLLEAGUE");
      // OFF-02: the same person already works on this auction for another agency.
      throw new ProblemError("CONFLICT", "The person already works on this auction", [
        { path: "claim", issue: "ONE_PERSON_ONE_AGENCY" },
      ]);
    }
    await tx.invitation.updateMany({
      where: {
        auctionId: auction.id,
        organizationId: m.organizationId,
        status: { in: ["INVITED", "VIEWED"] },
      },
      data: { status: "CLAIMED" },
    });
  }

  private async invitation(tx: DbTransaction, auth: AuthContext, auction: Auction) {
    const m = this.agency(auth);
    const invitation = await tx.invitation.findUnique({
      where: {
        auctionId_organizationId: { auctionId: auction.id, organizationId: m.organizationId },
      },
    });
    if (!invitation || invitation.status === "DECLINED") throw new ProblemError("NOT_FOUND");
    return invitation;
  }

  /** OFF-04, OFF-05, VIS-11 and the mandates: checked in memory before sealing. */
  private async validate(
    tx: DbTransaction,
    auth: AuthContext,
    auction: Auction,
    raw: unknown,
    pdf: PdfInput | null,
    pdfRequired: boolean,
  ) {
    const m = this.agency(auth);
    const parsed = OfferInputSchema.safeParse(raw);
    if (!parsed.success) throw ProblemError.fromZod(parsed.error);
    const payload: OfferPayload = {
      annualGrossPremiumCents: parsed.data.annualGrossPremiumCents,
      companyId: parsed.data.companyId,
      productId: parsed.data.productId,
      coverage: parsed.data.coverage,
      guaranteeUntil: parsed.data.guaranteeUntil,
      notes: parsed.data.notes,
    };
    const now = this.clock.now();
    const settings = await settingsAt(tx, ["notes.maxChars", "documents.maxUploadMb"], now);
    const errors: { path: string; issue: string }[] = [];
    const [mandate, product] = await Promise.all([
      tx.agencyMandate.findFirst({
        where: {
          organizationId: m.organizationId,
          companyId: payload.companyId,
          verifiedAt: { not: null },
        },
      }),
      tx.insuranceProduct.findFirst({
        where: {
          id: payload.productId,
          organizationId: m.organizationId,
          companyId: payload.companyId,
          active: true,
        },
      }),
    ]);
    if (!mandate) errors.push({ path: "companyId", issue: "COMPANY_NOT_MANDATED" });
    // ADR 0015, answer 3B: never with a company of the agency that requested the quote.
    const out = await asSystem(tx, async () => {
      const request = await tx.quoteRequest.findUniqueOrThrow({
        where: { id: auction.quoteRequestId },
      });
      return requesterExclusions(tx, request.ownerOrganizationId);
    });
    if (out.companies.includes(payload.companyId)) {
      errors.push({ path: "companyId", issue: "COMPANY_OF_THE_REQUESTER" });
    }
    if (!product) errors.push({ path: "productId", issue: "PRODUCT_NOT_FOUND" });
    if (
      !guaranteeDateAccepted(payload.guaranteeUntil, dbDateToCalendarDate(auction.minGuaranteeDate))
    ) {
      errors.push({ path: "guaranteeUntil", issue: "GUARANTEE_BEFORE_MINIMUM" });
    }
    for (const problem of payload.notes
      ? noteProblems(payload.notes, settings["notes.maxChars"])
      : []) {
      errors.push({ path: "notes", issue: `NOTES_${problem}` });
    }
    if (pdf) {
      if (pdf.contentType !== "application/pdf" || !looksLikePdf(pdf.body)) {
        errors.push({ path: "pdf", issue: "NOT_A_PDF" });
      }
      if (pdf.body.length > settings["documents.maxUploadMb"] * 1024 * 1024)
        errors.push({ path: "pdf", issue: "TOO_LARGE" });
    } else if (pdfRequired) {
      errors.push({ path: "pdf", issue: "PDF_REQUIRED" });
    }
    if (errors.length > 0) throw new ProblemError("VALIDATION_FAILED", undefined, errors);
    return payload;
  }

  /**
   * OFF-06: the items of the package the declared coverage does not reach.
   * The offer is accepted, the agency is warned at once, and the closing
   * excludes it with the reason.
   */
  private async coverageWarnings(tx: DbTransaction, auction: Auction, payload: OfferPayload) {
    const request = await asSystem(tx, () =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: auction.quoteRequestId } }),
    );
    const requirements = await requestRequirements(tx, request, auction.openedAt);
    if (!requirements) return [];
    const legal = (await settingsAt(tx, ["rca.legalMinimums"], auction.openedAt))[
      "rca.legalMinimums"
    ];
    return coverageShortfalls(requirements, payload.coverage, {
      rcaBodilyInjuryPerClaimEur: legal.bodilyInjuryPerClaimEur,
      rcaPropertyDamagePerClaimEur: legal.propertyDamagePerClaimEur,
    });
  }

  /** Seals the content and the PDF with the auction's key, and makes the owner copy. */
  private async sealAll(
    auction: Auction,
    organizationId: string,
    offerId: string,
    payload: OfferPayload,
    pdf: PdfInput | null,
    previous: OwnerCopy | null,
  ) {
    const sealedPayload = await seal(auction.publicKey, text.encode(JSON.stringify(payload)));
    let pdfKey = previous?.pdfKey ?? null;
    let pdfDataKey = previous?.pdfDataKey ?? null;
    let sealedPdfDataKey: string | null = null;
    if (pdf) {
      const file = await encryptFile(pdf.body);
      pdfKey = `sealed/${randomUUID()}`;
      await this.storage.put({
        key: pdfKey,
        body: file.encrypted,
        contentType: "application/octet-stream",
      });
      pdfDataKey = Buffer.from(file.key).toString("base64");
      sealedPdfDataKey = await seal(auction.publicKey, file.key);
      await wipe(file.key);
    }
    const copy: OwnerCopy = { payload, pdfKey, pdfDataKey };
    const ownerCopy = await this.kms.encrypt(
      KMS_KEYS.offerOwner,
      text.encode(JSON.stringify(copy)),
      {
        purpose: "offer-owner",
        organizationId,
        offerId,
      },
    );
    return { sealedPayload, sealedPdfKey: pdfKey, sealedPdfDataKey, ownerCopy };
  }

  async claim(auth: AuthContext, auctionId: string) {
    await this.checkMemberFilters(auth, { auctionId });
    const result = await withContext(this.db, auth.db, async (tx) => {
      const auction = await this.lockOpen(tx, auth, auctionId);
      await this.invitation(tx, auth, auction);
      await this.ensureClaim(tx, auth, auction);
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "AUCTION_CLAIMED",
        targetType: "Auction",
        targetId: auctionId,
      });
      return { claimed: true };
    });
    return result;
  }

  async release(auth: AuthContext, auctionId: string) {
    const m = this.agency(auth);
    return withContext(this.db, auth.db, async (tx) => {
      const auction = await this.lockOpen(tx, auth, auctionId);
      const claim = await tx.claim.findFirst({
        where: { auctionId: auction.id, organizationId: m.organizationId, releasedAt: null },
      });
      if (!claim) return { released: false };
      if (claim.userId !== auth.userId && !can(auth.actor, "claim.override")) {
        throw new ProblemError("CLAIMED_BY_COLLEAGUE");
      }
      await tx.claim.update({
        where: { id: claim.id },
        data: { releasedAt: this.clock.now(), releasedByUserId: auth.userId },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "AUCTION_CLAIM_RELEASED",
        targetType: "Auction",
        targetId: auctionId,
      });
      return { released: true };
    });
  }

  /** OFF-08: «non interessato», with an optional reason from the list. */
  async decline(auth: AuthContext, auctionId: string, reasonCode: string | undefined) {
    const m = this.agency(auth);
    await this.checkMemberFilters(auth, { auctionId });
    return withContext(this.db, auth.db, async (tx) => {
      const auction = await this.lockOpen(tx, auth, auctionId);
      const invitation = await this.invitation(tx, auth, auction);
      if (reasonCode) {
        const known = await tx.listValue.findFirst({
          where: { listKey: "declineReason", code: reasonCode, active: true },
        });
        if (!known)
          throw new ProblemError("VALIDATION_FAILED", undefined, [
            { path: "reasonCode", issue: "NOT_IN_LIST:declineReason" },
          ]);
      }
      const active = await tx.offer.count({
        where: { auctionId, organizationId: m.organizationId, status: "SUBMITTED" },
      });
      if (active > 0) throw new ProblemError("CONFLICT", "Withdraw the offer first");
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "DECLINED", declineReason: reasonCode ?? null },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "AUCTION_DECLINED",
        targetType: "Auction",
        targetId: auctionId,
        after: { reasonCode: reasonCode ?? null },
      });
      return { declined: true };
    });
  }

  async submit(auth: AuthContext, auctionId: string, raw: unknown, pdf: PdfInput | null) {
    await this.checkMemberFilters(auth, { auctionId });
    const m = this.agency(auth);
    const result = await withContext(this.db, auth.db, async (tx) => {
      const auction = await this.lockOpen(tx, auth, auctionId);
      await this.invitation(tx, auth, auction);
      const payload = await this.validate(
        tx,
        auth,
        auction,
        raw,
        pdf,
        auction.kind !== "RECONFIRMATION",
      );
      if (!pdf) await this.reconfirmationKeepsQuote(tx, auth, auction, payload);
      await this.ensureClaim(tx, auth, auction);
      const existing = await tx.offer.findFirst({
        where: { auctionId, organizationId: m.organizationId, status: "SUBMITTED" },
      });
      if (existing)
        throw new ProblemError("CONFLICT", "The agency has an offer already: change it");
      const now = this.clock.now();
      const offerId = randomUUID();
      const sealed = await this.sealAll(auction, m.organizationId, offerId, payload, pdf, null);
      try {
        await tx.offer.createMany({
          data: [
            {
              id: offerId,
              auctionId,
              organizationId: m.organizationId,
              membershipId: m.id,
              userId: auth.userId,
              submittedAt: now,
              lastChangedAt: now,
              ...sealed,
            },
          ],
        });
      } catch {
        // OFF-02: one offer per person in the round, also for another agency.
        throw new ProblemError("CONFLICT", "One offer per person in a round", [
          { path: "offer", issue: "ONE_PERSON_ONE_OFFER" },
        ]);
      }
      await tx.invitation.updateMany({
        where: { auctionId, organizationId: m.organizationId },
        data: { status: "OFFERED" },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "OFFER_SUBMITTED",
        targetType: "Offer",
        targetId: offerId,
        after: { auctionId, version: 1 },
      });
      return {
        id: offerId,
        version: 1,
        submittedAt: now.toISOString(),
        requestId: auction.quoteRequestId,
        coverageWarnings: await this.coverageWarnings(tx, auction, payload),
      };
    });
    await this.realtime.auctionChanged(result.requestId);
    return {
      id: result.id,
      version: result.version,
      submittedAt: result.submittedAt,
      coverageWarnings: result.coverageWarnings,
    };
  }

  /**
   * The agency's own offer. A reading of anything else is a sealed bid refused
   * (BC-01); a change of an unknown offer is simply not found.
   */
  private async ownOffer(
    tx: DbTransaction,
    auth: AuthContext,
    offerId: string,
    intent: "read" | "write" = "read",
  ): Promise<Offer> {
    const m = auth.membership;
    const offer = await tx.offer.findUnique({ where: { id: offerId } });
    if (!offer || !m || offer.organizationId !== m.organizationId) {
      if (intent === "read") return this.sealedDenied(auth, "Offer", offerId);
      await this.audit.record(actorOf(auth), {
        action: "ACCESS_DENIED",
        targetType: "Offer",
        targetId: offerId,
      });
      throw new ProblemError("NOT_FOUND");
    }
    return offer;
  }

  private async readCopy(offer: Offer): Promise<OwnerCopy> {
    const plain = await this.kms.decrypt(KMS_KEYS.offerOwner, offer.ownerCopy, {
      purpose: "offer-owner",
      organizationId: offer.organizationId,
      offerId: offer.id,
    });
    return JSON.parse(new TextDecoder().decode(plain)) as OwnerCopy;
  }

  /**
   * GAR-07, proposal C, OFF-04: in a reconfirmation an answer without a new PDF
   * keeps the quote of the previous round, which the worker links at the
   * closing. Only a confirmation may do so: same premium, company and product,
   * and a previous quote to keep. Any other answer needs its own PDF.
   */
  private async reconfirmationKeepsQuote(
    tx: DbTransaction,
    auth: AuthContext,
    auction: Auction,
    payload: OfferPayload,
  ): Promise<void> {
    if (auction.kind !== "RECONFIRMATION") return;
    const m = this.agency(auth);
    const previous = await tx.offer.findFirst({
      where: {
        organizationId: m.organizationId,
        status: "EXPIRED",
        auction: { quoteRequestId: auction.quoteRequestId, status: "CLOSED" },
      },
      orderBy: { auction: { round: "desc" } },
    });
    // The kept PDF must still describe the offer: only the guarantee date may change.
    const same =
      previous !== null &&
      previous.pdfDocumentId !== null &&
      previous.annualGrossPremiumCents === payload.annualGrossPremiumCents &&
      previous.companyId === payload.companyId &&
      previous.productId === payload.productId &&
      (previous.notes ?? null) === (payload.notes ?? null) &&
      stableJson(previous.coverage) === stableJson(payload.coverage);
    if (!same) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "pdf", issue: "PDF_REQUIRED" },
      ]);
    }
  }

  /** OFF-07: a change until the closing; the previous version stays sealed. */
  async change(auth: AuthContext, offerId: string, raw: unknown, pdf: PdfInput | null) {
    await this.checkMemberFilters(auth, { offerId });
    const m = this.agency(auth);
    const result = await withContext(this.db, auth.db, async (tx) => {
      const found = await this.ownOffer(tx, auth, offerId, "write");
      const auction = await this.lockOpen(tx, auth, found.auctionId);
      const offer = await tx.offer.findUniqueOrThrow({ where: { id: offerId } });
      if (offer.status !== "SUBMITTED")
        throw new ProblemError("CONFLICT", "The offer is not active");
      await this.ensureClaim(tx, auth, auction);
      const payload = await this.validate(tx, auth, auction, raw, pdf, false);
      if (!pdf && !offer.sealedPdfKey) {
        await this.reconfirmationKeepsQuote(tx, auth, auction, payload);
      }
      const previous = await this.readCopy(offer);
      // BC-04: every decryption of the owner copy is logged.
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "OFFER_OWNER_COPY_READ",
        targetType: "Offer",
        targetId: offer.id,
        after: { part: "change" },
      });
      const sealed = await this.sealAll(
        auction,
        m.organizationId,
        offer.id,
        payload,
        pdf,
        previous,
      );
      const now = this.clock.now();
      await tx.offerVersion.createMany({
        data: [
          {
            offerId: offer.id,
            organizationId: offer.organizationId,
            version: offer.version,
            sealedPayload: offer.sealedPayload,
            sealedPdfKey: offer.sealedPdfKey,
            sealedPdfDataKey: offer.sealedPdfDataKey,
          },
        ],
      });
      // OFF-02: the offer is now the person's who changed it; one offer per person.
      try {
        await tx.$executeRaw`SAVEPOINT offer_change`;
        await tx.offer.update({
          where: { id: offer.id },
          data: {
            sealedPayload: sealed.sealedPayload,
            sealedPdfKey: sealed.sealedPdfKey,
            sealedPdfDataKey: sealed.sealedPdfDataKey ?? offer.sealedPdfDataKey,
            ownerCopy: sealed.ownerCopy,
            version: offer.version + 1,
            lastChangedAt: now,
            membershipId: m.id,
            userId: auth.userId,
          },
        });
        await tx.$executeRaw`RELEASE SAVEPOINT offer_change`;
      } catch {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT offer_change`;
        throw new ProblemError("CONFLICT", "One offer per person in a round", [
          { path: "offer", issue: "ONE_PERSON_ONE_OFFER" },
        ]);
      }
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "OFFER_CHANGED",
        targetType: "Offer",
        targetId: offer.id,
        after: { version: offer.version + 1 },
      });
      return {
        id: offer.id,
        version: offer.version + 1,
        requestId: auction.quoteRequestId,
        coverageWarnings: await this.coverageWarnings(tx, auction, payload),
      };
    });
    await this.realtime.auctionChanged(result.requestId);
    return { id: result.id, version: result.version, coverageWarnings: result.coverageWarnings };
  }

  /** OFF-07: a withdrawal until the closing. */
  async withdraw(auth: AuthContext, offerId: string) {
    this.agency(auth);
    await this.checkMemberFilters(auth, { offerId });
    const result = await withContext(this.db, auth.db, async (tx) => {
      const found = await this.ownOffer(tx, auth, offerId, "write");
      const auction = await this.lockOpen(tx, auth, found.auctionId);
      if (found.status !== "SUBMITTED")
        throw new ProblemError("CONFLICT", "The offer is not active");
      await this.ensureClaim(tx, auth, auction);
      await tx.offer.update({
        where: { id: offerId },
        data: { status: "WITHDRAWN", withdrawnAt: this.clock.now() },
      });
      await tx.invitation.updateMany({
        where: { auctionId: auction.id, organizationId: found.organizationId },
        data: { status: "CLAIMED" },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "OFFER_WITHDRAWN",
        targetType: "Offer",
        targetId: offerId,
      });
      return { requestId: auction.quoteRequestId };
    });
    await this.realtime.auctionChanged(result.requestId);
    return { id: offerId, status: "WITHDRAWN" as const };
  }

  /**
   * BC-04: the agency reads its own offer through the owner copy; a colleague's
   * only with canSeeColleagueOffers (VIS-06). Every reading is logged.
   */
  async read(auth: AuthContext, offerId: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const offer = await this.ownOffer(tx, auth, offerId);
      if (offer.userId !== auth.userId && !can(auth.actor, "offer.readColleagueDuringAuction")) {
        return this.sealedDenied(auth, "Offer", offerId);
      }
      const copy = await this.readCopy(offer);
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "OFFER_OWNER_COPY_READ",
        targetType: "Offer",
        targetId: offerId,
      });
      // P3 receipt: who sent it, by name (an agency colleague, never a contact of the customer).
      const sender = await tx.user.findUnique({
        where: { id: offer.userId },
        select: { firstName: true, lastName: true },
      });
      return {
        id: offer.id,
        auctionId: offer.auctionId,
        sentBy: sender ? `${sender.firstName} ${sender.lastName}`.trim() : null,
        status: offer.status,
        version: offer.version,
        submittedAt: offer.submittedAt.toISOString(),
        lastChangedAt: offer.lastChangedAt.toISOString(),
        exclusionReason: offer.exclusionReason,
        offer: copy.payload,
        hasPdf: copy.pdfKey !== null,
      };
    });
  }

  /**
   * BC-04, «Le mie offerte» (phase 8, load test): the agency's own copies of
   * several sealed offers at once, in the caller's transaction. Only rows of
   * the caller's organization, its own or with the colleagues' permission;
   * decrypted a few at a time in parallel; one audit entry lists them all
   * (rule 4) instead of one entry, and one transaction, per offer.
   */
  async readOwnCopies(
    tx: DbTransaction,
    auth: AuthContext,
    offers: readonly Offer[],
  ): Promise<Map<string, OwnerCopy["payload"]>> {
    const m = auth.membership;
    const colleagues = can(auth.actor, "offer.readColleagueDuringAuction");
    const allowed = offers.filter(
      (o) => m && o.organizationId === m.organizationId && (o.userId === auth.userId || colleagues),
    );
    const out = new Map<string, OwnerCopy["payload"]>();
    const unreadable: string[] = [];
    for (let i = 0; i < allowed.length; i += OWNER_COPY_PARALLEL) {
      const batch = allowed.slice(i, i + OWNER_COPY_PARALLEL);
      const copies = await Promise.all(
        batch.map((o) =>
          this.readCopy(o).catch((error: unknown) => {
            // A copy that does not open may be altered: never silent (rule 4).
            unreadable.push(o.id);
            this.logger.error({ offerId: o.id, err: errorForLog(error) }, "owner copy not opened");
            return null;
          }),
        ),
      );
      batch.forEach((o, j) => {
        const copy = copies[j];
        if (copy) out.set(o.id, copy.payload);
      });
    }
    if (m && out.size > 0) {
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "OFFER_OWNER_COPY_READ",
        targetType: "Organization",
        targetId: m.organizationId,
        after: { offerIds: [...out.keys()] },
      });
    }
    if (m && unreadable.length > 0) {
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "OFFER_OWNER_COPY_UNREADABLE",
        targetType: "Organization",
        targetId: m.organizationId,
        after: { offerIds: unreadable },
      });
    }
    return out;
  }

  async readPdf(auth: AuthContext, offerId: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const offer = await this.ownOffer(tx, auth, offerId);
      if (offer.userId !== auth.userId && !can(auth.actor, "offer.readColleagueDuringAuction")) {
        return this.sealedDenied(auth, "Offer", offerId);
      }
      const copy = await this.readCopy(offer);
      if (!copy.pdfKey || !copy.pdfDataKey) throw new ProblemError("NOT_FOUND");
      const key = new Uint8Array(Buffer.from(copy.pdfDataKey, "base64"));
      const body = await decryptFile(key, await this.storage.get(copy.pdfKey));
      await wipe(key);
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "OFFER_OWNER_COPY_READ",
        targetType: "Offer",
        targetId: offerId,
        after: { part: "pdf" },
      });
      return { body, mime: "application/pdf", fileName: "preventivo.pdf" };
    });
  }
}
