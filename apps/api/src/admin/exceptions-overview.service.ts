import type { Clock } from "@astax/adapters/clock";
import { asSystem, withContext, type DbClient } from "@astax/db";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthContext } from "../auth/auth-context.js";
import { CLOCK, DB } from "../infra/tokens.js";

/**
 * Spec 06 «Eccezioni», the cases beside the issuance problems: the deserted
 * requests (ASTA-08: the automatic reopening is over, requester and back
 * office were told) and the reconfirmations in progress with their closing
 * (GAR-07). Codes, states and times only: never the offers (rule 1).
 */
@Injectable()
export class ExceptionsOverviewService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async overview(auth: AuthContext) {
    return withContext(this.db, auth.db, (tx) =>
      asSystem(tx, async () => {
        const deserted = await tx.quoteRequest.findMany({
          where: { status: "DESERTED" },
          select: { id: true, code: true, channel: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 100,
        });
        const rounds = await tx.auction.findMany({
          where: { kind: "RECONFIRMATION", status: { in: ["OPEN", "CLOSING"] } },
          select: { quoteRequestId: true, round: true, scheduledCloseAt: true },
          orderBy: { scheduledCloseAt: "asc" },
        });
        const requests = await tx.quoteRequest.findMany({
          where: { id: { in: rounds.map((r) => r.quoteRequestId) } },
          select: { id: true, code: true, channel: true },
        });
        return {
          at: this.clock.now().toISOString(),
          deserted: deserted.map((d) => ({
            id: d.id,
            code: d.code,
            channel: d.channel,
            since: d.updatedAt.toISOString(),
          })),
          reconfirmations: rounds.map((r) => {
            const request = requests.find((q) => q.id === r.quoteRequestId);
            return {
              id: r.quoteRequestId,
              code: request?.code ?? "",
              channel: request?.channel ?? "PRIVATE",
              round: r.round,
              closesAt: r.scheduledCloseAt.toISOString(),
            };
          }),
        };
      }),
    );
  }
}
