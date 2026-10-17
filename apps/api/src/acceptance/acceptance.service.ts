import { createHash, randomUUID } from "node:crypto";
import type { AiExplainerPort } from "@astax/adapters/ai-explainer";
import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { PaymentsPort } from "@astax/adapters/payments";
import type { SignaturePort } from "@astax/adapters/signature";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import {
  asSystem,
  loadWorkingCalendar,
  settingsAt,
  withContext,
  type DbClient,
  type DbTransaction,
  type QuoteRequest,
} from "@astax/db";
import {
  acceptanceBlock,
  aiTextProblems,
  bestOfferPerCompany,
  coverageImprovements,
  customerFee,
  guaranteeDaysLeft,
  OfferCoverageSchema,
  PackageRequirementsSchema,
  savingCents,
  scoreOffers,
  transitionRequest,
  type AcceptanceBlock,
  type FeeSettings,
  type QuoteData,
  type RequestStatus,
} from "@astax/shared/domain";
import { dbDateToCalendarDate, formatEuroCents, romeCalendarDate } from "@astax/shared/format";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import {
  AI_EXPLAINER,
  CLOCK,
  DB,
  FIELD_CIPHER,
  OBJECT_STORAGE,
  PAYMENTS,
  SIGNATURE,
} from "../infra/tokens.js";
import labels from "../notifications/labels.it.json" with { type: "json" };
import { requesterScope } from "../requests/request-support.js";
import { acceptancePdf } from "./documents-pdf.js";

const FEE_KEYS = [
  "fees.private.amountCents",
  "fees.private.aiSupplementCents",
  "fees.private.lowPremium.thresholdCents",
  "fees.private.lowPremium.amountCents",
  "fees.broker.amountCents",
] as const;

/** Who accepts: the private user, or the broker's customer on a link (decision 26). */
export interface Accepter {
  kind: "PRIVATE" | "LINK";
  userId: string | null;
  customerLinkId: string | null;
  /** The offers the link may show (all for the private user). */
  offerIds: string[] | null;
}

export interface PresentedRow {
  id: string;
  companyId: string;
  company: string;
  product: string;
  productId: string | null;
  packageName: string | null;
  annualGrossPremiumCents: number;
  guaranteeUntil: string;
  guaranteed: boolean;
  daysLeft: number;
  savingCents: number | null;
  coverage: unknown;
  notes: string | null;
  pdfDocumentId: string | null;
  block: AcceptanceBlock;
  feeCents: number;
  feeWithAiCents: number | null;
  lastSubmittedAt: Date;
  organizationId: string;
}

/**
 * Phase 5, the acceptance (processes 3 and 4 of docs/specifiche/00): what the
 * requester sees of the offers (PRES-02…05), the AI comparison for privates
 * (PRES-06…08), the choice with the documents to read and sign (LEG-05) and
 * the payment (PAG-01). Every rule is checked here, not only hidden in the
 * screens: GAR-04, the fee (FEE-01…03), the offer still guaranteed.
 */
@Injectable()
export class AcceptanceService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SIGNATURE) private readonly signature: SignaturePort,
    @Inject(PAYMENTS) private readonly payments: PaymentsPort,
    @Inject(AI_EXPLAINER) private readonly explainer: AiExplainerPort,
  ) {}

  // ---------------------------------------------------------------- helpers

  /** The requester's request (rule 3), or 404. */
  async requestOf(tx: DbTransaction, auth: AuthContext, requestId: string) {
    const request = await tx.quoteRequest.findFirst({
      where: { id: requestId, ...requesterScope(auth) },
    });
    if (!request) throw new ProblemError("NOT_FOUND");
    return request;
  }

  async feeSettings(tx: DbTransaction, now: Date): Promise<FeeSettings> {
    const s = await settingsAt(tx, FEE_KEYS, now);
    return {
      privateCents: s["fees.private.amountCents"],
      aiSupplementCents: s["fees.private.aiSupplementCents"],
      lowPremiumThresholdCents: s["fees.private.lowPremium.thresholdCents"],
      lowPremiumCents: s["fees.private.lowPremium.amountCents"],
      brokerCents: s["fees.broker.amountCents"],
    };
  }

  /** GAR-04 and EMI-01: the working calendar and the issuance time in force. */
  async issuanceRules(tx: DbTransaction, now: Date) {
    const s = await settingsAt(tx, ["calendar.workingHours", "issuance.deadlineWorkingHours"], now);
    return {
      calendar: await loadWorkingCalendar(tx, s["calendar.workingHours"]),
      hours: s["issuance.deadlineWorkingHours"],
    };
  }

  quoteDataOf(tx: DbTransaction, request: QuoteRequest): Promise<QuoteData> {
    return asSystem(tx, async () => {
      const version = await tx.quoteDataVersion.findUniqueOrThrow({
        where: {
          quoteRequestId_version: {
            quoteRequestId: request.id,
            version: request.quoteDataVersion ?? 0,
          },
        },
      });
      return JSON.parse(this.cipher.decrypt(version.dataEnc)) as QuoteData;
    });
  }

  /**
   * PRES-02…05: the offers of the last closed round, the best per company,
   * with what the requester needs to choose. A system step for the offers:
   * the requester never reads offer rows (BC-01), only these fields.
   */
  async rows(tx: DbTransaction, request: QuoteRequest, onlyIds: string[] | null) {
    const now = this.clock.now();
    const last = await tx.auction.findFirst({
      where: { quoteRequestId: request.id, status: "CLOSED" },
      orderBy: { round: "desc" },
    });
    if (!last || !request.startDate) return { rows: [] as PresentedRow[], auctionId: null };
    const offers = await asSystem(tx, () =>
      tx.offer.findMany({
        where: {
          auctionId: last.id,
          // After the payment the chosen one is WINNING and the others NOT_CHOSEN (PAG-02).
          status: { in: ["AWAITING_CUSTOMER", "EXPIRED", "WINNING", "NOT_CHOSEN"] },
        },
      }),
    );
    const [companies, products, pkg, fees, rules, quoteData] = await Promise.all([
      tx.insuranceCompany.findMany(),
      asSystem(tx, () =>
        tx.insuranceProduct.findMany({
          where: { id: { in: offers.flatMap((o) => (o.productId ? [o.productId] : [])) } },
        }),
      ),
      tx.coveragePackage.findUnique({ where: { code: request.packageCode ?? "" } }),
      this.feeSettings(tx, now),
      this.issuanceRules(tx, now),
      this.quoteDataOf(tx, request),
    ]);
    const startDate = dbDateToCalendarDate(request.startDate);
    const today = romeCalendarDate(now);
    const ranked = offers.flatMap((o) =>
      o.annualGrossPremiumCents !== null && o.companyId && o.guaranteeUntil
        ? [
            {
              id: o.id,
              companyId: o.companyId,
              annualGrossPremiumCents: o.annualGrossPremiumCents,
              guaranteeUntil: dbDateToCalendarDate(o.guaranteeUntil),
              lastSubmittedAt: o.lastChangedAt,
              offer: o,
            },
          ]
        : [],
    );
    const isPrivate = request.channel === "PRIVATE";
    const rows: PresentedRow[] = bestOfferPerCompany(ranked, now).map(({ offer, guaranteed }) => {
      const premium = offer.annualGrossPremiumCents;
      const fee = customerFee(
        { channel: request.channel, premiumCents: premium, aiUsed: request.aiComparisonUsed },
        fees,
      );
      return {
        id: offer.id,
        companyId: offer.companyId,
        company: companies.find((c) => c.id === offer.companyId)?.name ?? "",
        product: products.find((p) => p.id === offer.offer.productId)?.name ?? "",
        productId: offer.offer.productId,
        packageName: pkg?.name ?? null,
        annualGrossPremiumCents: premium,
        guaranteeUntil: offer.guaranteeUntil,
        guaranteed,
        daysLeft: guaranteeDaysLeft(offer.guaranteeUntil, today),
        savingCents: savingCents(quoteData.request.currentPremiumCents ?? null, premium),
        coverage: offer.offer.coverage,
        notes: offer.offer.notes,
        pdfDocumentId: offer.offer.pdfDocumentId,
        block: acceptanceBlock(
          { guaranteeUntil: offer.guaranteeUntil, startDate, now },
          rules.calendar,
          rules.hours,
        ),
        feeCents: fee.feeCents,
        feeWithAiCents: isPrivate
          ? customerFee({ channel: "PRIVATE", premiumCents: premium, aiUsed: true }, fees).feeCents
          : null,
        lastSubmittedAt: offer.lastSubmittedAt,
        organizationId: offer.offer.organizationId,
      };
    });
    // PRES-02 first on every offer, then the subset (the link): never a row
    // that is not the best of its company.
    return {
      rows: onlyIds ? rows.filter((r) => onlyIds.includes(r.id)) : rows,
      auctionId: last.id,
    };
  }

  /** What a row shows: never the agency (PRES-04). */
  publicRow(row: PresentedRow) {
    const visible: Partial<PresentedRow> = { ...row };
    delete visible.organizationId;
    delete visible.lastSubmittedAt;
    return visible as Omit<PresentedRow, "organizationId" | "lastSubmittedAt">;
  }

  // ---------------------------------------------------------------- presentation

  async presentation(auth: AuthContext, requestId: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const request = await this.requestOf(tx, auth, requestId);
      const { rows } = await this.rows(tx, request, null);
      const suggestion = await tx.aiSuggestion.findFirst({
        where: { quoteRequestId: request.id },
        orderBy: { shownAt: "desc" },
      });
      return {
        channel: request.channel,
        aiUsed: request.aiComparisonUsed,
        offers: rows.map((r) => this.publicRow(r)),
        suggestion: suggestion
          ? {
              recommendedOfferId: suggestion.recommendedOfferId,
              text: suggestion.text,
              shownAt: suggestion.shownAt.toISOString(),
            }
          : null,
      };
    });
  }

  // ---------------------------------------------------------------- AI comparison

  /**
   * PRES-06…08: privates only (the controller checks aiComparison.use). The
   * score is the domain's; the model writes the text, checked before it is
   * shown (proposal D). The use is recorded on the request: from now on the
   * fee is the one with the comparison (FEE-01), whatever offer is chosen.
   */
  async aiComparison(auth: AuthContext, requestId: string) {
    if (auth.kind !== "PRIVATE") throw new ProblemError("FORBIDDEN");
    const now = this.clock.now();
    const prepared = await withContext(this.db, auth.db, async (tx) => {
      const request = await this.requestOf(tx, auth, requestId);
      if (request.status !== "OFFERS_AVAILABLE") {
        throw new ProblemError("CONFLICT", "No offers to compare", [
          { path: "request", issue: "NO_OFFERS_AVAILABLE" },
        ]);
      }
      const { rows } = await this.rows(tx, request, null);
      const shown = rows.filter((r) => r.guaranteed);
      if (shown.length === 0) {
        throw new ProblemError("CONFLICT", "No guaranteed offer", [
          { path: "request", issue: "NO_OFFERS_AVAILABLE" },
        ]);
      }
      const settings = await settingsAt(tx, ["ai.weights", "ai.explanationMaxChars"], now);
      const version = await tx.coveragePackageVersion.findFirst({
        where: { packageCode: request.packageCode ?? "" },
        orderBy: { version: "desc" },
      });
      const requirements = PackageRequirementsSchema.parse(version?.requirements);
      const indexes = await tx.companyComplaintsIndex.findMany({
        where: { companyId: { in: shown.map((r) => r.companyId) } },
        orderBy: { year: "desc" },
      });
      const candidates = shown.map((r) => {
        const coverage = OfferCoverageSchema.safeParse(r.coverage);
        return {
          id: r.id,
          companyId: r.companyId,
          annualGrossPremiumCents: r.annualGrossPremiumCents,
          guaranteeUntil: r.guaranteeUntil,
          lastSubmittedAt: r.lastSubmittedAt,
          coverageImprovements: coverage.success
            ? coverageImprovements(requirements, coverage.data)
            : 0,
          companyComplaintsIndex: indexes.find((i) => i.companyId === r.companyId)?.value ?? null,
          // Phase 6 brings the issuance history: neutral until then (proposal C).
          agencyIssuanceMinutes: null,
        };
      });
      const weights = settings["ai.weights"];
      const scoring = scoreOffers(candidates, weights);
      return {
        request,
        shown,
        candidates,
        scoring,
        weights,
        maxChars: settings["ai.explanationMaxChars"],
      };
    });

    // The model is outside any transaction: it may be slow.
    const euros = (cents: number) => formatEuroCents(cents).replace(/\s*€$/, "");
    const summaries = prepared.shown.map((r) => ({
      offerId: r.id,
      company: r.company,
      product: r.product,
      premium: formatEuroCents(r.annualGrossPremiumCents),
      guaranteeDaysLeft: r.daysLeft,
      total: prepared.scoring.offers.find((o) => o.offerId === r.id)?.total ?? 0,
    }));
    const recommended = prepared.shown.find((r) => r.id === prepared.scoring.recommendedOfferId);
    if (!recommended) throw new ProblemError("INTERNAL");
    let model = "none";
    let promptVersion = "none";
    let text: string;
    try {
      const out = await this.explainer.explain({
        offers: summaries,
        recommendedOfferId: recommended.id,
        weights: prepared.weights,
        locale: "it",
      });
      ({ text, model, promptVersion } = out);
    } catch {
      text = "";
    }
    const problems = aiTextProblems(text, {
      recommendedCompany: recommended.company,
      allowedNumbers: prepared.shown.flatMap((r) => [
        euros(r.annualGrossPremiumCents),
        String(r.daysLeft),
      ]),
      maxChars: prepared.maxChars,
    });
    const shownText =
      problems.length === 0
        ? text.trim()
        : labels.aiComparison.fallback
            .replace("{company}", recommended.company)
            .replace("{product}", recommended.product)
            .replace("{premium}", formatEuroCents(recommended.annualGrossPremiumCents));

    return withContext(this.db, auth.db, async (tx) => {
      const suggestion = await asSystem(tx, async () => {
        await tx.quoteRequest.update({
          where: { id: prepared.request.id },
          data: { aiComparisonUsed: true },
        });
        return tx.aiSuggestion.create({
          data: {
            quoteRequestId: prepared.request.id,
            ownerUserId: prepared.request.ownerUserId,
            ownerOrganizationId: prepared.request.ownerOrganizationId,
            offerIds: prepared.shown.map((r) => r.id),
            weights: prepared.weights,
            inputs: prepared.candidates.map((c) => ({
              offerId: c.id,
              annualGrossPremiumCents: c.annualGrossPremiumCents,
              guaranteeUntil: c.guaranteeUntil,
              coverageImprovements: c.coverageImprovements,
              companyComplaintsIndex: c.companyComplaintsIndex,
              agencyIssuanceMinutes: c.agencyIssuanceMinutes,
            })),
            scores: prepared.scoring.offers as unknown as object[],
            recommendedOfferId: recommended.id,
            text: shownText,
            textSource: problems.length === 0 ? "MODEL" : "FALLBACK",
            textProblems: problems,
            model,
            promptVersion,
            shownAt: now,
          },
        });
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "AI_COMPARISON_USED",
        targetType: "QuoteRequest",
        targetId: prepared.request.id,
        after: { suggestionId: suggestion.id, textSource: suggestion.textSource },
      });
      return {
        recommendedOfferId: suggestion.recommendedOfferId,
        text: suggestion.text,
        shownAt: suggestion.shownAt.toISOString(),
      };
    });
  }

  // ---------------------------------------------------------------- acceptance

  /**
   * PRES-05, GAR-04, LEG-05: the chosen offer, still guaranteed and in time;
   * the fee with the rule applied (FEE-01…03); the documents to read and sign;
   * the signature envelope. Another offer voids the previous acceptance, and
   * the signature is done again (decision 22).
   */
  async accept(
    tx: DbTransaction,
    request: QuoteRequest,
    accepter: Accepter,
    offerId: string,
    signer: { firstName: string; lastName: string },
    returnUrl: string,
    actor: Parameters<AuditService["inTransaction"]>[1],
  ) {
    const now = this.clock.now();
    await tx.$queryRaw`SELECT 1 FROM "QuoteRequest" WHERE "id" = ${request.id}::uuid FOR UPDATE`;
    const fresh = await asSystem(tx, () =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: request.id } }),
    );
    if (!["OFFERS_AVAILABLE", "ACCEPTED"].includes(fresh.status)) {
      throw new ProblemError("CONFLICT", "The request cannot be accepted now", [
        { path: "request", issue: "NOT_ACCEPTABLE" },
      ]);
    }
    const { rows } = await this.rows(tx, fresh, accepter.offerIds);
    const row = rows.find((r) => r.id === offerId);
    // PRES-05: among the offers shown, never another one of the round.
    if (!row) throw new ProblemError("NOT_FOUND");
    if (row.block) {
      throw new ProblemError("CONFLICT", "The offer cannot be accepted", [
        {
          path: "offerId",
          issue: row.block === "EXPIRED" ? "OFFER_EXPIRED" : "TOO_LATE_TO_ACCEPT",
        },
      ]);
    }
    const live = await asSystem(tx, () =>
      tx.acceptance.findFirst({
        where: { quoteRequestId: fresh.id, status: { not: "VOIDED" } },
        include: { signature: true, payments: true },
      }),
    );
    if (live?.status === "PAID") {
      throw new ProblemError("CONFLICT", "Already paid", [
        { path: "request", issue: "ALREADY_PAID" },
      ]);
    }
    // The same offer from the same accepter goes on; from another link of the
    // broker it is a new acceptance, signed again by whoever has that link.
    if (live && live.offerId === offerId && live.customerLinkId === accepter.customerLinkId) {
      return live.id;
    }
    if (live) {
      // PAG-02: never two payments for one request. A transfer on its way
      // blocks the change; an open checkout is closed at the provider first.
      if (live.payments.some((p) => p.status === "AUTHORIZED")) {
        throw new ProblemError("CONFLICT", "A payment is on its way", [
          { path: "request", issue: "PAYMENT_IN_PROGRESS" },
        ]);
      }
      for (const open of live.payments.filter((p) => p.status === "CREATED")) {
        if (open.providerRef) await this.payments.cancelCheckout(open.providerRef);
        await asSystem(tx, () =>
          tx.payment.update({
            where: { id: open.id },
            data: { status: "FAILED", failedAt: now },
          }),
        );
      }
      // Decision 22: another offer, a new acceptance and a new signature.
      await asSystem(tx, () =>
        tx.acceptance.update({
          where: { id: live.id },
          data: { status: "VOIDED", voidedAt: now, voidReason: "OFFER_CHANGED" },
        }),
      );
      if (fresh.status === "ACCEPTED") await this.setStatus(tx, fresh, "OFFERS_AVAILABLE");
    }
    const fee = customerFee(
      {
        channel: fresh.channel,
        premiumCents: row.annualGrossPremiumCents,
        aiUsed: fresh.aiComparisonUsed,
      },
      await this.feeSettings(tx, now),
    );
    const acceptance = await asSystem(tx, () =>
      tx.acceptance.create({
        data: {
          quoteRequestId: fresh.id,
          offerId,
          ownerUserId: fresh.ownerUserId,
          ownerOrganizationId: fresh.ownerOrganizationId,
          acceptedByUserId: accepter.userId,
          customerLinkId: accepter.customerLinkId,
          premiumCents: row.annualGrossPremiumCents,
          feeCents: fee.feeCents,
          feeRule: fee.rule,
          brokerFeeCents: fee.brokerFeeCents,
          aiUsed: fresh.aiComparisonUsed,
        },
      }),
    );
    const documents = await this.documents(tx, fresh, row, acceptance.id, fee.feeCents, now);
    const envelope = await this.signature.createEnvelope({
      reference: acceptance.id,
      signer,
      documents: documents.toSign.map((d) => ({ id: d.id, title: d.title, key: d.storageKey })),
      returnUrl,
    });
    await asSystem(tx, () =>
      tx.signatureEnvelope.create({
        data: {
          acceptanceId: acceptance.id,
          ownerUserId: fresh.ownerUserId,
          ownerOrganizationId: fresh.ownerOrganizationId,
          provider: this.signature.provider,
          providerRef: envelope.providerRef,
          signingUrl: envelope.signingUrl,
          documentIds: [...documents.toSign, ...documents.toRead].map((d) => d.id),
        },
      }),
    );
    await this.audit.inTransaction(tx, actor, {
      action: "ACCEPTANCE_STARTED",
      targetType: "QuoteRequest",
      targetId: fresh.id,
      after: { acceptanceId: acceptance.id, offerId, feeRule: fee.rule, feeCents: fee.feeCents },
    });
    return acceptance.id;
  }

  async acceptAsPrivate(auth: AuthContext, requestId: string, offerId: string, returnUrl: string) {
    if (auth.kind !== "PRIVATE") throw new ProblemError("FORBIDDEN");
    return withContext(this.db, auth.db, async (tx) => {
      const request = await this.requestOf(tx, auth, requestId);
      const user = await tx.user.findUniqueOrThrow({ where: { id: auth.userId } });
      const id = await this.accept(
        tx,
        request,
        { kind: "PRIVATE", userId: auth.userId, customerLinkId: null, offerIds: null },
        offerId,
        { firstName: user.firstName, lastName: user.lastName },
        returnUrl,
        actorOf(auth),
      );
      return this.view(tx, id);
    });
  }

  async setStatus(tx: DbTransaction, request: QuoteRequest, to: RequestStatus) {
    if (request.status === to) return;
    transitionRequest(request.status as RequestStatus, to);
    await asSystem(tx, () =>
      tx.quoteRequest.update({ where: { id: request.id }, data: { status: to } }),
    );
  }

  /**
   * LEG-05: the MUP (AstAx proposing, the issuing agency, company, compensation
   * and payment), the letter of engagement for privates, and the product's
   * information set from the agency's library (decision 17).
   */
  private async documents(
    tx: DbTransaction,
    request: QuoteRequest,
    row: PresentedRow,
    acceptanceId: string,
    feeCents: number,
    now: Date,
  ) {
    const [astax, agency, legal, product] = await Promise.all([
      asSystem(tx, () => tx.organization.findFirstOrThrow({ where: { type: "ASTAX" } })),
      asSystem(tx, () => tx.organization.findUniqueOrThrow({ where: { id: row.organizationId } })),
      tx.legalDocument.findMany({
        where: { key: { in: ["precontractual-information", "engagement-letter"] } },
        include: {
          versions: { where: { publishedAt: { not: null } }, orderBy: { number: "desc" }, take: 1 },
        },
      }),
      row.productId
        ? asSystem(tx, () =>
            tx.document.findMany({
              where: {
                productId: row.productId,
                deletedAt: null,
                createdAt: { lte: row.lastSubmittedAt },
              },
              orderBy: { createdAt: "desc" },
            }),
          )
        : Promise.resolve([]),
    ]);
    const l = labels.acceptanceDocuments;
    const text = (key: string) => {
      const v = legal.find((d) => d.key === key)?.versions[0];
      return {
        content: v?.contentMd ?? l.missingText,
        version: v ? `${l.version} ${v.number}` : "",
      };
    };
    const rui = (o: { legalName: string; ruiNumber: string | null }) =>
      o.ruiNumber ? `${o.legalName} (RUI ${o.ruiNumber})` : o.legalName;
    const rows: [string, string][] = [
      [l.proposer, rui(astax)],
      [l.issuer, rui(agency)],
      [l.company, row.company],
      [l.product, row.product],
      [l.premium, formatEuroCents(row.annualGrossPremiumCents)],
      [l.fee, feeCents > 0 ? formatEuroCents(feeCents) : l.noFee],
      [l.payment, l.paymentText],
      [l.request, request.code],
    ];
    const store = async (
      kind: "PRECONTRACTUAL_INFO" | "ENGAGEMENT_LETTER",
      key: string,
      title: string,
    ) => {
      const legalText = text(key);
      const body = await acceptancePdf({
        title,
        legalText: legalText.content,
        versionLabel: legalText.version,
        dataTitle: l.dataTitle,
        rows,
      });
      const storageKey = `acceptances/${acceptanceId}/${randomUUID()}`;
      await this.storage.put({ key: storageKey, body, contentType: "application/pdf" });
      const document = await asSystem(tx, () =>
        tx.document.create({
          data: {
            kind,
            ownerUserId: request.ownerUserId,
            ownerOrganizationId: request.ownerOrganizationId,
            quoteRequestId: request.id,
            storageKey,
            sha256: createHash("sha256").update(body).digest("hex"),
            mime: "application/pdf",
            size: body.length,
            fileName: `${kind.toLowerCase()}.pdf`,
            uploadedByUserId: request.requesterUserId,
            createdAt: now,
          },
        }),
      );
      return { id: document.id, title, storageKey };
    };
    const mup = await store("PRECONTRACTUAL_INFO", "precontractual-information", l.mupTitle);
    const toSign =
      request.channel === "PRIVATE"
        ? [await store("ENGAGEMENT_LETTER", "engagement-letter", l.letterTitle), mup]
        : [mup];
    const seen = new Set<string>();
    const toRead = product
      .filter((d) => !seen.has(d.kind) && seen.add(d.kind))
      .map((d) => ({
        id: d.id,
        title: l.kinds[d.kind as keyof typeof l.kinds] ?? d.kind,
        storageKey: d.storageKey,
      }));
    return { toSign, toRead };
  }

  /**
   * The acceptance as its requester sees it. The signing and payment pages
   * only for whoever signs and pays: never the broker, for the customer's
   * acceptance (decision 26).
   */
  async view(tx: DbTransaction, acceptanceId: string, withLinks = true) {
    const a = await asSystem(tx, () =>
      tx.acceptance.findUniqueOrThrow({
        where: { id: acceptanceId },
        include: { signature: true, payments: { orderBy: { createdAt: "desc" }, take: 1 } },
      }),
    );
    const ids = (a.signature?.documentIds as string[] | undefined) ?? [];
    const signed = (a.signature?.signedDocumentIds as string[] | undefined) ?? [];
    const documents = await asSystem(tx, () =>
      tx.document.findMany({ where: { id: { in: [...ids, ...signed] } } }),
    );
    const payment = a.payments[0];
    return {
      id: a.id,
      offerId: a.offerId,
      status: a.status,
      premiumCents: a.premiumCents,
      feeCents: a.feeCents,
      totalCents: a.premiumCents + a.feeCents,
      feeRule: a.feeRule,
      aiUsed: a.aiUsed,
      signingUrl:
        withLinks && a.status === "PENDING_SIGNATURE" ? (a.signature?.signingUrl ?? null) : null,
      documents: [...ids, ...signed].flatMap((id) => {
        const d = documents.find((x) => x.id === id);
        return d ? [{ id: d.id, kind: d.kind, signed: signed.includes(d.id) }] : [];
      }),
      payment: payment
        ? {
            status: payment.status,
            method: payment.method,
            redirectUrl: withLinks && payment.status === "CREATED" ? payment.redirectUrl : null,
          }
        : null,
      signedAt: a.signedAt?.toISOString() ?? null,
      paidAt: a.paidAt?.toISOString() ?? null,
      issuanceDeadlineAt: a.issuanceDeadlineAt?.toISOString() ?? null,
    };
  }

  async current(auth: AuthContext, requestId: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const request = await this.requestOf(tx, auth, requestId);
      const live = await tx.acceptance.findFirst({
        where: { quoteRequestId: request.id, status: { not: "VOIDED" } },
      });
      if (!live) return { acceptance: null, issuer: null };
      // Spec 03: after the payment, the issuing agency and its contacts.
      const issuer = live.status === "PAID" ? await this.issuerOf(tx, live.offerId) : null;
      return { acceptance: await this.view(tx, live.id, request.channel === "PRIVATE"), issuer };
    });
  }

  private async issuerOf(tx: DbTransaction, offerId: string) {
    return asSystem(tx, async () => {
      const offer = await tx.offer.findUniqueOrThrow({ where: { id: offerId } });
      const org = await tx.organization.findUniqueOrThrow({ where: { id: offer.organizationId } });
      return { name: org.legalName, pec: org.pec };
    });
  }

  /**
   * PRES-04: the PDF quote of an offer shown to the requester (the database
   * hides the quotes from them: a system step, only for the rows shown).
   */
  async quoteFile(auth: AuthContext, requestId: string, offerId: string) {
    const document = await withContext(this.db, auth.db, async (tx) => {
      const request = await this.requestOf(tx, auth, requestId);
      const { rows } = await this.rows(tx, request, null);
      const row = rows.find((r) => r.id === offerId);
      if (!row?.pdfDocumentId) throw new ProblemError("NOT_FOUND");
      const doc = await asSystem(tx, () =>
        tx.document.findUniqueOrThrow({ where: { id: row.pdfDocumentId as string } }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "DOCUMENT_VIEWED",
        targetType: "Document",
        targetId: doc.id,
        after: { offerId },
      });
      return doc;
    });
    return {
      body: await this.storage.get(document.storageKey),
      mime: document.mime,
      fileName: document.fileName,
    };
  }

  /** A document of the acceptance for its requester (VIS: their own files only). */
  async documentFile(auth: AuthContext, requestId: string, documentId: string) {
    const document = await withContext(this.db, auth.db, async (tx) => {
      const request = await this.requestOf(tx, auth, requestId);
      const live = await tx.acceptance.findFirst({
        where: { quoteRequestId: request.id, status: { not: "VOIDED" } },
        include: { signature: true },
      });
      const ids = [
        ...((live?.signature?.documentIds as string[] | undefined) ?? []),
        ...((live?.signature?.signedDocumentIds as string[] | undefined) ?? []),
      ];
      if (!ids.includes(documentId)) throw new ProblemError("NOT_FOUND");
      const doc = await asSystem(tx, () =>
        tx.document.findUniqueOrThrow({ where: { id: documentId } }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "DOCUMENT_VIEWED",
        targetType: "Document",
        targetId: doc.id,
        after: { acceptanceId: live?.id ?? null },
      });
      return doc;
    });
    return {
      body: await this.storage.get(document.storageKey),
      mime: document.mime,
      fileName: document.fileName,
    };
  }

  // ---------------------------------------------------------------- payment

  /**
   * PAG-01: after the signature, one payment with premium and fee apart. A new
   * attempt after a failure (PAG-03, decision 22) needs no new signature; GAR-04
   * is checked again.
   */
  async pay(tx: DbTransaction, request: QuoteRequest, returnUrl: string) {
    const now = this.clock.now();
    await tx.$queryRaw`SELECT 1 FROM "QuoteRequest" WHERE "id" = ${request.id}::uuid FOR UPDATE`;
    const live = await asSystem(tx, () =>
      tx.acceptance.findFirst({
        where: { quoteRequestId: request.id, status: { not: "VOIDED" } },
        include: { payments: { orderBy: { createdAt: "desc" } } },
      }),
    );
    if (!live || live.status !== "SIGNED") {
      throw new ProblemError("CONFLICT", "Sign before paying", [
        { path: "acceptance", issue: live?.status === "PAID" ? "ALREADY_PAID" : "NOT_SIGNED" },
      ]);
    }
    const fresh = await asSystem(tx, () =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: request.id } }),
    );
    const { rows } = await this.rows(tx, fresh, null);
    const row = rows.find((r) => r.id === live.offerId);
    if (!row || row.block) {
      throw new ProblemError("CONFLICT", "The offer cannot be accepted any more", [
        {
          path: "offerId",
          issue: row?.block === "TOO_LATE" ? "TOO_LATE_TO_ACCEPT" : "OFFER_EXPIRED",
        },
      ]);
    }
    if (fresh.status === "OFFERS_AVAILABLE") await this.setStatus(tx, fresh, "ACCEPTED");
    const open = live.payments.find((p) => p.status === "CREATED" || p.status === "AUTHORIZED");
    if (open?.redirectUrl) return { redirectUrl: open.redirectUrl };
    const payment = await asSystem(tx, () =>
      tx.payment.create({
        data: {
          acceptanceId: live.id,
          ownerUserId: live.ownerUserId,
          ownerOrganizationId: live.ownerOrganizationId,
          provider: this.payments.provider,
          premiumCents: live.premiumCents,
          feeCents: live.feeCents,
          idempotencyKey: `${live.id}-${live.payments.length + 1}`,
          createdAt: now,
        },
      }),
    );
    const checkout = await this.payments.createCheckout({
      paymentId: payment.id,
      idempotencyKey: payment.idempotencyKey,
      amounts: { premiumCents: payment.premiumCents, feeCents: payment.feeCents },
      methods: ["CARD", "INSTANT_TRANSFER"],
      returnUrl,
    });
    await asSystem(tx, () =>
      tx.payment.update({
        where: { id: payment.id },
        data: { providerRef: checkout.providerRef, redirectUrl: checkout.redirectUrl },
      }),
    );
    return { redirectUrl: checkout.redirectUrl };
  }

  async payAsRequester(auth: AuthContext, requestId: string, returnUrl: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const request = await this.requestOf(tx, auth, requestId);
      const out = await this.pay(tx, request, returnUrl);
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "PAYMENT_STARTED",
        targetType: "QuoteRequest",
        targetId: request.id,
      });
      return out;
    });
  }
}
