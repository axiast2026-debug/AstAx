import { Controller, Get, Inject } from "@nestjs/common";
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
}
