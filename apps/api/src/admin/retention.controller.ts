import { Controller, Get, HttpCode, Inject, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { RetentionService } from "./retention.service.js";

/** LEG-06: retention of the requests not concluded (admin.settings.manage). */
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/retention")
export class RetentionController {
  constructor(@Inject(RetentionService) private readonly retention: RetentionService) {}

  @Get()
  @RequirePermission("admin.settings.manage")
  preview(@CurrentAuth() auth: AuthContext) {
    return this.retention.preview(auth);
  }

  @Post("run")
  @HttpCode(200)
  @RequirePermission("admin.settings.manage")
  run(@CurrentAuth() auth: AuthContext) {
    return this.retention.run(auth);
  }
}
