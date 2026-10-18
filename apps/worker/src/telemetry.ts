import * as Sentry from "@sentry/node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";

/** The URL without its query string: it can hold codes or tokens (rule 8). */
const pathOnly = (url: string) => url.split("?")[0] ?? "";

/**
 * Phase 8, proposal D (docs/sorveglianza.md): errors to Sentry (EU), timings
 * to Grafana Cloud (EU) through OpenTelemetry. Each part starts only if its
 * address is configured (SENTRY_DSN, OTEL_EXPORTER_OTLP_ENDPOINT); without
 * them nothing leaves the process. Rule 8: Sentry receives the type and the
 * stack of an error, never the request, the user, cookies or breadcrumbs.
 */
let sentryOn = false;

/** What Sentry may keep of an error: its type and stack, nothing about the request or the person. */
export function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  delete event.request;
  delete event.user;
  delete event.extra;
  if (event.contexts) delete event.contexts.request;
  for (const exception of event.exception?.values ?? []) {
    // The message may hold what an error was built with: the type and the stack stay.
    exception.value = exception.type ?? "Error";
    for (const frame of exception.stacktrace?.frames ?? []) delete frame.vars;
  }
  return event;
}

export function startTelemetry(service: "api" | "worker"): void {
  const env = process.env;
  if (env.SENTRY_DSN) {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV ?? "development",
      ...(env.RELEASE ? { release: env.RELEASE } : {}),
      serverName: service,
      // Rule 8: no user, cookie, header, body, query string or variable leaves the process.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        databaseQueryData: false,
        stackFrameVariables: false,
        genAI: { inputs: false, outputs: false },
      },
      // Timings go through OpenTelemetry below, not through Sentry.
      enableOpenTelemetrySetup: false,
      tracesSampleRate: 0,
      beforeBreadcrumb: () => null,
      beforeSend: scrubEvent,
    });
    sentryOn = true;
  }
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    // Endpoint, headers (the Grafana token) from the standard OTEL_* variables.
    new NodeSDK({
      serviceName: `astax-${service}`,
      traceExporter: new OTLPTraceExporter(),
      // Only HTTP in and out: method, route and status; no header or body;
      // the health checks are not traced.
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (request) => (request.url ?? "").startsWith("/health"),
          requestHook: (span, request) => {
            const url = "url" in request ? request.url : undefined;
            if (typeof url !== "string") return;
            span.setAttribute("http.target", pathOnly(url));
            span.setAttribute("url.path", pathOnly(url));
            span.setAttribute("url.query", "");
            span.setAttribute("http.url", pathOnly(url));
            span.setAttribute("url.full", pathOnly(url));
          },
        }),
      ],
    }).start();
  }
}

/** An unexpected error, to Sentry when it is on (the log line is written by the caller). */
export function reportError(error: unknown): void {
  if (sentryOn) Sentry.captureException(error);
}
