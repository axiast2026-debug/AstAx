import { loggedPath } from "./request-logger.js";
import { PROBLEM_CONTENT_TYPE, type ErrorCode } from "@astax/shared/errors";
import { errorForLog, type Logger } from "@astax/shared/logging";
import {
  Catch,
  HttpException,
  Inject,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { LOGGER } from "../infra/tokens.js";
import { reportError } from "../telemetry.js";
import { ProblemError, toProblem } from "./problem.js";

const HTTP_CODES: Record<number, ErrorCode> = {
  400: "VALIDATION_FAILED",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
};

/**
 * Every error leaves the API as application/problem+json with a stable code.
 * Unexpected errors become INTERNAL without any detail: the cause goes to the
 * (redacted) log only.
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const instance = request.path;

    let problem;
    if (exception instanceof ProblemError) {
      problem = toProblem(exception.code, instance, exception.detail, exception.errors);
    } else if (exception instanceof HttpException) {
      problem = toProblem(HTTP_CODES[exception.getStatus()] ?? "INTERNAL", instance);
    } else {
      this.logger.error(
        { err: errorForLog(exception), path: loggedPath(instance), method: request.method },
        "unhandled error",
      );
      problem = toProblem("INTERNAL", instance);
      reportError(exception);
    }
    if (exception instanceof ProblemError && exception.retryAfterSeconds !== undefined) {
      response.setHeader("retry-after", String(exception.retryAfterSeconds));
    }
    response.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(problem));
  }
}
