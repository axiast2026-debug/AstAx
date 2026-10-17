import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { WithdrawalsService } from "./withdrawals.service.js";

const uuid = z.uuid();

/** S08, PAG-04, PAG-05: the withdrawal (spec 03, spec 04, spec 06). */
@ApiTags("withdrawals")
@ApiBearerAuth()
@Controller()
export class WithdrawalsController {
  constructor(@Inject(WithdrawalsService) private readonly withdrawals: WithdrawalsService) {}

  @Post("policies/:id/withdrawal")
  @HttpCode(201)
  @RequirePermission("request.viewOwn")
  request(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.withdrawals.request(auth, parseInput(uuid, id));
  }

  @Get("back-office/withdrawals")
  @RequirePermission("withdrawal.manage")
  backOfficeList(@CurrentAuth() auth: AuthContext) {
    return this.withdrawals.backOfficeList(auth);
  }

  @Post("back-office/policies/:id/withdrawal")
  @HttpCode(201)
  @RequirePermission("withdrawal.manage")
  forCustomer(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.withdrawals.requestForCustomer(auth, parseInput(uuid, id));
  }

  @Get("agency/withdrawals")
  @RequirePermission("withdrawal.indicateRefundablePremium")
  agencyList(@CurrentAuth() auth: AuthContext) {
    return this.withdrawals.agencyList(auth);
  }

  @Post("agency/withdrawals/:id/price")
  @HttpCode(200)
  @RequirePermission("withdrawal.indicateRefundablePremium")
  price(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const { refundableCents } = parseInput(
      z.strictObject({ refundableCents: z.int().min(0) }),
      body,
    );
    return this.withdrawals.price(auth, parseInput(uuid, id), refundableCents);
  }
}
