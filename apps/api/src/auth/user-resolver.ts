import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import { SYSTEM_CONTEXT, withContext, type DbClient } from "@astax/db";
import type { MembershipFlags } from "@astax/shared/permissions";
import { Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { CLOCK, DB, FIELD_CIPHER } from "../infra/tokens.js";
import type { ActiveMembership, UserKind } from "./auth-context.js";
import type { VerifiedToken } from "./token-verifier.js";

export interface ResolvedUser {
  id: string;
  kind: UserKind;
  status: "ACTIVE" | "SUSPENDED" | "BLOCKED";
}

export type ResolveOutcome =
  { user: ResolvedUser } | { refused: "NOT_PROVISIONED" | "KIND_MISMATCH"; userId?: string };

/**
 * Finds the AstAx user behind a token. A private customer is created on the
 * first call (fase 1, passo 6). A professional must already exist, or have a
 * pending team invitation for the same verified email, which is accepted now.
 */
@Injectable()
export class UserResolver {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async resolve(
    token: VerifiedToken,
    kind: UserKind,
    client: { ip: string | null; userAgent: string | null },
  ): Promise<ResolveOutcome> {
    const existing = await withContext(this.db, SYSTEM_CONTEXT, (tx) =>
      tx.user.findUnique({
        where: { keycloakId: token.sub },
        select: { id: true, kind: true, status: true },
      }),
    );
    if (existing) {
      return existing.kind === kind
        ? { user: existing }
        : { refused: "KIND_MISMATCH", userId: existing.id };
    }
    if (!token.email || !token.emailVerified) return { refused: "NOT_PROVISIONED" };
    const emailHash = this.cipher.blindIndex("email", token.email);

    if (kind === "PRIVATE") {
      const user = await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
        const created = await tx.user.create({
          data: {
            keycloakId: token.sub,
            kind: "PRIVATE",
            firstName: token.givenName ?? "",
            lastName: token.familyName ?? "",
            emailEnc: this.cipher.encrypt(token.email ?? ""),
            emailHash,
          },
          select: { id: true, kind: true, status: true },
        });
        await this.audit.inTransaction(
          tx,
          {
            userId: created.id,
            membershipId: null,
            organizationId: null,
            ip: client.ip,
            userAgent: client.userAgent,
          },
          {
            action: "USER_PROVISIONED",
            targetType: "User",
            targetId: created.id,
            after: { kind: "PRIVATE" },
          },
        );
        return created;
      });
      return { user };
    }

    // Professionals: a user already in the database (seed, earlier invite) gets linked;
    // otherwise pending team invitations for this verified email create the user.
    const now = this.clock.now();
    const linked = await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const byEmail = await tx.user.findUnique({ where: { emailHash } });
      if (byEmail) {
        if (byEmail.keycloakId !== null || byEmail.kind !== kind) return null;
        return tx.user.update({
          where: { id: byEmail.id },
          data: { keycloakId: token.sub },
          select: { id: true, kind: true, status: true },
        });
      }
      if (kind !== "PROFESSIONAL") return null;
      const invites = await tx.teamInvite.findMany({
        where: { emailHash, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      });
      if (invites.length === 0) return null;
      const user = await tx.user.create({
        data: {
          keycloakId: token.sub,
          kind: "PROFESSIONAL",
          firstName: token.givenName ?? "",
          lastName: token.familyName ?? "",
          emailEnc: this.cipher.encrypt(token.email ?? ""),
          emailHash,
        },
        select: { id: true, kind: true, status: true },
      });
      for (const invite of invites) {
        const flags: MembershipFlags = {
          canIssue: invite.canIssue,
          canSeeColleagueOffers: invite.canSeeColleagueOffers,
          canSeeAccounting: invite.canSeeAccounting,
          seesAllClients: invite.seesAllClients,
        };
        const membership = await tx.membership.create({
          data: {
            userId: user.id,
            organizationId: invite.organizationId,
            role: invite.role,
            ...flags,
          },
        });
        await tx.teamInvite.update({ where: { id: invite.id }, data: { acceptedAt: now } });
        await this.audit.inTransaction(
          tx,
          {
            userId: user.id,
            membershipId: membership.id,
            organizationId: invite.organizationId,
            ip: client.ip,
            userAgent: client.userAgent,
          },
          {
            action: "TEAM_INVITE_ACCEPTED",
            targetType: "TeamInvite",
            targetId: invite.id,
            after: { role: invite.role, ...flags },
          },
        );
      }
      return user;
    });
    return linked ? { user: linked } : { refused: "NOT_PROVISIONED" };
  }

  /** Active memberships of a user in active organizations. */
  async activeMemberships(userId: string): Promise<ActiveMembership[]> {
    const rows = await withContext(this.db, SYSTEM_CONTEXT, (tx) =>
      tx.membership.findMany({
        where: { userId, status: "ACTIVE", organization: { status: "ACTIVE" } },
        include: { organization: { select: { type: true } } },
      }),
    );
    return rows.map((m) => ({
      id: m.id,
      organizationId: m.organizationId,
      organizationType: m.organization.type,
      role: m.role,
      flags: {
        canIssue: m.canIssue,
        canSeeColleagueOffers: m.canSeeColleagueOffers,
        canSeeAccounting: m.canSeeAccounting,
        seesAllClients: m.seesAllClients,
      },
    }));
  }
}
