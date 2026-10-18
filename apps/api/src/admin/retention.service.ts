import type { Clock } from "@astax/adapters/clock";
import { ObjectNotFoundError, type ObjectStoragePort } from "@astax/adapters/storage";
import {
  retentionCandidates,
  runRetention,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
} from "@astax/db";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { CLOCK, DB, OBJECT_STORAGE } from "../infra/tokens.js";

/**
 * LEG-06, proposal G («Sicurezza e dati»): what the next run of retention
 * deletes, the last runs, and the run on demand (the worker runs it daily).
 */
@Injectable()
export class RetentionService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async preview(auth: AuthContext) {
    const now = this.clock.now();
    const found = await withContext(this.db, SYSTEM_CONTEXT, (tx) => retentionCandidates(tx, now));
    const last = await withContext(this.db, auth.db, (tx) =>
      tx.auditLog.findMany({
        where: { action: "RETENTION_PURGED" },
        orderBy: { seq: "desc" },
        take: 20,
      }),
    );
    return {
      months: found.months,
      before: found.limit.toISOString(),
      candidates: found.requests.map((r) => ({
        code: r.code,
        status: r.status,
        lastActivity: r.updatedAt.toISOString(),
      })),
      documents: found.storageKeys.length,
      lastPurged: last.map((l) => ({
        at: l.at.toISOString(),
        code: (l.before as { code?: string } | null)?.code ?? "",
      })),
    };
  }

  async run(auth: AuthContext) {
    const now = this.clock.now();
    const result = await runRetention(
      this.db,
      async (key) => {
        try {
          await this.storage.delete(key);
        } catch (error) {
          if (!(error instanceof ObjectNotFoundError)) throw error;
        }
      },
      now,
    );
    await withContext(this.db, auth.db, (tx) =>
      this.audit.inTransaction(tx, actorOf(auth), {
        action: "RETENTION_RUN",
        targetType: "QuoteRequest",
        targetId: null,
        after: result,
      }),
    );
    return result;
  }
}
