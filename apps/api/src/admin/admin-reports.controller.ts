import { Controller, Get, Inject, Query, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { sendFile } from "../requests/requests.controller.js";
import { AdminReportsService } from "./admin-reports.service.js";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const filterSchema = z.strictObject({
  from: day,
  to: day,
  channel: z.enum(["PRIVATE", "BROKER"]).optional(),
  province: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
});

/** Spec 07 «Cruscotto», «Integrazioni», «Report ed esportazioni» (admin.reports.view). */
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin")
export class AdminReportsController {
  constructor(@Inject(AdminReportsService) private readonly reports: AdminReportsService) {}

  @Get("dashboard")
  @RequirePermission("admin.reports.view")
  dashboard(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    // Without dates: the current month up to today (Rome, from Clock).
    const input = parseInput(filterSchema.partial({ from: true, to: true }), query);
    return this.reports.dashboard(auth, input);
  }

  @Get("integrations")
  @RequirePermission("admin.reports.view")
  integrations(@CurrentAuth() auth: AuthContext) {
    return this.reports.integrations(auth);
  }

  @Get("reports/requests")
  @RequirePermission("admin.reports.view")
  async requests(
    @CurrentAuth() auth: AuthContext,
    @Query() query: unknown,
    @Res() response: Response,
  ) {
    sendFile(response, await this.reports.requestsCsv(auth, parseInput(filterSchema, query)));
  }

  @Get("reports/accounting")
  @RequirePermission("admin.reports.view")
  async accounting(
    @CurrentAuth() auth: AuthContext,
    @Query() query: unknown,
    @Res() response: Response,
  ) {
    sendFile(response, await this.reports.accountingCsv(auth, parseInput(filterSchema, query)));
  }
}
