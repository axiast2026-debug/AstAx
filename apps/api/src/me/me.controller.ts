import type { FieldCipher } from "@astax/adapters/crypto";
import { withContext, type DbClient } from "@astax/db";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import {
  AllowPendingLegal,
  CurrentAuth,
  NoContext,
  RequirePermission,
} from "../auth/decorators.js";
import { ProblemError } from "../http/problem.js";
import { parseInput } from "../http/validation.js";
import { DB, FIELD_CIPHER, IDENTITY_ADMIN } from "../infra/tokens.js";
import type { IdentityAdmin } from "../identity/identity-admin.js";

const updateProfileSchema = z.object({ locale: z.enum(["it", "sq"]) }).strict();

/** The caller's own profile, contexts and sessions (spec 01, «Profilo»). */
@ApiTags("me")
@ApiBearerAuth()
@Controller()
export class MeController {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(IDENTITY_ADMIN) private readonly identity: IdentityAdmin,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get("me")
  @RequirePermission("profile.view")
  @NoContext()
  @AllowPendingLegal()
  async me(@CurrentAuth() auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: auth.userId },
        include: {
          memberships: {
            where: { status: "ACTIVE", organization: { status: "ACTIVE" } },
            include: { organization: { select: { id: true, legalName: true, type: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      return {
        id: user.id,
        kind: user.kind,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.emailEnc ? this.cipher.decrypt(user.emailEnc) : null,
        phone: user.phoneEnc ? this.cipher.decrypt(user.phoneEnc) : null,
        locale: user.locale,
        memberships: user.memberships.map((m) => ({
          id: m.id,
          role: m.role,
          organization: {
            id: m.organization.id,
            name: m.organization.legalName,
            type: m.organization.type,
          },
          flags: {
            canIssue: m.canIssue,
            canSeeColleagueOffers: m.canSeeColleagueOffers,
            canSeeAccounting: m.canSeeAccounting,
            seesAllClients: m.seesAllClients,
          },
        })),
      };
    });
  }

  @Patch("me")
  @RequirePermission("profile.update")
  @NoContext()
  @AllowPendingLegal()
  async update(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const input = parseInput(updateProfileSchema, body);
    await withContext(this.db, auth.db, async (tx) => {
      const before = await tx.user.findUniqueOrThrow({
        where: { id: auth.userId },
        select: { locale: true },
      });
      await tx.user.update({ where: { id: auth.userId }, data: { locale: input.locale } });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "PROFILE_UPDATED",
        targetType: "User",
        targetId: auth.userId,
        before,
        after: input,
      });
    });
    return { locale: input.locale };
  }

  /** The active context, as chosen with X-AstAx-Context. */
  @Get("context")
  @RequirePermission("context.switch")
  async context(@CurrentAuth() auth: AuthContext) {
    if (!auth.membership) throw new ProblemError("CONTEXT_REQUIRED");
    const membership = auth.membership;
    return withContext(this.db, auth.db, async (tx) => {
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: membership.organizationId },
        select: { id: true, legalName: true, type: true },
      });
      return {
        membershipId: membership.id,
        role: membership.role,
        flags: membership.flags,
        organization: {
          id: organization.id,
          name: organization.legalName,
          type: organization.type,
        },
      };
    });
  }

  @Get("me/sessions")
  @RequirePermission("session.manageOwn")
  @NoContext()
  @AllowPendingLegal()
  async sessions(@CurrentAuth() auth: AuthContext) {
    const sessions = await this.identity.listSessions(auth.keycloakId);
    return sessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress ?? null,
      startedAt: new Date(s.start).toISOString(),
      lastAccessAt: new Date(s.lastAccess).toISOString(),
      applications: Object.values(s.clients),
    }));
  }

  @Delete("me/sessions/:id")
  @HttpCode(204)
  @RequirePermission("session.manageOwn")
  @NoContext()
  @AllowPendingLegal()
  async revoke(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<void> {
    const sessions = await this.identity.listSessions(auth.keycloakId);
    // Only one's own sessions: another user's session id is simply not found.
    if (!sessions.some((s) => s.id === id)) throw new ProblemError("NOT_FOUND");
    await this.identity.deleteSession(id);
    await this.audit.record(actorOf(auth), {
      action: "SESSION_REVOKED",
      targetType: "Session",
      targetId: id,
    });
  }

  /**
   * Called by the web apps right after a login completes: the access is written to
   * the audit log with the browser's IP and user agent (CLAUDE.md rule 4).
   */
  @Post("me/logins")
  @HttpCode(204)
  @RequirePermission("session.manageOwn")
  @NoContext()
  @AllowPendingLegal()
  async login(@CurrentAuth() auth: AuthContext): Promise<void> {
    await this.audit.record(actorOf(auth), {
      action: "LOGIN",
      targetType: "User",
      targetId: auth.userId,
    });
  }

  @Post("me/sessions/logout-all")
  @HttpCode(204)
  @RequirePermission("session.manageOwn")
  @NoContext()
  @AllowPendingLegal()
  async logoutAll(@CurrentAuth() auth: AuthContext): Promise<void> {
    await this.identity.logoutUser(auth.keycloakId);
    await this.audit.record(actorOf(auth), {
      action: "ALL_SESSIONS_REVOKED",
      targetType: "User",
      targetId: auth.userId,
    });
  }
}
