import { Controller, Get, Inject, Query } from "@nestjs/common";
import { z } from "zod";
import { parseInput } from "../http/validation.js";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { ResultsService } from "./results.service.js";

/** Spec 04 «Risultati» (CLA-02, CLA-03, CLA-04). */
@ApiTags("results")
@ApiBearerAuth()
@Controller()
export class ResultsController {
  constructor(@Inject(ResultsService) private readonly results: ResultsService) {}

  @Get("agency/results")
  @RequirePermission("ranking.view")
  list(@CurrentAuth() auth: AuthContext) {
    return this.results.results(auth);
  }

  /** «Metriche» (Dan, 2026-10-21): the last 30 days, 3 months or 12 months. */
  @Get("agency/metrics")
  @RequirePermission("ranking.view")
  metrics(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    const { days } = parseInput(
      z.object({ days: z.enum(["30", "90", "365"]).default("30") }),
      query,
    );
    return this.results.metrics(auth, Number(days));
  }
}
