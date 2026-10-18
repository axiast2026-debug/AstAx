import {
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC } from "../http/public.decorator.js";
import { RateLimiter } from "./rate-limiter.js";

export const SKIP_RATE_LIMIT = "astax:skipRateLimit";

/**
 * A public endpoint that the limit per IP does not cover: the health check
 * (the load balancer), the providers' webhooks (signed, from few addresses)
 * and the fake providers of development.
 */
export const SkipRateLimit = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_RATE_LIMIT, true);

/**
 * Phase 8: every endpoint without an account counts against the limit of its
 * IP address (security.publicRequestsPerMinute). It runs before the AuthGuard.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (!this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT, targets)) return true;
    const request = context.switchToHttp().getRequest<Request>();
    await this.limiter.consume("public", request.ip ?? "unknown");
    return true;
  }
}
