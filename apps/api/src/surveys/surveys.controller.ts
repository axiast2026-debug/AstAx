import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { Public } from "../http/public.decorator.js";
import { parseInput } from "../http/validation.js";
import { SurveysService } from "./surveys.service.js";

const token = z.string().regex(/^[A-Za-z0-9_-]{40,60}$/);
const score = z.int().min(1).max(5);
const answerSchema = z.strictObject({
  overall: score,
  clarity: score,
  agency: score,
  contactedByOthers: z.boolean(),
});

/** The questionnaire after the sale, from the emailed link (public, by token). */
@ApiTags("surveys")
@Controller("surveys/:token")
export class SurveysController {
  constructor(@Inject(SurveysService) private readonly surveys: SurveysService) {}

  @Get()
  @Public()
  view(@Param("token") value: string) {
    return this.surveys.view(parseInput(token, value));
  }

  @Post()
  @HttpCode(200)
  @Public()
  answer(@Param("token") value: string, @Body() body: unknown) {
    return this.surveys.answer(parseInput(token, value), parseInput(answerSchema, body));
  }
}

/** Spec 06 «Segnalazioni». */
@ApiTags("flags")
@ApiBearerAuth()
@Controller("back-office/flags")
export class FlagsController {
  constructor(@Inject(SurveysService) private readonly surveys: SurveysService) {}

  @Get()
  @RequirePermission("complaint.manage")
  list(@CurrentAuth() auth: AuthContext) {
    return this.surveys.flags(auth);
  }

  @Post(":id/decide")
  @HttpCode(200)
  @RequirePermission("complaint.manage")
  decide(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(
      z.strictObject({
        status: z.enum(["ARCHIVED", "PENALTY_PROPOSED", "SUSPENSION_PROPOSED"]),
        outcome: z.string().trim().min(3).max(1000),
      }),
      body,
    );
    return this.surveys.decide(auth, parseInput(z.uuid(), id), input.status, input.outcome);
  }
}
