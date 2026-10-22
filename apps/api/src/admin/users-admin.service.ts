import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import { asSystem, withContext, type DbClient, type MembershipRole } from "@astax/db";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import type { IdentityAdmin } from "../identity/identity-admin.js";
import { CLOCK, DB, FIELD_CIPHER, IDENTITY_ADMIN } from "../infra/tokens.js";

export const STAFF_ROLES = [
  "BO_VERIFIER",
  "BO_SUPPORT",
  "BO_ACCOUNTING",
  "BO_SUPERVISOR",
  "ADMIN",
] as const satisfies readonly MembershipRole[];
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * Spec 07 «Utenti e permessi» (admin.users.manage): find a user, block and
 * unblock (in AstAx and in Keycloak, with every session closed), reset the
 * second factor, give or take a back office role. Every action has a reason
 * and is in the audit log with before and after; nobody acts on oneself.
 */
@Injectable()
export class UsersAdminService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(IDENTITY_ADMIN) private readonly identity: IdentityAdmin,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(
    auth: AuthContext,
    filter: { q?: string; kind?: "PRIVATE" | "PROFESSIONAL" | "STAFF" },
  ) {
    return withContext(this.db, auth.db, async (tx) => {
      const q = filter.q?.trim();
      const users = await asSystem(tx, () =>
        tx.user.findMany({
          where: {
            ...(filter.kind ? { kind: filter.kind } : {}),
            ...(q
              ? {
                  OR: [
                    { firstName: { contains: q, mode: "insensitive" } },
                    { lastName: { contains: q, mode: "insensitive" } },
                    ...(q.includes("@")
                      ? [{ emailHash: this.cipher.blindIndex("email", q.toLowerCase()) }]
                      : []),
                  ],
                }
              : {}),
          },
          include: { memberships: { include: { organization: true } } },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          take: 100,
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "USERS_VIEWED",
        targetType: "User",
        targetId: null,
        after: { results: users.length, ...(filter.kind ? { kind: filter.kind } : {}) },
      });
      return users.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        email: u.emailEnc ? this.cipher.decrypt(u.emailEnc) : null,
        kind: u.kind,
        status: u.status,
        memberships: u.memberships.map((m) => ({
          organization: m.organization.legalName,
          type: m.organization.type,
          role: m.role,
          status: m.status,
        })),
      }));
    });
  }

  private notSelf(auth: AuthContext, id: string) {
    if (auth.userId === id) {
      throw new ProblemError("CONFLICT", "Not on oneself", [{ path: "user", issue: "SELF" }]);
    }
  }

  private async user(auth: AuthContext, id: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const u = await asSystem(tx, () => tx.user.findUnique({ where: { id } }));
      if (!u) throw new ProblemError("NOT_FOUND");
      return u;
    });
  }

  async setBlocked(auth: AuthContext, id: string, blocked: boolean, reason: string) {
    this.notSelf(auth, id);
    const u = await this.user(auth, id);
    const status = blocked ? "BLOCKED" : "ACTIVE";
    await withContext(this.db, auth.db, async (tx) => {
      await asSystem(tx, () =>
        tx.user.update({ where: { id }, data: { status, updatedAt: this.clock.now() } }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: blocked ? "USER_BLOCKED" : "USER_UNBLOCKED",
        targetType: "User",
        targetId: id,
        before: { status: u.status },
        after: { status },
        reason,
      });
    });
    if (u.keycloakId) {
      await this.identity.setEnabled(u.keycloakId, !blocked);
      if (blocked) await this.identity.logoutUser(u.keycloakId);
    }
    return { id, status };
  }

  /** The user configures the second factor again at the next access (SIC-05). */
  async resetSecondFactor(auth: AuthContext, id: string, reason: string) {
    this.notSelf(auth, id);
    const u = await this.user(auth, id);
    if (!u.keycloakId || u.kind === "PRIVATE") throw new ProblemError("CONFLICT");
    const removed = await this.identity.removeCredentials(u.keycloakId, "otp");
    await this.identity.logoutUser(u.keycloakId);
    await withContext(this.db, auth.db, (tx) =>
      this.audit.inTransaction(tx, actorOf(auth), {
        action: "USER_SECOND_FACTOR_RESET",
        targetType: "User",
        targetId: id,
        after: { removed },
        reason,
      }),
    );
    return { id, reset: true };
  }

  /** A back office role in AstAx, or none (the membership is then disabled). */
  async setStaffRole(auth: AuthContext, id: string, role: StaffRole | null, reason: string) {
    this.notSelf(auth, id);
    const u = await this.user(auth, id);
    if (u.kind !== "STAFF") {
      throw new ProblemError("CONFLICT", "Only AstAx staff", [
        { path: "user", issue: "NOT_STAFF" },
      ]);
    }
    return withContext(this.db, auth.db, async (tx) => {
      const astax = await asSystem(tx, () =>
        tx.organization.findFirstOrThrow({ where: { type: "ASTAX" } }),
      );
      const current = await asSystem(tx, () =>
        tx.membership.findUnique({
          where: { userId_organizationId: { userId: id, organizationId: astax.id } },
        }),
      );
      await asSystem(tx, async () => {
        if (role === null) {
          if (current) {
            await tx.membership.update({
              where: { id: current.id },
              data: { status: "REMOVED", updatedAt: this.clock.now() },
            });
          }
        } else if (current) {
          await tx.membership.update({
            where: { id: current.id },
            data: { role, status: "ACTIVE", updatedAt: this.clock.now() },
          });
        } else {
          await tx.membership.create({
            data: { userId: id, organizationId: astax.id, role, createdAt: this.clock.now() },
          });
        }
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "STAFF_ROLE_SET",
        targetType: "User",
        targetId: id,
        before: current ? { role: current.role, status: current.status } : null,
        after: { role },
        reason,
      });
      return { id, role };
    });
  }
}
