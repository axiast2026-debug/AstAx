import { withContext, type DbClient } from "@astax/db";
import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { DB } from "../infra/tokens.js";
import { actorOf, AuditService } from "./audit.service.js";

const querySchema = z.object({
  before: z.coerce.bigint().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().max(64).optional(),
});

/** Read-only audit log for supervisors and administrators (fase 1, passo 12). */
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/audit")
export class AuditController {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermission("auditLog.viewAll")
  async list(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    const { before, limit, action } = parseInput(querySchema, query);
    const rows = await withContext(this.db, auth.db, (tx) =>
      tx.auditLog.findMany({
        where: { ...(before ? { seq: { lt: before } } : {}), ...(action ? { action } : {}) },
        orderBy: { seq: "desc" },
        take: limit,
      }),
    );
    // Reading everyone's actions is itself recorded (CLAUDE.md rule 4).
    await this.audit.record(actorOf(auth), {
      action: "AUDIT_LOG_READ",
      targetType: "AuditLog",
      after: { before: before?.toString() ?? null, limit, action: action ?? null },
    });
    return {
      entries: rows.map((r) => ({
        seq: r.seq.toString(),
        at: r.at.toISOString(),
        action: r.action,
        actorUserId: r.actorUserId,
        actorOrganizationId: r.actorOrganizationId,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        after: r.after,
      })),
      nextBefore: rows.length === limit ? (rows[rows.length - 1]?.seq.toString() ?? null) : null,
    };
  }
}
