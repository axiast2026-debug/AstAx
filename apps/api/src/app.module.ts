import { Module, type DynamicModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import type { ApiConfig } from "./config/config.js";
import { HealthController } from "./health/health.controller.js";
import { DefaultDenyGuard } from "./http/default-deny.guard.js";
import { ProblemFilter } from "./http/problem.filter.js";
import { InfraModule, type InfraOverrides } from "./infra/infra.module.js";

@Module({})
export class AppModule {
  static forRoot(config: ApiConfig, overrides: InfraOverrides = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [InfraModule.forRoot(config, overrides)],
      controllers: [HealthController],
      providers: [
        { provide: APP_GUARD, useClass: DefaultDenyGuard },
        { provide: APP_FILTER, useClass: ProblemFilter },
      ],
    };
  }
}
