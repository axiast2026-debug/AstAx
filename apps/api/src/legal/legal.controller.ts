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
const reason = z.string().trim().min(3).max(500);
const newVersionSchema = z.object({ contentMd: z.string().min(1).max(200_000), reason }).strict();
const validateSchema = z.object({ reason }).strict();
const publishSchema = z.strictObject({ reason, summary: z.string().trim().min(3).max(500) });

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

  /** Spec 07 «Contratti e documenti legali»: every document with its versions. */
  @Get("admin/legal/documents")
  @RequirePermission("admin.legal.manage")
  async documents(@CurrentAuth() auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) =>
      (
        await tx.legalDocument.findMany({
          include: { versions: { orderBy: { number: "desc" } } },
          orderBy: { key: "asc" },
        })
      ).map((d) => ({
        key: d.key,
        title: d.title,
        audiences: d.audiences,
        moment: d.moment,
        versions: d.versions.map((v) => ({
          id: v.id,
          number: v.number,
          status: v.status,
          contentMd: v.contentMd,
          validatedAt: v.validatedAt?.toISOString() ?? null,
          publishedAt: v.publishedAt?.toISOString() ?? null,
        })),
      })),
    );
  }

  /**
   * LEG-02, phase 7: publishes a version: from now it is the one in force,
   * and everyone concerned accepts it at the next access (legal.new_version).
   */
  @Post("admin/legal/versions/:id/publish")
  @HttpCode(200)
  @RequirePermission("admin.legal.manage")
  async publish(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(publishSchema, body);
    const now = this.clock.now();
    return this.legal.publish(auth, parseInput(z.uuid(), id), input.reason, input.summary, now);
  }

  /** A new version of a legal text, as a draft: published apart (LEG-02). */
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
          createdAt: now,
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "LEGAL_VERSION_CREATED",
        targetType: "LegalDocumentVersion",
        targetId: version.id,
        before: document.versions[0]
          ? { number: document.versions[0].number, status: document.versions[0].status }
          : null,
        after: { key, number, status: version.status },
        reason: input.reason,
      });
      return { id: version.id, key, number, status: version.status };
    });
  }

  /** Marks a version as validated by the lawyer (LEG-03); only then can production start. */
  @Post("admin/legal/versions/:id/validate")
  @RequirePermission("admin.legal.manage")
  async validate(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(validateSchema, body);
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
        reason: input.reason,
      });
      return { id, status: updated.status };
    });
  }
}
