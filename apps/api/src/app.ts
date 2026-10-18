import "reflect-metadata";
import type { Clock } from "@astax/adapters/clock";
import type { Logger } from "@astax/shared/logging";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import { apiSecurityHeaders } from "@astax/shared/http";
import { raw, text, type NextFunction, type Request, type Response } from "express";
import { AppModule } from "./app.module.js";
import type { ApiConfig } from "./config/config.js";
import { requestLogger } from "./http/request-logger.js";
import type { InfraOverrides } from "./infra/infra.module.js";
import { NestPinoLogger } from "./infra/nest-logger.js";
import { CLOCK, LOGGER } from "./infra/tokens.js";

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle("AstAx API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .addApiKey({ type: "apiKey", in: "header", name: "X-AstAx-Context" }, "context")
    .build();
  return SwaggerModule.createDocument(app, options);
}

/** Builds the configured application; `main.ts` listens, tests call it directly. */
export async function createApp(
  config: ApiConfig,
  overrides: InfraOverrides = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(config, overrides),
    {
      bufferLogs: true,
    },
  );
  const logger = app.get<Logger>(LOGGER);
  app.useLogger(new NestPinoLogger(logger));
  app.disable("x-powered-by");
  app.set(
    "trust proxy",
    config.API_TRUST_PROXY.split(",").map((p) => p.trim()),
  );
  app.use(requestLogger(logger, app.get<Clock>(CLOCK)));
  // Phase 8: nothing the API answers may run or be framed (the Swagger page of development aside).
  const securityHeaders = Object.entries(apiSecurityHeaders(config.NODE_ENV === "production"));
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (!request.path.startsWith("/docs")) {
      for (const [key, value] of securityHeaders) response.setHeader(key, value);
    }
    next();
  });
  // Document uploads send the file itself as the body. The technical cap is
  // generous; the business limit is documents.maxUploadMb, checked by the use case.
  app.use(/^\/requests\/[^/]+\/documents$/, raw({ type: () => true, limit: "60mb" }));
  // Offers: the PDF quote is the body (the content is sealed at once, BC-02).
  app.use(
    /^\/(auctions\/[^/]+\/offers|offers\/[^/]+)$/,
    raw({ type: "application/pdf", limit: "60mb" }),
  );
  // The information set of a product of the agency library (decision 17).
  app.use(/^\/agency\/products\/[^/]+\/documents$/, raw({ type: () => true, limit: "60mb" }));
  // Phase 7: the professional liability policy of an entry (public link: a smaller cap).
  app.use(/^\/onboarding\/[^/]+\/prof-insurance$/, raw({ type: () => true, limit: "20mb" }));
  // Phase 7: the bank statement of the separate account (CSV or camt.053).
  app.use(/^\/back-office\/reconciliation\/statements$/, raw({ type: () => true, limit: "20mb" }));
  // Phase 7: the broker's bulk upload (CSV, or ZIP with the CSV and the documents).
  app.use("/broker/bulk-uploads", raw({ type: () => true, limit: "60mb" }));
  // EMI-02: policy, receipt and certificate, uploaded by the agency as the body.
  app.use(
    /^\/agency\/issuance\/[^/]+\/documents\/[A-Z_]+$/,
    raw({ type: () => true, limit: "60mb" }),
  );
  // The providers sign the exact bytes of their webhooks: kept as text to check them.
  // A path, not a regular expression: Express 5 never matched /^\/webhooks\//.
  app.use("/webhooks", text({ type: () => true, limit: "1mb" }));
  app.enableShutdownHooks();

  // The description of the API only outside production (phase 8, ASVS V14).
  if (config.NODE_ENV !== "production") {
    const document = buildOpenApi(app);
    app.getHttpAdapter().get("/openapi.json", (_request, response) => {
      (response as { json(body: unknown): void }).json(document);
    });
    SwaggerModule.setup("docs", app, document);
  }
  return app;
}
