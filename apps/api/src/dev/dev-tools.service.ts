import { DEV_CLOCK_OFFSET_KEY, OffsetClock, type Clock } from "@astax/adapters/clock";
import { asSystem, withContext, type DbClient } from "@astax/db";
import { addCalendarDays } from "@astax/shared/domain";
import { dbDateToCalendarDate } from "@astax/shared/format";
import { errorForLog, type Logger } from "@astax/shared/logging";
import { NO_FLAGS } from "@astax/shared/permissions";
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { createClient } from "redis";
import { actorOf, AuditService } from "../audit/audit.service.js";
import { OffersService } from "../auctions/offers.service.js";
import type { WorkflowSignals } from "../auctions/workflow-signals.js";
import type { AuthContext } from "../auth/auth-context.js";
import type { ApiConfig } from "../config/config.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, CONFIG, DB, LOGGER, WORKFLOW_SIGNALS } from "../infra/tokens.js";

/** Coverage that meets every package (OFF-06), for the test offers. */
const FULL_COVERAGE = {
  rca: { limitType: "SINGLE_LIMIT", singleLimitEur: 10_000_000 },
  recourseWaiver: {
    included: true,
    cases: ["EXPIRED_LICENCE", "NON_COMPLIANT_PASSENGER_TRANSPORT"],
  },
  roadsideAssistance: { included: true },
  legalProtection: { included: true },
  driverAccident: { included: true, capitalEur: 50_000 },
  theftFire: { included: true, coinsurancePct: 10, coinsuranceMinEur: 250, marketValue: true },
  naturalEvents: { included: true, coinsurancePct: 10, coinsuranceMinEur: 250 },
  vandalism: { included: true, coinsurancePct: 10, coinsuranceMinEur: 250 },
  collisionKasko: { included: false },
  fullKasko: { included: false },
  wildlifeCollision: { included: false },
  glass: { included: true, deductibleEur: 150 },
} as const;

/**
 * Development tools (CLAUDE.md rule 13): only with DEV_TOOLS=true, which the
 * configuration refuses in production. For demos and manual tests: fire the
 * next timer of a request, test offers from the synthetic agencies, move the
 * application clock forward. Each use is logged.
 */
@Injectable()
export class DevToolsService implements OnApplicationBootstrap, OnApplicationShutdown {
  #redis: ReturnType<typeof createClient> | null = null;
  #timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DB) private readonly db: DbClient,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OffersService) private readonly offers: OffersService,
    @Inject(WORKFLOW_SIGNALS) private readonly signals: WorkflowSignals,
  ) {}

  private enabled(): void {
    if (!this.config.DEV_TOOLS || this.config.NODE_ENV === "production") {
      throw new ProblemError("NOT_FOUND");
    }
  }

  /** The shared offset of the application clock, read again every 2 seconds. */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.DEV_TOOLS || !this.config.REDIS_URL || !(this.clock instanceof OffsetClock))
      return;
    const clock = this.clock;
    try {
      this.#redis = createClient({ url: this.config.REDIS_URL });
      this.#redis.on("error", () => undefined);
      await this.#redis.connect();
      const read = async () => {
        const value = await this.#redis?.get(DEV_CLOCK_OFFSET_KEY);
        clock.setOffset(Number(value ?? 0) || 0);
      };
      await read();
      this.#timer = setInterval(() => void read().catch(() => undefined), 2000);
    } catch (error) {
      this.logger.warn({ err: errorForLog(error) }, "dev clock without Redis");
    }
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.#timer);
    await this.#redis?.quit().catch(() => undefined);
  }

  async fireNextTimer(auth: AuthContext, requestId: string) {
    this.enabled();
    await this.audit.record(actorOf(auth), {
      action: "DEV_TOOL_USED",
      targetType: "QuoteRequest",
      targetId: requestId,
      after: { tool: "fireNextTimer" },
    });
    await this.signals.fireNextTimer(requestId);
    return { fired: true };
  }

  /** Moves the application clock forward by `minutes`, or back to the real time (null). */
  async advanceClock(auth: AuthContext, minutes: number | null) {
    this.enabled();
    if (!(this.clock instanceof OffsetClock) || !this.#redis) {
      throw new ProblemError("CONFLICT", "The application clock cannot be moved here");
    }
    const offset = minutes === null ? 0 : this.clock.offsetMs + minutes * 60_000;
    await this.#redis.set(DEV_CLOCK_OFFSET_KEY, String(offset));
    this.clock.setOffset(offset);
    await this.audit.record(actorOf(auth), {
      action: "DEV_TOOL_USED",
      targetType: "Clock",
      targetId: null,
      after: { tool: minutes === null ? "resetClock" : "advanceClock", minutes },
    });
    return { offsetMinutes: offset / 60_000, now: this.clock.now().toISOString() };
  }

  /**
   * Offers from the invited synthetic agencies that have not offered yet, as
   * their owners would send them: same checks, sealed at once (BC-02).
   */
  async testOffers(auth: AuthContext, auctionId: string, count: number) {
    this.enabled();
    const plan = await withContext(this.db, auth.db, (tx) =>
      asSystem(tx, async () => {
        const auction = await tx.auction.findUnique({ where: { id: auctionId } });
        if (!auction) throw new ProblemError("NOT_FOUND");
        const invitations = await tx.invitation.findMany({
          where: { auctionId, status: { not: "DECLINED" } },
        });
        const offered = new Set(
          (await tx.offer.findMany({ where: { auctionId, status: "SUBMITTED" } })).map(
            (o) => o.organizationId,
          ),
        );
        const rows = [];
        // The first agencies that can offer: an invited agency may have no product.
        for (const invitation of invitations.filter((i) => !offered.has(i.organizationId))) {
          if (rows.length >= count) break;
          const owner = await tx.membership.findFirst({
            where: { organizationId: invitation.organizationId, role: "OWNER", status: "ACTIVE" },
          });
          const product = await tx.insuranceProduct.findFirst({
            where: { organizationId: invitation.organizationId, active: true },
          });
          if (owner && product) rows.push({ owner, product });
        }
        return { minGuarantee: dbDateToCalendarDate(auction.minGuaranteeDate), rows };
      }),
    );
    const sent: string[] = [];
    for (const [i, { owner, product }] of plan.rows.entries()) {
      const agency: AuthContext = {
        userId: owner.userId,
        keycloakId: "",
        kind: "PROFESSIONAL",
        membership: {
          id: owner.id,
          organizationId: owner.organizationId,
          organizationType: "AGENCY",
          role: "OWNER",
          flags: NO_FLAGS,
        },
        actor: { kind: "MEMBER", role: "OWNER", organizationType: "AGENCY", flags: NO_FLAGS },
        db: {
          kind: "USER",
          userId: owner.userId,
          organizationId: owner.organizationId,
          isStaff: false,
          role: "OWNER",
        },
        ip: null,
        userAgent: "dev-tools",
      };
      const offer = {
        // Synthetic premiums, different for each agency.
        annualGrossPremiumCents: 42_000 + ((i * 3_700 + auctionId.charCodeAt(0) * 13) % 21_000),
        companyId: product.companyId,
        productId: product.id,
        coverage: FULL_COVERAGE,
        guaranteeUntil: addCalendarDays(plan.minGuarantee, 3 + i * 2),
        notes: null,
        binding: true,
      };
      // OFF-09, proposal E: the fake reader reads «Premio:» from the quote. The
      // second test offer's PDF says 10,00 € more, to show the flag in the demo.
      const written = offer.annualGrossPremiumCents + (i === 1 ? 1_000 : 0);
      const euros = `${Math.floor(written / 100)},${String(written % 100).padStart(2, "0")}`;
      const pdf = new TextEncoder().encode(
        `%PDF-1.7\n% Preventivo di prova (dati sintetici)\nPremio: ${euros}\n`,
      );
      const created = await this.offers.submit(agency, auctionId, offer, {
        body: pdf,
        contentType: "application/pdf",
      });
      sent.push(created.id);
    }
    await this.audit.record(actorOf(auth), {
      action: "DEV_TOOL_USED",
      targetType: "Auction",
      targetId: auctionId,
      after: { tool: "testOffers", offers: sent.length },
    });
    return { offers: sent.length };
  }
}
