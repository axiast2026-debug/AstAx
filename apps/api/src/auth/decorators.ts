import type { Action } from "@astax/shared/permissions";
import { createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { AuthContext, AuthenticatedRequest } from "./auth-context.js";
import { ProblemError } from "../http/problem.js";

export const REQUIRED_PERMISSION = "astax:permission";
export const NO_CONTEXT = "astax:no-context";
export const ALLOW_PENDING_LEGAL = "astax:allow-pending-legal";

/**
 * The action of docs/permessi.md this endpoint performs. An endpoint without it
 * (and not @Public) answers 403 to everyone (SIC-01).
 */
export const RequirePermission = (action: Action): MethodDecorator =>
  SetMetadata(REQUIRED_PERMISSION, action);

/**
 * The endpoint concerns the user, not an organization: professionals may call
 * it without X-AstAx-Context (profile, sessions, context selector, legal texts).
 */
export const NoContext = (): MethodDecorator => SetMetadata(NO_CONTEXT, true);

/** Reachable before the legal documents in force are accepted (LEG-02). */
export const AllowPendingLegal = (): MethodDecorator => SetMetadata(ALLOW_PENDING_LEGAL, true);

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const auth = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (!auth) throw new ProblemError("UNAUTHENTICATED");
    return auth;
  },
);
