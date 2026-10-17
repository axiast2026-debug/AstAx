import { Module, type DynamicModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AuditController } from "./audit/audit.controller.js";
import { AuditService } from "./audit/audit.service.js";
import { AuthGuard } from "./auth/auth.guard.js";
import { UserResolver } from "./auth/user-resolver.js";
import type { ApiConfig } from "./config/config.js";
import { HealthController } from "./health/health.controller.js";
import { ProblemFilter } from "./http/problem.filter.js";
import { IdentitySync } from "./identity/identity-sync.js";
import { InfraModule, type InfraOverrides } from "./infra/infra.module.js";
import { LegalController } from "./legal/legal.controller.js";
import { LegalGate } from "./legal/legal-gate.js";
import { LegalService } from "./legal/legal.service.js";
import { MeController } from "./me/me.controller.js";
import { NotificationService } from "./notifications/notification.service.js";
import { NotificationsController } from "./notifications/notifications.controller.js";
import { AutoCheckService } from "./requests/auto-check.service.js";
import { ConsentLinksController } from "./requests/consent-links.controller.js";
import { ConsentService } from "./requests/consent.service.js";
import { CustomersController } from "./requests/customers.controller.js";
import { CustomersService } from "./requests/customers.service.js";
import { ReferenceService } from "./requests/reference.service.js";
import { RequestsController } from "./requests/requests.controller.js";
import { RequestsService } from "./requests/requests.service.js";
import {
  AcceptanceController,
  CustomerLinksController,
  FakeProvidersController,
  WebhooksController,
} from "./acceptance/acceptance.controller.js";
import { AcceptanceEventsService } from "./acceptance/acceptance-events.service.js";
import { AcceptanceService } from "./acceptance/acceptance.service.js";
import { CustomerLinksService } from "./acceptance/customer-links.service.js";
import { AgencyController } from "./agency/agency.controller.js";
import { QuoteChecksController } from "./auctions/auctions.controller.js";
import { QuoteChecksService } from "./auctions/quote-checks.service.js";
import { AgencyService } from "./agency/agency.service.js";
import { AgencySettingsService } from "./agency/agency-settings.service.js";
import { AuctionsController } from "./auctions/auctions.controller.js";
import { AuctionsService } from "./auctions/auctions.service.js";
import { OffersService } from "./auctions/offers.service.js";
import { DevToolsController } from "./dev/dev-tools.controller.js";
import { DevToolsService } from "./dev/dev-tools.service.js";
import { RealtimeController } from "./realtime/realtime.controller.js";
import { RealtimeGateway } from "./realtime/realtime.gateway.js";
import { RealtimeHub } from "./realtime/realtime-hub.js";
import { AgencyPreviewService } from "./verification/agency-preview.service.js";
import { VerificationController } from "./verification/verification.controller.js";
import { VerificationService } from "./verification/verification.service.js";
import { ComplaintsIndexController } from "./settings/complaints-index.controller.js";
import { ExceptionsController, NextOfferController } from "./issuance/exceptions.controller.js";
import { ExceptionsService } from "./issuance/exceptions.service.js";
import { IssuanceController } from "./issuance/issuance.controller.js";
import { PenaltiesController } from "./penalties/penalties.controller.js";
import { PenaltiesService } from "./penalties/penalties.service.js";
import { RefundsService } from "./refunds/refunds.service.js";
import { IssuanceService } from "./issuance/issuance.service.js";
import { InvoicesService } from "./invoicing/invoices.service.js";
import { InvoicingService } from "./invoicing/invoicing.service.js";
import { RemittancesController } from "./remittances/remittances.controller.js";
import { ResultsController } from "./results/results.controller.js";
import { ResultsService } from "./results/results.service.js";
import { RemittancesService } from "./remittances/remittances.service.js";
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
        ComplaintsIndexController,
        IssuanceController,
        ExceptionsController,
        NextOfferController,
        PenaltiesController,
        RemittancesController,
        ResultsController,
        AuditController,
        RequestsController,
        CustomersController,
        ConsentLinksController,
        VerificationController,
        NotificationsController,
        AuctionsController,
        AgencyController,
        AcceptanceController,
        WebhooksController,
        CustomerLinksController,
        FakeProvidersController,
        QuoteChecksController,
        RealtimeController,
        DevToolsController,
      ],
      providers: [
        AuditService,
        UserResolver,
        LegalService,
        LegalGate,
        TeamService,
        SettingsService,
        NotificationService,
        ReferenceService,
        AutoCheckService,
        RequestsService,
        ConsentService,
        CustomersService,
        VerificationService,
        AgencyPreviewService,
        OffersService,
        AuctionsService,
        AgencyService,
        AgencySettingsService,
        AcceptanceService,
        AcceptanceEventsService,
        CustomerLinksService,
        IssuanceService,
        ExceptionsService,
        RefundsService,
        PenaltiesService,
        InvoicingService,
        InvoicesService,
        RemittancesService,
        ResultsService,
        QuoteChecksService,
        RealtimeHub,
        RealtimeGateway,
        DevToolsService,
        IdentitySync,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: ProblemFilter },
      ],
    };
  }
}
