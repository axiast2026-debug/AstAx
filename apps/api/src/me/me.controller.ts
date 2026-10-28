import type { FieldCipher } from "@astax/adapters/crypto";
import { italianMobile } from "@astax/shared/domain";
import { withContext, type DbClient } from "@astax/db";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
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
import { z } from "zod";
import { DB, FIELD_CIPHER, IDENTITY_ADMIN } from "../infra/tokens.js";
import type { IdentityAdmin } from "../identity/identity-admin.js";

const name = z.string().trim().min(1).max(80);
const profileSchema = z.strictObject({
  firstName: name,
  lastName: name,
  phone: z.string().max(30),
});

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

  /**
   * Dan, 2026-10-28: a private customer gives name, surname and mobile phone at
   * the first access. The phone is set once here; changing it later needs a
   * code (permission condition), so a second, different number is refused.
   * Professionals take their names from the entry and the team, not from here.
   */
  @Put("me/profile")
  @HttpCode(204)
  @RequirePermission("profile.update")
  @NoContext()
  async updateProfile(@CurrentAuth() auth: AuthContext, @Body() body: unknown): Promise<void> {
    const input = parseInput(profileSchema, body);
    const phone = italianMobile(input.phone);
    if (!phone) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "phone", issue: "INVALID_PHONE" },
      ]);
    }
    await withContext(this.db, auth.db, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: auth.userId },
        select: { kind: true, phoneEnc: true },
      });
      if (user.kind !== "PRIVATE") throw new ProblemError("FORBIDDEN");
      if (user.phoneEnc && this.cipher.decrypt(user.phoneEnc) !== phone) {
        throw new ProblemError("CONFLICT", "PHONE_CHANGE_NEEDS_CODE");
      }
      await tx.user.update({
        where: { id: auth.userId },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          phoneEnc: this.cipher.encrypt(phone),
          phoneHash: this.cipher.blindIndex("phone", phone),
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "PROFILE_UPDATED",
        targetType: "User",
        targetId: auth.userId,
      });
    });
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
