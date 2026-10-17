import { Body, Controller, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { DevToolsService } from "./dev-tools.service.js";

const uuid = z.uuid();

/** Development tools (rule 13): 404 unless DEV_TOOLS=true; never in production. */
@ApiTags("dev")
@ApiBearerAuth()
@Controller("dev")
export class DevToolsController {
  constructor(@Inject(DevToolsService) private readonly tools: DevToolsService) {}

  @Post("requests/:id/fire-next-timer")
  @HttpCode(200)
  @RequirePermission("devTools.use")
  fire(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tools.fireNextTimer(auth, parseInput(uuid, id));
  }

  @Post("auctions/:id/test-offers")
  @HttpCode(200)
  @RequirePermission("devTools.use")
  testOffers(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const { count } = parseInput(
      z.strictObject({ count: z.number().int().min(1).max(8).default(3) }),
      body ?? {},
    );
    return this.tools.testOffers(auth, parseInput(uuid, id), count);
  }

  @Post("clock")
  @HttpCode(200)
  @RequirePermission("devTools.use")
  advance(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const input = parseInput(
      z.union([
        z.strictObject({
          advanceMinutes: z
            .number()
            .int()
            .min(1)
            .max(60 * 24 * 60),
        }),
        // Back to the real time (tests, the end of a demo).
        z.strictObject({ reset: z.literal(true) }),
      ]),
      body,
    );
    return this.tools.advanceClock(auth, "reset" in input ? null : input.advanceMinutes);
  }
}
