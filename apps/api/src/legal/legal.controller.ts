import type { Clock } from "@astax/adapters/clock";
import { withContext, type DbClient } from "@astax/db";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import {
  AllowPendingLegal,
  CurrentAuth,
  NoContext,
  RequirePermission,
} from "../auth/decorators.js";
import { ProblemError } from "../http/problem.js";
import { parseInput } from "../http/validation.js";
import { CLOCK, DB } from "../infra/tokens.js";
import { LegalService } from "./legal.service.js";

const acceptSchema = z.object({ versionIds: z.array(z.uuid()).min(1).max(20) }).strict();
const newVersionSchema = z.object({ contentMd: z.string().min(1).max(200_000) }).strict();

@ApiTags("legal")
@ApiBearerAuth()
@Controller()
export class LegalController {
  constructor(
    @Inject(LegalService) private readonly legal: LegalService,
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Texts in force the user must accept before going on (LEG-02). */
  @Get("legal/pending")
  @RequirePermission("legal.acceptOwn")
  @NoContext()
  @AllowPendingLegal()
  pending(@CurrentAuth() auth: AuthContext) {
    return this.legal.pending(auth);
  }

  @Post("legal/acceptances")
  @HttpCode(201)
  @RequirePermission("legal.acceptOwn")
  @NoContext()
  @AllowPendingLegal()
  accept(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.legal.accept(auth, parseInput(acceptSchema, body).versionIds);
  }

  /** A new version of a legal text: in force at once, to be accepted again (LEG-02). */
  @Post("admin/legal/documents/:key/versions")
  @HttpCode(201)
  @RequirePermission("admin.legal.manage")
  async newVersion(
    @CurrentAuth() auth: AuthContext,
    @Param("key") key: string,
    @Body() body: unknown,
  ) {
    const input = parseInput(newVersionSchema, body);
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const document = await tx.legalDocument.findUnique({
        where: { key },
        include: { versions: { orderBy: { number: "desc" }, take: 1 } },
      });
      if (!document) throw new ProblemError("NOT_FOUND");
      const number = (document.versions[0]?.number ?? 0) + 1;
      const version = await tx.legalDocumentVersion.create({
        data: {
          documentId: document.id,
          number,
          contentMd: input.contentMd,
          status: "DRAFT",
          publishedAt: now,
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "LEGAL_VERSION_CREATED",
        targetType: "LegalDocumentVersion",
        targetId: version.id,
        after: { key, number },
      });
      return { id: version.id, key, number, status: version.status };
    });
  }

  /** Marks a version as validated by the lawyer (LEG-03); only then can production start. */
  @Post("admin/legal/versions/:id/validate")
  @RequirePermission("admin.legal.manage")
  async validate(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const version = await tx.legalDocumentVersion.findUnique({ where: { id } });
      if (!version) throw new ProblemError("NOT_FOUND");
      if (version.contentMd.includes("[DA VALIDARE — LEGALE]")) {
        throw new ProblemError("CONFLICT", "A placeholder text cannot be validated");
      }
      const updated = await tx.legalDocumentVersion.update({
        where: { id },
        data: { status: "VALIDATED", validatedByUserId: auth.userId, validatedAt: now },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "LEGAL_VERSION_VALIDATED",
        targetType: "LegalDocumentVersion",
        targetId: id,
        before: { status: version.status },
        after: { status: updated.status },
      });
      return { id, status: updated.status };
    });
  }
}
