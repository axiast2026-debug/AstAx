import type { Clock } from "@astax/adapters/clock";
import { withContext, type DbClient } from "@astax/db";
import { Body, Controller, Get, Inject, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { ProblemError } from "../http/problem.js";
import { parseInput } from "../http/validation.js";
import { CLOCK, DB } from "../infra/tokens.js";

const setSchema = z.strictObject({
  companyId: z.uuid(),
  year: z.number().int().min(2000).max(2100),
  /** Complaints per 10.000 contracts (IVASS): not money, a decimal is fine. */
  value: z.number().min(0).max(100_000),
  source: z.string().trim().min(3).max(300),
});

/**
 * The complaints index of the companies (phase 5, PRES-07): one value per
 * company and year, used by the AI comparison (neutral when missing). Each
 * change is in the audit log with before and after (rule 4).
 */
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/complaints-index")
export class ComplaintsIndexController {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermission("admin.settings.manage")
  list(@CurrentAuth() auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) => {
      const [companies, values] = await Promise.all([
        tx.insuranceCompany.findMany({ orderBy: { name: "asc" } }),
        tx.companyComplaintsIndex.findMany({ orderBy: { year: "desc" } }),
      ]);
      return companies.map((c) => ({
        companyId: c.id,
        company: c.name,
        values: values
          .filter((v) => v.companyId === c.id)
          .map((v) => ({
            year: v.year,
            value: v.value,
            source: v.source,
            updatedAt: v.updatedAt.toISOString(),
          })),
      }));
    });
  }

  @Put()
  @RequirePermission("admin.settings.manage")
  set(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const input = parseInput(setSchema, body);
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const company = await tx.insuranceCompany.findUnique({ where: { id: input.companyId } });
      if (!company) throw new ProblemError("NOT_FOUND");
      const before = await tx.companyComplaintsIndex.findUnique({
        where: { companyId_year: { companyId: input.companyId, year: input.year } },
      });
      const saved = await tx.companyComplaintsIndex.upsert({
        where: { companyId_year: { companyId: input.companyId, year: input.year } },
        create: {
          companyId: input.companyId,
          year: input.year,
          value: input.value,
          source: input.source,
          createdByUserId: auth.userId,
          createdAt: now,
          updatedAt: now,
        },
        update: { value: input.value, source: input.source, updatedAt: now },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "COMPLAINTS_INDEX_SET",
        targetType: "InsuranceCompany",
        targetId: input.companyId,
        before: before ? { year: before.year, value: before.value, source: before.source } : null,
        after: { year: saved.year, value: saved.value, source: saved.source },
      });
      return { year: saved.year, value: saved.value, source: saved.source };
    });
  }
}
