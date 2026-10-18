import * as Sentry from "@sentry/node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { NodeSDK, type api, type core, type tracing } from "@opentelemetry/sdk-node";

/**
 * A path as it may leave: no query string, and every segment that may be an
 * identifier, a token or a code («/customer-links/<token>») becomes «:id».
 */
export function maskedPath(url: string): string {
  const path = url.split("?")[0] ?? "";
  return path
    .split("/")
    .map((segment) => (/^[a-z-]{1,40}$/.test(segment) || segment === "" ? segment : ":id"))
    .join("/");
}

/** The only span attributes that leave the process (rule 8): no IP, user agent or host. */
const ALLOWED_ATTRIBUTES = new Set([
  "http.method",
  "http.request.method",
  "http.status_code",
  "http.response.status_code",
  "http.route",
  "http.flavor",
  "network.protocol.version",
]);

/** Keeps only the allowed attributes and masks the paths, then exports. */
export class SanitizingExporter implements tracing.SpanExporter {
  constructor(private readonly next: tracing.SpanExporter) {}

  export(spans: tracing.ReadableSpan[], done: (result: core.ExportResult) => void): void {
    this.next.export(spans.map(sanitizedSpan), done);
  }

  shutdown(): Promise<void> {
    return this.next.shutdown();
  }
}

export function sanitizedSpan(span: tracing.ReadableSpan): tracing.ReadableSpan {
  const attributes: api.Attributes = {};
  for (const [key, value] of Object.entries(span.attributes)) {
    if (ALLOWED_ATTRIBUTES.has(key)) attributes[key] = value;
  }
  const path = span.attributes["url.path"] ?? span.attributes["http.target"];
  if (typeof path === "string") attributes["url.path"] = maskedPath(path);
  // Same span, other attributes and a name without identifiers.
  return Object.assign(
    Object.create(Object.getPrototypeOf(span) as object) as tracing.ReadableSpan,
    span,
    {
      attributes,
      // «GET /path»: the method stays, the path is masked.
      name: span.name.replace(/\/\S*/, (path) => maskedPath(path)),
    },
  );
}

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
      traceExporter: new SanitizingExporter(new OTLPTraceExporter()),
      // Only the calls received, never the calls made (their addresses can be
      // personal: Web Push endpoints); the health checks are not traced.
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (request) => (request.url ?? "").startsWith("/health"),
          ignoreOutgoingRequestHook: () => true,
        }),
      ],
    }).start();
  }
}

/** An unexpected error, to Sentry when it is on (the log line is written by the caller). */
export function reportError(error: unknown): void {
  if (sentryOn) Sentry.captureException(error);
}
