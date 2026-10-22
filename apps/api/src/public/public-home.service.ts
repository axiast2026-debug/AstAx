import type { Clock } from "@astax/adapters/clock";
import {
  loadWorkingCalendar,
  settingsAt,
  SYSTEM_CONTEXT,
  withContext,
  type AuctionSettingsSnapshot,
  type DbClient,
  type DbTransaction,
} from "@astax/db";
import { workingClock, workingMsBetween } from "@astax/shared/domain";
import { Inject, Injectable } from "@nestjs/common";
import { AcceptanceService } from "../acceptance/acceptance.service.js";
import { CLOCK, DB } from "../infra/tokens.js";

/** Many visits, one reading of the database a minute (ADR 0016). */
const CACHE_MS = 60_000;
const TICKER_SIZE = 12;
/** Offers that arrived, whatever happened to them after the closing. */
const ARRIVED = { notIn: ["WITHDRAWN" as const] };

export interface PublicTickerEvent {
  at: string;
  kind: "ENVELOPE" | "CLOSED";
  province: string | null;
  vehicleType: string | null;
  /** ENVELOPE: its place in the round; CLOSED: the offers of the round. */
  count: number;
}

/**
 * The public home (ADR 0016, Momento 1): fees from the parameters always;
 * the live data only with the switch on and enough closed auctions in the
 * window. Anonymous or aggregate only: no price, company, agency, plate,
 * name or request code.
 */
@Injectable()
export class PublicHomeService {
  private cache: { until: number; value: Awaited<ReturnType<PublicHomeService["read"]>> } | null =
    null;

  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AcceptanceService) private readonly acceptance: AcceptanceService,
  ) {}

  async home() {
    const now = this.clock.now();
    if (this.cache && this.cache.until > now.getTime()) return this.cache.value;
    const value = await this.read(now);
    this.cache = { until: now.getTime() + CACHE_MS, value };
    return value;
  }

  private read(now: Date) {
    return withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const s = await settingsAt(
        tx,
        [
          "home.publicData.enabled",
          "home.publicData.minClosedAuctions",
          "home.publicData.windowDays",
          "fees.private.amountCents",
          "fees.private.aiSupplementCents",
          "fees.private.lowPremium.thresholdCents",
          "fees.private.lowPremium.amountCents",
          "fees.agency.amountCents",
          "invitations.max",
          "auction.defaultDurationWorkingHours",
          "issuance.deadlineWorkingHours",
          "reconfirmation.maxPerRequest",
          "auction.desertedReopen.enabled",
          "auction.desertedReopen.workingHours",
          "calendar.workingHours",
          "remittance.runDay",
        ],
        now,
      );
      const fees = {
        privateCents: s["fees.private.amountCents"],
        aiSupplementCents: s["fees.private.aiSupplementCents"],
        lowPremiumThresholdCents: s["fees.private.lowPremium.thresholdCents"],
        lowPremiumCents: s["fees.private.lowPremium.amountCents"],
      };
      // The promises of the home, from the parameters (rule 7), never written in its texts.
      const service = {
        maxInvitedAgencies: s["invitations.max"],
        defaultDurationWorkingHours: s["auction.defaultDurationWorkingHours"],
        agencyFeeCents: s["fees.agency.amountCents"],
        issuanceWorkingHours: s["issuance.deadlineWorkingHours"],
        // «Come funziona», «Per le agenzie», «Domande frequenti» (pagine pubbliche).
        maxReconfirmations: s["reconfirmation.maxPerRequest"],
        desertedReopenWorkingHours: s["auction.desertedReopen.enabled"]
          ? s["auction.desertedReopen.workingHours"]
          : null,
        workingHours: s["calendar.workingHours"],
        remittanceDay: s["remittance.runDay"],
        savingWindowDays: s["home.publicData.windowDays"],
      };
      const windowDays = s["home.publicData.windowDays"];
      const since = new Date(now.getTime() - windowDays * 86_400_000);
      const closed = s["home.publicData.enabled"]
        ? await tx.auction.findMany({
            where: { status: "CLOSED", closedAt: { gte: since, lte: now } },
            select: { id: true },
          })
        : [];
      const enough =
        s["home.publicData.enabled"] && closed.length >= s["home.publicData.minClosedAuctions"];
      if (!enough) return { serverNow: now.toISOString(), fees, service, live: null };

      const closedOffers = await tx.offer.count({
        where: { auctionId: { in: closed.map((a) => a.id) }, status: ARRIVED },
      });
      return {
        serverNow: now.toISOString(),
        fees,
        service,
        live: {
          windowDays,
          openAuctions: await tx.auction.count({ where: { status: "OPEN" } }),
          featured: await this.featured(tx, now),
          ticker: await this.ticker(tx, since, now),
          offersPerAuction: Math.round((closedOffers / closed.length) * 10) / 10,
          saving: await this.saving(tx, since, now),
        },
      };
    });
  }

  /** The open auction that closes first: what is happening now, without who or how much. */
  private async featured(tx: DbTransaction, now: Date) {
    const auction = await tx.auction.findFirst({
      where: { status: "OPEN", scheduledCloseAt: { gt: now } },
      orderBy: { scheduledCloseAt: "asc" },
      include: { quoteRequest: { select: { province: true, vehicleType: true } } },
    });
    if (!auction) return null;
    const snapshot = auction.settingsSnapshot as Partial<AuctionSettingsSnapshot>;
    // The hours of the opening (ASTA-09); a round without them uses the ones in force.
    const hours =
      snapshot["calendar.workingHours"] ??
      (await settingsAt(tx, ["calendar.workingHours"], now))["calendar.workingHours"];
    const calendar = await loadWorkingCalendar(tx, hours, snapshot);
    const clock = workingClock(calendar, now, auction.scheduledCloseAt);
    return {
      province: auction.quoteRequest.province,
      vehicleType: auction.quoteRequest.vehicleType,
      envelopes: await tx.offer.count({ where: { auctionId: auction.id, status: "SUBMITTED" } }),
      scheduledCloseAt: auction.scheduledCloseAt.toISOString(),
      workingSecondsLeft: Math.round(clock.msLeft / 1000),
      totalWorkingSeconds: Math.round(
        workingMsBetween(calendar, auction.openedAt, auction.scheduledCloseAt) / 1000,
      ),
      pausedUntil: clock.pausedUntil?.toISOString() ?? null,
      runsUntil: clock.runsUntil?.toISOString() ?? null,
    };
  }

  /** The latest true events, in order of time, none chosen (proposal P8). */
  private async ticker(tx: DbTransaction, since: Date, now: Date): Promise<PublicTickerEvent[]> {
    const [offers, closings] = await Promise.all([
      tx.offer.findMany({
        where: { status: ARRIVED, submittedAt: { gte: since, lte: now } },
        orderBy: { submittedAt: "desc" },
        take: TICKER_SIZE,
        select: { auctionId: true, submittedAt: true },
      }),
      tx.auction.findMany({
        where: { status: "CLOSED", closedAt: { gte: since, lte: now } },
        orderBy: { closedAt: "desc" },
        take: TICKER_SIZE,
        select: { id: true, closedAt: true },
      }),
    ]);
    const auctionIds = [
      ...new Set([...offers.map((o) => o.auctionId), ...closings.map((c) => c.id)]),
    ];
    const [rounds, arrivals] = await Promise.all([
      tx.auction.findMany({
        where: { id: { in: auctionIds } },
        select: { id: true, quoteRequest: { select: { province: true, vehicleType: true } } },
      }),
      tx.offer.findMany({
        where: { auctionId: { in: auctionIds }, status: ARRIVED },
        orderBy: { submittedAt: "asc" },
        select: { auctionId: true, submittedAt: true },
      }),
    ]);
    const where = (auctionId: string) => rounds.find((r) => r.id === auctionId)?.quoteRequest;
    const ofRound = (auctionId: string) => arrivals.filter((a) => a.auctionId === auctionId);
    const events: PublicTickerEvent[] = [
      ...offers.map((o) => ({
        at: o.submittedAt.toISOString(),
        kind: "ENVELOPE" as const,
        province: where(o.auctionId)?.province ?? null,
        vehicleType: where(o.auctionId)?.vehicleType ?? null,
        count: ofRound(o.auctionId).filter((a) => a.submittedAt <= o.submittedAt).length,
      })),
      ...closings.map((c) => ({
        at: (c.closedAt ?? since).toISOString(),
        kind: "CLOSED" as const,
        province: where(c.id)?.province ?? null,
        vehicleType: where(c.id)?.vehicleType ?? null,
        count: ofRound(c.id).length,
      })),
    ];
    return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, TICKER_SIZE);
  }

  /**
   * The average saving against the premium the customers declared (PRES-03),
   * over the policies paid in the window that have one; null without any.
   */
  private async saving(tx: DbTransaction, since: Date, now: Date) {
    const paid = await tx.acceptance.findMany({
      where: { paidAt: { gte: since, lte: now } },
      select: { premiumCents: true, quoteRequest: true },
    });
    const ratios: number[] = [];
    for (const p of paid) {
      // A request without its data version (never completed) declares no premium.
      if (p.quoteRequest.quoteDataVersion === null) continue;
      const current = (await this.acceptance.quoteDataOf(tx, p.quoteRequest)).request
        .currentPremiumCents;
      if (current) ratios.push((current - p.premiumCents) / current);
    }
    if (ratios.length === 0) return null;
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    return { percent: Math.round(mean * 100), policies: ratios.length };
  }
}
