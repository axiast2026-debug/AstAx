import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";
import { redact, scrubString } from "./redact.js";

export type { Logger } from "pino";

export interface CreateLoggerOptions {
  name: string;
  level?: LoggerOptions["level"];
  /** Where to write; standard output by default. Tests pass an in-memory stream. */
  destination?: DestinationStream;
}

/**
 * The only logger of API and worker. Every record goes through `redact`,
 * message strings included, so personal data never reaches the logs (SIC-06).
 */
export function createLogger({ name, level = "info", destination }: CreateLoggerOptions): Logger {
  const options: LoggerOptions = {
    name,
    level,
    base: { service: name },
    serializers: { err: (error: unknown) => redact(error) },
    formatters: {
      log: (object) => redact(object) as Record<string, unknown>,
    },
    hooks: {
      logMethod(args, method) {
        const cleaned = args.map((arg) => (typeof arg === "string" ? scrubString(arg) : arg));
        method.apply(this, cleaned as Parameters<typeof method>);
      },
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
