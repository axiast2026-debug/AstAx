import { Module, type DynamicModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AuditController } from "./audit/audit.controller.js";
import { AuditService } from "./audit/audit.service.js";
import { AuthGuard } from "./auth/auth.guard.js";
import { UserResolver } from "./auth/user-resolver.js";
import type { ApiConfig } from "./config/config.js";
import { HealthController } from "./health/health.controller.js";
import { ProblemFilter } from "./http/problem.filter.js";
import { InfraModule, type InfraOverrides } from "./infra/infra.module.js";
import { LegalController } from "./legal/legal.controller.js";
import { LegalGate } from "./legal/legal-gate.js";
import { LegalService } from "./legal/legal.service.js";
import { MeController } from "./me/me.controller.js";
import { OutboxRunner } from "./outbox/outbox-runner.js";
import { SettingsController } from "./settings/settings.controller.js";
import { SettingsService } from "./settings/settings.service.js";
import { TeamController } from "./team/team.controller.js";
import { TeamService } from "./team/team.service.js";

@Module({})
export class AppModule {
  static forRoot(config: ApiConfig, overrides: InfraOverrides = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [InfraModule.forRoot(config, overrides)],
      controllers: [
        HealthController,
        MeController,
        LegalController,
        TeamController,
        SettingsController,
        AuditController,
      ],
      providers: [
        AuditService,
        UserResolver,
        LegalService,
        LegalGate,
        TeamService,
        SettingsService,
        OutboxRunner,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: ProblemFilter },
      ],
    };
  }
}
