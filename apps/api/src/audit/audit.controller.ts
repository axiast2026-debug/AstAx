import { withContext, type DbClient } from "@astax/db";
import { Controller, Get, Inject, Query, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { csvFile, romePeriod } from "../http/csv.js";
import { ProblemError } from "../http/problem.js";
import { parseInput } from "../http/validation.js";
import { sendFile } from "../requests/requests.controller.js";
import { DB } from "../infra/tokens.js";
import { actorOf, AuditService } from "./audit.service.js";

const querySchema = z.object({
  before: z.coerce.bigint().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().max(64).optional(),
});

const exportSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  action: z.string().max(64).optional(),
});

/** Spec 07 «Registro attività»: at most this many rows per file (a narrower period for more). */
const EXPORT_MAX_ROWS = 50_000;

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

  /** Phase 7: the export of the log, by period; the export itself is recorded first. */
  @Get("export")
  @RequirePermission("auditLog.viewAll")
  async export(
    @CurrentAuth() auth: AuthContext,
    @Query() query: unknown,
    @Res() response: Response,
  ) {
    const { from, to, action } = parseInput(exportSchema, query);
    const rows = await withContext(this.db, auth.db, async (tx) => {
      const where = { at: romePeriod(from, to), ...(action ? { action } : {}) };
      if ((await tx.auditLog.count({ where })) > EXPORT_MAX_ROWS) {
        throw new ProblemError("VALIDATION_FAILED", "Too many rows: choose a shorter period", [
          { path: "period", issue: "TOO_MANY_ROWS" },
        ]);
      }
      const found = await tx.auditLog.findMany({ where, orderBy: { seq: "asc" } });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "AUDIT_LOG_EXPORTED",
        targetType: "AuditLog",
        after: { from, to, action: action ?? null, rows: found.length },
      });
      return found;
    });
    const header = [
      "seq",
      "at",
      "action",
      "actor_user",
      "actor_membership",
      "actor_organization",
      "target_type",
      "target_id",
      "reason",
      "hash",
    ];
    const lines = rows.map((r) => [
      r.seq.toString(),
      r.at.toISOString(),
      r.action,
      r.actorUserId ?? "",
      r.actorMembershipId ?? "",
      r.actorOrganizationId ?? "",
      r.targetType ?? "",
      r.targetId ?? "",
      r.reason ?? "",
      r.hash,
    ]);
    sendFile(response, {
      body: csvFile(header, lines),
      mime: "text/csv; charset=utf-8",
      fileName: `registro-${from}-${to}.csv`,
    });
  }
}
