import { Controller, Get, Inject } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { OperationsDashboardService } from "./operations-dashboard.service.js";

/** Spec 06 «Dashboard operativa». */
@ApiTags("back-office")
@ApiBearerAuth()
@Controller("back-office/dashboard")
export class OperationsDashboardController {
  constructor(
    @Inject(OperationsDashboardService) private readonly dashboard: OperationsDashboardService,
  ) {}

  @Get()
  @RequirePermission("backOffice.dashboard")
  overview(@CurrentAuth() auth: AuthContext) {
    return this.dashboard.overview(auth);
  }
}
