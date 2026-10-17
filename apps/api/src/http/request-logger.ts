import { randomUUID } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import type { Logger } from "@astax/shared/logging";
import type { NextFunction, Request, Response } from "express";

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/** The secret tokens of the customers' links never reach the logs (rule 8). */
export function loggedPath(path: string): string {
  return path.replace(/^\/(customer-links|consent-links)\/[^/]+/, "/$1/:token");
}

/**
 * One log line per request: method, path without query string, status, duration
 * and request id. No headers, bodies or query strings: they may hold personal data.
 */
export function requestLogger(logger: Logger, clock: Clock) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const incoming = request.header("x-request-id");
    const requestId = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    response.setHeader("x-request-id", requestId);
    const startedAt = clock.now().getTime();
    response.on("finish", () => {
      logger.info(
        {
          requestId,
          method: request.method,
          path: loggedPath(request.path),
          status: response.statusCode,
          durationMs: clock.now().getTime() - startedAt,
        },
        "request",
      );
    });
    next();
  };
}
