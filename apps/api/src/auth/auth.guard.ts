import { can, type Action, type Actor } from "@astax/shared/permissions";
import type { Logger } from "@astax/shared/logging";
import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuditService, type AuditActor } from "../audit/audit.service.js";
import { ProblemError } from "../http/problem.js";
import { IS_PUBLIC } from "../http/public.decorator.js";
import { LOGGER, TOKEN_VERIFIER } from "../infra/tokens.js";
import { LegalGate } from "../legal/legal-gate.js";
import {
  CONTEXT_HEADER,
  kindFromToken,
  type ActiveMembership,
  type AuthContext,
  type AuthenticatedRequest,
  type UserKind,
} from "./auth-context.js";
import { ALLOW_PENDING_LEGAL, NO_CONTEXT, REQUIRED_PERMISSION } from "./decorators.js";
import { InvalidTokenError, type TokenVerifier } from "./token-verifier.js";
import { UserResolver } from "./user-resolver.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORG_TYPES_BY_KIND: Record<Exclude<UserKind, "PRIVATE">, string[]> = {
  PROFESSIONAL: ["AGENCY", "BROKER"],
  STAFF: ["ASTAX"],
};

const memberActor = (m: ActiveMembership): Actor => ({
  kind: "MEMBER",
  role: m.role,
  organizationType: m.organizationType,
  flags: m.flags,
});

/**
 * The only door of the API (SIC-01, CLAUDE.md rule 3):
 *  1. @Public endpoints pass;
 *  2. a valid Keycloak token is required (401 otherwise);
 *  3. the token's client must match the user's kind, and the user must be active;
 *  4. professionals and staff work in a context: X-AstAx-Context names one of
 *     their active memberships (403 CONTEXT_REQUIRED / CONTEXT_INVALID);
 *  5. the endpoint must declare a permission and the actor must hold it;
 *  6. pending legal documents block everything else (LEG-02).
 * Every refusal after authentication is written to the audit log.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
    @Inject(UserResolver) private readonly users: UserResolver,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LegalGate) private readonly legal: LegalGate,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  private meta<T>(key: string, context: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [context.getHandler(), context.getClass()]);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.meta<boolean>(IS_PUBLIC, context)) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const route = `${request.method} ${(request.route as { path?: string } | undefined)?.path ?? request.path}`;
    const ip = request.ip ?? null;
    const userAgent = request.header("user-agent")?.slice(0, 300) ?? null;

    const header = request.header("authorization");
    const raw = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!raw) throw new ProblemError("UNAUTHENTICATED");
    let token;
    try {
      token = await this.verifier.verify(raw);
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        // Anonymous failures are not chained in the audit log (they could flood it): one log line.
        this.logger.warn({ route }, "invalid access token");
        throw new ProblemError("UNAUTHENTICATED");
      }
      throw error;
    }

    const deny = async (
      code: "FORBIDDEN" | "CONTEXT_REQUIRED" | "CONTEXT_INVALID" | "LEGAL_ACCEPTANCE_REQUIRED",
      actor: AuditActor,
      details: Record<string, unknown>,
    ): Promise<never> => {
      await this.audit.record(actor, {
        action: "ACCESS_DENIED",
        targetType: "Endpoint",
        targetId: route,
        after: { code, ...details },
      });
      throw new ProblemError(code);
    };
    const anonymousActor: AuditActor = {
      userId: null,
      membershipId: null,
      organizationId: null,
      ip,
      userAgent,
    };

    const kind = kindFromToken(token);
    if (!kind) return deny("FORBIDDEN", anonymousActor, { reason: "TOKEN_CLIENT_ROLE_MISMATCH" });
    const outcome = await this.users.resolve(token, kind, { ip, userAgent });
    if ("refused" in outcome) {
      return deny(
        "FORBIDDEN",
        { ...anonymousActor, userId: outcome.userId ?? null },
        { reason: outcome.refused },
      );
    }
    const user = outcome.user;
    const userActor: AuditActor = { ...anonymousActor, userId: user.id };
    if (user.status !== "ACTIVE")
      return deny("FORBIDDEN", userActor, { reason: "USER_NOT_ACTIVE" });

    const action = this.meta<Action>(REQUIRED_PERMISSION, context);
    if (!action) return deny("FORBIDDEN", userActor, { reason: "NO_PERMISSION_DECLARED" });

    let membership: ActiveMembership | null = null;
    let actor: Actor;
    if (kind === "PRIVATE") {
      actor = { kind: "PRIVATE" };
    } else {
      const memberships = (await this.users.activeMemberships(user.id)).filter((m) =>
        ORG_TYPES_BY_KIND[kind].includes(m.organizationType),
      );
      const requested = request.header(CONTEXT_HEADER);
      if (requested) {
        membership = UUID.test(requested)
          ? (memberships.find((m) => m.id === requested) ?? null)
          : null;
        if (!membership)
          return deny("CONTEXT_INVALID", userActor, { action, reason: "NOT_AN_ACTIVE_MEMBERSHIP" });
        actor = memberActor(membership);
      } else if (this.meta<boolean>(NO_CONTEXT, context)) {
        // Personal endpoints: allowed if any of the user's roles holds the permission.
        const holder = memberships.find((m) => can(memberActor(m), action));
        if (!holder) return deny("FORBIDDEN", userActor, { action, reason: "NO_ROLE_GRANTS_IT" });
        actor = memberActor(holder);
      } else {
        return deny("CONTEXT_REQUIRED", userActor, { action });
      }
    }

    const auth: AuthContext = {
      userId: user.id,
      keycloakId: token.sub,
      kind,
      membership,
      actor,
      db: {
        kind: "USER",
        userId: user.id,
        organizationId: membership?.organizationId ?? null,
        isStaff: membership?.organizationType === "ASTAX",
      },
      ip,
      userAgent,
    };
    const auditActor: AuditActor = {
      ...userActor,
      membershipId: membership?.id ?? null,
      organizationId: membership?.organizationId ?? null,
    };

    if (!can(actor, action)) return deny("FORBIDDEN", auditActor, { action });
    if (!this.meta<boolean>(ALLOW_PENDING_LEGAL, context) && (await this.legal.hasPending(auth))) {
      return deny("LEGAL_ACCEPTANCE_REQUIRED", auditActor, { action });
    }
    request.auth = auth;
    return true;
  }
}
