import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ProblemError } from "./problem.js";
import { IS_PUBLIC } from "./public.decorator.js";

/**
 * First global guard: an endpoint is closed unless it is marked @Public or a
 * later guard (authentication, permissions) lets the request through (SIC-01).
 * Until authentication exists, every non-public endpoint answers 401.
 */
@Injectable()
export class DefaultDenyGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    throw new ProblemError("UNAUTHENTICATED");
  }
}
