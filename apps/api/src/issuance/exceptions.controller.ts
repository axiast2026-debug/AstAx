import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ExceptionsOverviewService } from "../admin/exceptions-overview.service.js";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import type { ApiConfig } from "../config/config.js";
import { parseInput } from "../http/validation.js";
import { CONFIG } from "../infra/tokens.js";
import { RefundsService } from "../refunds/refunds.service.js";
import { ExceptionsService } from "./exceptions.service.js";

const uuid = z.uuid();
const decideSchema = z.strictObject({
  fault: z.enum(["AGENCY", "CUSTOMER"]),
  reason: z.string().trim().min(3).max(500),
  newPremiumCents: z.number().int().positive().optional(),
});
const reasonSchema = z.strictObject({ reason: z.string().trim().min(3).max(500) });
const returnSchema = z.strictObject({
  returnPath: z
    .string()
    .regex(/^\/[A-Za-z0-9/_-]*$/)
    .max(200),
});

/** Spec 06 «Eccezioni» and «Pagamenti»: missed issuances and refunds (EMI-04, PAG-05). */
@ApiTags("back-office")
@ApiBearerAuth()
@Controller("back-office")
export class ExceptionsController {
  constructor(
    @Inject(ExceptionsService) private readonly exceptions: ExceptionsService,
    @Inject(RefundsService) private readonly refunds: RefundsService,
    @Inject(ExceptionsOverviewService) private readonly overviewService: ExceptionsOverviewService,
  ) {}

  /** Spec 06 «Eccezioni»: deserted requests and reconfirmations in progress. */
  @Get("exceptions")
  @RequirePermission("issuance.decideMissed")
  overview(@CurrentAuth() auth: AuthContext) {
    return this.overviewService.overview(auth);
  }

  @Get("issuance-problems")
  @RequirePermission("issuance.decideMissed")
  problems(@CurrentAuth() auth: AuthContext) {
    return this.exceptions.list(auth);
  }

  @Post("issuance-problems/:id/decide")
  @HttpCode(200)
  @RequirePermission("issuance.decideMissed")
  decide(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(decideSchema, body);
    return this.exceptions.decide(auth, parseInput(uuid, id), {
      fault: input.fault,
      reason: input.reason,
      ...(input.newPremiumCents ? { newPremiumCents: input.newPremiumCents } : {}),
    });
  }

  @Get("refunds")
  @RequirePermission("accounting.view")
  refundList(@CurrentAuth() auth: AuthContext) {
    return this.refunds.list(auth);
  }

  @Post("refunds/:id/approve")
  @HttpCode(200)
  @RequirePermission("refund.approve")
  approve(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.refunds.approve(auth, parseInput(uuid, id));
  }

  @Post("refunds/:id/reject")
  @HttpCode(200)
  @RequirePermission("refund.approve")
  reject(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.refunds.reject(auth, parseInput(uuid, id), parseInput(reasonSchema, body).reason);
  }
}

/** EMI-04 for the customer: the second offer or the new price, with 24 hours to answer. */
@ApiTags("acceptance")
@ApiBearerAuth()
@Controller("requests/:id/next-offer")
export class NextOfferController {
  constructor(
    @Inject(ExceptionsService) private readonly exceptions: ExceptionsService,
    @Inject(CONFIG) private readonly config: ApiConfig,
  ) {}

  @Get()
  @RequirePermission("offers.viewPresented")
  view(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.exceptions.view(auth, parseInput(uuid, id));
  }

  @Post("confirm")
  @HttpCode(200)
  @RequirePermission("offer.accept")
  confirm(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.exceptions.confirm(
      auth,
      parseInput(uuid, id),
      `${this.config.WEB_URL}${parseInput(returnSchema, body).returnPath}`,
    );
  }

  @Post("refuse")
  @HttpCode(200)
  @RequirePermission("offer.accept")
  refuse(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.exceptions.refuse(auth, parseInput(uuid, id));
  }
}
