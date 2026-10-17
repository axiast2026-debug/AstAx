import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { RenewalsService } from "./renewals.service.js";

const uuid = z.uuid();

/** Process 10: «Rinnova in asta» (spec 03) and «Rinnovi» of the broker (spec 02). */
@ApiTags("renewals")
@ApiBearerAuth()
@Controller()
export class RenewalsController {
  constructor(@Inject(RenewalsService) private readonly renewals: RenewalsService) {}

  @Post("policies/:id/renew")
  @HttpCode(201)
  @RequirePermission("request.create")
  renew(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.renewals.renew(auth, parseInput(uuid, id));
  }

  @Get("broker/renewals")
  @RequirePermission("request.viewOwn")
  list(@CurrentAuth() auth: AuthContext) {
    return this.renewals.brokerRenewals(auth);
  }

  @Post("policies/:id/auto-renewal")
  @HttpCode(200)
  @RequirePermission("request.create")
  autoRenewal(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const { enabled } = parseInput(z.strictObject({ enabled: z.boolean() }), body);
    return this.renewals.setAutoRenewal(auth, parseInput(uuid, id), enabled);
  }

  @Post("broker/renewals/bulk")
  @HttpCode(200)
  @RequirePermission("request.create")
  bulk(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const { period } = parseInput(
      z.strictObject({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }),
      body,
    );
    return this.renewals.bulk(auth, period);
  }
}
