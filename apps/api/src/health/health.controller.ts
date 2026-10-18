import type { Clock } from "@astax/adapters/clock";
import type { DbClient } from "@astax/db";
import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../http/public.decorator.js";
import { SkipRateLimit } from "../security/rate-limit.guard.js";
import { CLOCK, DB } from "../infra/tokens.js";

export interface HealthStatus {
  status: "ok" | "degraded";
  database: "ok" | "unreachable";
  time: string;
}

@ApiTags("health")
@SkipRateLimit()
@Controller("health")
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get()
  @Public()
  @ApiOkResponse({ description: "Service and database status" })
  async check(): Promise<HealthStatus> {
    let database: HealthStatus["database"] = "ok";
    try {
      await this.db.$queryRaw`SELECT 1`;
    } catch {
      database = "unreachable";
    }
    return {
      status: database === "ok" ? "ok" : "degraded",
      database,
      time: this.clock.now().toISOString(),
    };
  }
}
