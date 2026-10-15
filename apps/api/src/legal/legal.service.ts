import type { Clock } from "@astax/adapters/clock";
import { withContext, type DbClient } from "@astax/db";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { UserResolver } from "../auth/user-resolver.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB } from "../infra/tokens.js";
import { BLOCKING_MOMENTS, legalAudiences } from "./legal-audiences.js";

export interface PendingLegalDocument {
  documentKey: string;
  title: string;
  versionId: string;
  versionNumber: number;
  contentMd: string;
  validated: boolean;
}

/** Legal texts with versions and acceptances (LEG-01, LEG-02, LEG-03). */
@Injectable()
export class LegalService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UserResolver) private readonly users: UserResolver,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Versions in force for this user that still wait for acceptance. */
  async pending(auth: AuthContext): Promise<PendingLegalDocument[]> {
    const memberships =
      auth.kind === "PROFESSIONAL" ? await this.users.activeMemberships(auth.userId) : [];
    const audiences = [...legalAudiences(auth.kind, memberships)];
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const documents = await tx.legalDocument.findMany({
        where: { moment: { in: [...BLOCKING_MOMENTS] }, audiences: { hasSome: audiences } },
        include: {
          versions: {
            where: { publishedAt: { lte: now } },
            orderBy: { number: "desc" },
            take: 1,
            include: { acceptances: { where: { userId: auth.userId }, select: { id: true } } },
          },
        },
        orderBy: { key: "asc" },
      });
      return documents.flatMap((doc) => {
        const current = doc.versions[0];
        if (!current || current.acceptances.length > 0) return [];
        return [
          {
            documentKey: doc.key,
            title: doc.title,
            versionId: current.id,
            versionNumber: current.number,
            contentMd: current.contentMd,
            validated: current.status === "VALIDATED",
          },
        ];
      });
    });
  }

  /** Records acceptance of versions currently pending, with version, time and IP (LEG-01). */
  async accept(auth: AuthContext, versionIds: string[]): Promise<{ accepted: number }> {
    const pending = await this.pending(auth);
    const pendingIds = new Set(pending.map((p) => p.versionId));
    const unknown = versionIds.filter((id) => !pendingIds.has(id));
    if (unknown.length > 0 || versionIds.length === 0) {
      throw new ProblemError(
        "VALIDATION_FAILED",
        "Only versions in force and still pending can be accepted",
      );
    }
    const acceptedAt = this.clock.now();
    await withContext(this.db, auth.db, async (tx) => {
      for (const versionId of new Set(versionIds)) {
        await tx.legalAcceptance.create({
          data: {
            userId: auth.userId,
            versionId,
            acceptedAt,
            ip: auth.ip,
            userAgent: auth.userAgent,
            method: "CLICK",
          },
        });
        await this.audit.inTransaction(tx, actorOf(auth), {
          action: "LEGAL_ACCEPTED",
          targetType: "LegalDocumentVersion",
          targetId: versionId,
        });
      }
    });
    return { accepted: new Set(versionIds).size };
  }
}
