import "reflect-metadata";
import type { Clock } from "@astax/adapters/clock";
import type { Logger } from "@astax/shared/logging";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import { raw } from "express";
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
  app.set("trust proxy", "loopback");
  app.use(requestLogger(logger, app.get<Clock>(CLOCK)));
  // Document uploads send the file itself as the body. The technical cap is
  // generous; the business limit is documents.maxUploadMb, checked by the use case.
  app.use(/^\/requests\/[^/]+\/documents$/, raw({ type: () => true, limit: "60mb" }));
  // Offers: the PDF quote is the body (the content is sealed at once, BC-02).
  app.use(
    /^\/(auctions\/[^/]+\/offers|offers\/[^/]+)$/,
    raw({ type: "application/pdf", limit: "60mb" }),
  );
  app.enableShutdownHooks();

  const document = buildOpenApi(app);
  app.getHttpAdapter().get("/openapi.json", (_request, response) => {
    (response as { json(body: unknown): void }).json(document);
  });
  if (config.NODE_ENV !== "production") SwaggerModule.setup("docs", app, document);
  return app;
}
