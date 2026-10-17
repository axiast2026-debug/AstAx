import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { PenaltiesService } from "./penalties.service.js";

const uuid = z.uuid();
const reason = z.string().trim().min(3).max(1000);
const proposeSchema = z.strictObject({
  organizationId: uuid,
  type: z.enum(["LATE_ISSUANCE", "MISSED_ISSUANCE", "CIRCUMVENTION"]),
  quoteRequestId: uuid.optional(),
  reason,
});

/** EMI-05, EMI-06, EMI-07: penalties and suspensions (spec 06, spec 07, spec 04 «Contabilità»). */
@ApiTags("penalties")
@ApiBearerAuth()
@Controller()
export class PenaltiesController {
  constructor(@Inject(PenaltiesService) private readonly penalties: PenaltiesService) {}

  @Get("back-office/penalties")
  @RequirePermission("penalty.propose")
  list(@CurrentAuth() auth: AuthContext) {
    return this.penalties.list(auth);
  }

  @Post("back-office/penalties")
  @HttpCode(201)
  @RequirePermission("penalty.propose")
  propose(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const input = parseInput(proposeSchema, body);
    return this.penalties.propose(auth, {
      organizationId: input.organizationId,
      type: input.type,
      reason: input.reason,
      ...(input.quoteRequestId ? { quoteRequestId: input.quoteRequestId } : {}),
    });
  }

  @Post("back-office/penalties/:id/apply")
  @HttpCode(200)
  @RequirePermission("penalty.apply")
  apply(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.penalties.apply(auth, parseInput(uuid, id));
  }

  @Post("back-office/penalties/:id/cancel")
  @HttpCode(200)
  @RequirePermission("penalty.apply")
  cancel(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.penalties.cancel(
      auth,
      parseInput(uuid, id),
      parseInput(z.strictObject({ reason }), body).reason,
    );
  }

  @Get("agency/penalties")
  @RequirePermission("penalty.contest")
  agencyList(@CurrentAuth() auth: AuthContext) {
    return this.penalties.agencyList(auth);
  }

  @Post("agency/penalties/:id/contest")
  @HttpCode(200)
  @RequirePermission("penalty.contest")
  contest(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.penalties.contest(
      auth,
      parseInput(uuid, id),
      parseInput(z.strictObject({ text: reason }), body).text,
    );
  }

  @Get("admin/penalties")
  @RequirePermission("penalty.decideContest")
  adminList(@CurrentAuth() auth: AuthContext) {
    return this.penalties.list(auth);
  }

  @Post("admin/penalties/:id/decide")
  @HttpCode(200)
  @RequirePermission("penalty.decideContest")
  decide(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.penalties.decide(
      auth,
      parseInput(uuid, id),
      parseInput(
        z.strictObject({ outcome: z.enum(["UPHELD", "CANCELLED"]), decision: reason }),
        body,
      ),
    );
  }

  @Get("admin/suspensions")
  @RequirePermission("organization.suspend")
  suspensions(@CurrentAuth() auth: AuthContext) {
    return this.penalties.suspensions(auth);
  }

  @Post("admin/suspensions/:id/decide")
  @HttpCode(200)
  @RequirePermission("organization.suspend")
  decideSuspension(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = parseInput(
      z.strictObject({ outcome: z.enum(["CONFIRM", "REVOKE"]), reason }),
      body,
    );
    return this.penalties.decideSuspension(auth, parseInput(uuid, id), input.outcome, input.reason);
  }
}
