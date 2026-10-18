import type { Clock } from "@astax/adapters/clock";
import { FAKE_PAYMENTS_PROVIDER } from "@astax/adapters/payments";
import { FAKE_SIGNATURE_PROVIDER } from "@astax/adapters/signature";
import { asSystem, withContext, type DbClient, type Prisma } from "@astax/db";
import { romeInstant } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { csvFile as csv } from "../http/csv.js";
import { CLOCK, DB } from "../infra/tokens.js";

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

export interface DashboardFilter {
  from: string;
  to: string;
  channel?: "PRIVATE" | "BROKER";
  province?: string;
}

const average = (values: number[]) =>
  values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;

/**
 * Spec 07 «Cruscotto», «Integrazioni», «Report ed esportazioni»
 * (admin.reports.view): the figures of a period, with the filters for
 * channel and province; the state of every integration; the exports, each
 * recorded in the audit log. Counts and totals only, never a customer.
 */
@Injectable()
export class AdminReportsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private period(filter: DashboardFilter) {
    return {
      gte: romeInstant(filter.from, "00:00"),
      lt: new Date(romeInstant(filter.to, "00:00").getTime() + 24 * HOUR_MS),
    };
  }

  private requestWhere(filter: DashboardFilter): Prisma.QuoteRequestWhereInput {
    return {
      ...(filter.channel ? { channel: filter.channel } : {}),
      ...(filter.province ? { province: filter.province } : {}),
    };
  }

  async dashboard(auth: AuthContext, requested: Partial<DashboardFilter>) {
    const today = romeCalendarDate(this.clock.now());
    const filter: DashboardFilter = {
      ...requested,
      from: requested.from ?? `${today.slice(0, 8)}01`,
      to: requested.to ?? today,
    };
    const period = this.period(filter);
    const request = this.requestWhere(filter);
    return withContext(this.db, auth.db, (tx) =>
      asSystem(tx, async () => {
        const created = await tx.quoteRequest.count({ where: { ...request, createdAt: period } });
        const submitted = await tx.quoteRequest.count({
          where: { ...request, submittedAt: period },
        });
        const auctions = await tx.auction.findMany({
          where: { kind: "MAIN", createdAt: period, quoteRequest: request },
          select: { id: true, quoteRequestId: true },
        });
        const auctionIds = auctions.map((a) => a.id);
        const invitations = await tx.invitation.count({ where: { auctionId: { in: auctionIds } } });
        const offers = await tx.offer.findMany({
          where: { auctionId: { in: auctionIds }, status: { not: "WITHDRAWN" } },
          select: { auctionId: true },
        });
        const withOffers = new Set(offers.map((o) => o.auctionId)).size;
        const deserted = await tx.quoteRequest.count({
          where: { ...request, status: "DESERTED", updatedAt: period },
        });
        const accepted = await tx.acceptance.findMany({
          where: { status: "PAID", paidAt: period, quoteRequest: request },
          select: { id: true, paidAt: true, feeCents: true, premiumCents: true },
        });
        const policies = await tx.policy.findMany({
          where: { issuedAt: period, acceptanceId: { in: accepted.map((a) => a.id) } },
          select: { issuedAt: true, acceptanceId: true },
        });
        const issuedInPeriod = await tx.policy.count({
          where: {
            issuedAt: period,
            ...(filter.channel || filter.province
              ? {
                  quoteRequestId: {
                    in: (
                      await tx.quoteRequest.findMany({
                        where: { ...request, status: { in: ["ISSUED"] } },
                        select: { id: true },
                      })
                    ).map((r) => r.id),
                  },
                }
              : {}),
          },
        });
        const issuanceHours = policies.flatMap((p) => {
          const paid = accepted.find((a) => a.id === p.acceptanceId)?.paidAt;
          return paid ? [(p.issuedAt.getTime() - paid.getTime()) / HOUR_MS] : [];
        });
        const verifications = await tx.verification.findMany({
          where: { decidedAt: period, quoteRequest: request },
          select: { createdAt: true, decidedAt: true, decidedByUserId: true, decision: true },
        });
        const invoices = await tx.invoice.groupBy({
          by: ["series"],
          where: {
            issuedOn: {
              gte: new Date(`${filter.from}T00:00:00.000Z`),
              lte: new Date(`${filter.to}T00:00:00.000Z`),
            },
          },
          _sum: { exemptCents: true },
          _count: true,
        });
        const fees = (series: "P" | "A" | "B" | "N") =>
          invoices.find((i) => i.series === series)?._sum.exemptCents ?? 0;
        const complaints = await tx.complaint.count({ where: { receivedAt: period } });
        const flags = await tx.flag.count({ where: { createdAt: period } });
        const penalties = await tx.penalty.count({
          where: { appliedAt: period, status: { in: ["APPLIED", "UPHELD", "CONTESTED"] } },
        });
        const suspensions = await tx.agencySuspension.count({ where: { revokedAt: null } });
        return {
          filter,
          volumes: {
            created,
            submitted,
            auctions: auctions.length,
            deserted,
            accepted: accepted.length,
            issued: issuedInPeriod,
          },
          funnel: {
            auctionsWithOffers: withOffers,
            offersPerAuction:
              auctions.length > 0 ? Math.round((offers.length / auctions.length) * 10) / 10 : null,
            acceptedOfSubmitted:
              submitted > 0 ? Math.round((accepted.length / submitted) * 100) : null,
          },
          quality: {
            verifications: verifications.length,
            averageVerificationMinutes: average(
              verifications.map(
                (v) => ((v.decidedAt?.getTime() ?? 0) - v.createdAt.getTime()) / MINUTE_MS,
              ),
            ),
            automaticShare:
              verifications.length > 0
                ? Math.round(
                    (verifications.filter((v) => v.decidedByUserId === null).length /
                      verifications.length) *
                      100,
                  )
                : null,
            integrationShare:
              verifications.length > 0
                ? Math.round(
                    (verifications.filter((v) => v.decision === "INTEGRATION_REQUESTED").length /
                      verifications.length) *
                      100,
                  )
                : null,
          },
          agencies: {
            invitations,
            offers: offers.length,
            participation: invitations > 0 ? Math.round((offers.length / invitations) * 100) : null,
            averageIssuanceHours: average(issuanceHours),
          },
          economy: {
            privateFeesCents: fees("P"),
            brokerFeesCents: fees("B"),
            agencyFeesCents: fees("A"),
            creditNotesCents: fees("N"),
            premiumsCents: accepted.reduce((n, a) => n + a.premiumCents, 0),
          },
          risk: { complaints, flags, penalties, activeSuspensions: suspensions },
        };
      }),
    );
  }

  /** Spec 07 «Integrazioni»: which adapter is in use and the last signs of each provider. */
  async integrations(auth: AuthContext) {
    const now = this.clock.now();
    const since = new Date(now.getTime() - 7 * 24 * HOUR_MS);
    return withContext(this.db, auth.db, (tx) =>
      asSystem(tx, async () => {
        const lastEvent = async (provider: string) =>
          (
            await tx.providerEvent.findFirst({
              where: { provider },
              orderBy: { receivedAt: "desc" },
              select: { receivedAt: true },
            })
          )?.receivedAt.toISOString() ?? null;
        const rui = await tx.ruiImport.findFirst({ orderBy: { startedAt: "desc" } });
        return [
          { key: "vehicleData", adapter: "FAKE", lastActivity: null, problems: 0 },
          {
            key: "payments",
            adapter: "FAKE",
            lastActivity: await lastEvent(FAKE_PAYMENTS_PROVIDER),
            problems: await tx.payment.count({
              where: { status: "FAILED", failedAt: { gte: since } },
            }),
          },
          {
            key: "signature",
            adapter: "FAKE",
            lastActivity: await lastEvent(FAKE_SIGNATURE_PROVIDER),
            problems: 0,
          },
          {
            key: "eInvoicing",
            adapter: "FAKE",
            lastActivity: null,
            problems: await tx.invoice.count({ where: { sdiStatus: "REJECTED" } }),
          },
          {
            key: "rui",
            adapter: "FAKE",
            lastActivity: rui?.finishedAt?.toISOString() ?? null,
            problems: rui && !rui.finishedAt ? 1 : 0,
          },
          {
            key: "documentReader",
            adapter: "FAKE",
            lastActivity: null,
            problems: 0,
          },
          { key: "whatsapp", adapter: "OFF", lastActivity: null, problems: 0 },
        ];
      }),
    );
  }

  /** The requests of a period (codes, channel, states, dates): for the auditors and the reports. */
  async requestsCsv(auth: AuthContext, filter: DashboardFilter) {
    const period = this.period(filter);
    return withContext(this.db, auth.db, async (tx) => {
      const rows = await asSystem(tx, () =>
        tx.quoteRequest.findMany({
          where: { ...this.requestWhere(filter), createdAt: period },
          select: {
            code: true,
            channel: true,
            status: true,
            province: true,
            vehicleType: true,
            packageCode: true,
            createdAt: true,
            submittedAt: true,
          },
          orderBy: { createdAt: "asc" },
          take: 50_000,
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "REPORT_EXPORTED",
        targetType: "QuoteRequest",
        targetId: null,
        after: { report: "requests", ...filter, rows: rows.length },
      });
      return {
        body: csv(
          ["codice", "canale", "stato", "provincia", "veicolo", "pacchetto", "creata", "inviata"],
          rows.map((r) => [
            r.code,
            r.channel,
            r.status,
            r.province,
            r.vehicleType,
            r.packageCode,
            romeCalendarDate(r.createdAt),
            r.submittedAt ? romeCalendarDate(r.submittedAt) : "",
          ]),
        ),
        mime: "text/csv; charset=utf-8",
        fileName: `richieste-${filter.from}-${filter.to}.csv`,
      };
    });
  }

  /** The invoices of a period for the accountant: number, date, amounts, SDI state. */
  async accountingCsv(auth: AuthContext, filter: DashboardFilter) {
    return withContext(this.db, auth.db, async (tx) => {
      const rows = await asSystem(tx, () =>
        tx.invoice.findMany({
          where: {
            issuedOn: {
              gte: new Date(`${filter.from}T00:00:00.000Z`),
              lte: new Date(`${filter.to}T00:00:00.000Z`),
            },
          },
          orderBy: [{ series: "asc" }, { number: "asc" }],
          take: 50_000,
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "REPORT_EXPORTED",
        targetType: "Invoice",
        targetId: null,
        after: { report: "accounting", from: filter.from, to: filter.to, rows: rows.length },
      });
      return {
        body: csv(
          [
            "numero",
            "serie",
            "data",
            "destinatario",
            "esente_centesimi",
            "bollo_centesimi",
            "totale_centesimi",
            "natura_iva",
            "stato_sdi",
          ],
          rows.map((r) => [
            r.code,
            r.series,
            r.issuedOn.toISOString().slice(0, 10),
            r.recipientType,
            r.exemptCents,
            r.stampDutyCents,
            r.totalCents,
            r.vatNature,
            r.sdiStatus,
          ]),
        ),
        mime: "text/csv; charset=utf-8",
        fileName: `contabilita-${filter.from}-${filter.to}.csv`,
      };
    });
  }
}
