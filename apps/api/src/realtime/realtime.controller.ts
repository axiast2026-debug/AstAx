import { Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { RealtimeGateway } from "./realtime.gateway.js";

/** The ticket the web app's server hands to the browser for the realtime connection (ADR 0008). */
@ApiTags("realtime")
@ApiBearerAuth()
@Controller("realtime")
export class RealtimeController {
  constructor(@Inject(RealtimeGateway) private readonly gateway: RealtimeGateway) {}

  @Post("ticket")
  @HttpCode(201)
  @RequirePermission("notification.viewOwn")
  ticket(@CurrentAuth() auth: AuthContext) {
    return this.gateway.issueTicket(auth);
  }
}
