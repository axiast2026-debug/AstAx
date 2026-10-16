import { createHash, randomBytes } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { EmailSender } from "@astax/adapters/email";
import { KEYCLOAK_CLIENTS } from "@astax/adapters/identity";
import { asSystem, recordDomainEvent, withContext, type DbClient } from "@astax/db";
import { membershipGrantProblems } from "@astax/shared/domain";
import { formatDate } from "@astax/shared/format";
import type { Logger } from "@astax/shared/logging";
import type { MembershipFlags, MembershipRole } from "@astax/shared/permissions";
import { requireSettingAt, type SettingVersion } from "@astax/shared/settings";
import { Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "../config/config.js";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import type { IdentityAdmin } from "../identity/identity-admin.js";
import {
  CLOCK,
  CONFIG,
  DB,
  EMAIL_SENDER,
  FIELD_CIPHER,
  IDENTITY_ADMIN,
  LOGGER,
} from "../infra/tokens.js";
import labels from "../notifications/labels.it.json" with { type: "json" };
import {
  loadNotificationTemplates,
  renderEmail,
  type NotificationTemplates,
} from "@astax/shared/notifications";

const DAY_MS = 86_400_000;

export interface InviteInput {
  email: string;
  firstName: string;
  lastName: string;
  role: MembershipRole;
  flags: Partial<MembershipFlags>;
}

const flagsOf = (f: Partial<MembershipFlags>): MembershipFlags => ({
  canIssue: f.canIssue ?? false,
  canSeeColleagueOffers: f.canSeeColleagueOffers ?? false,
  canSeeAccounting: f.canSeeAccounting ?? false,
  seesAllClients: f.seesAllClients ?? false,
});

/** Team management by the owner (fase 1, passo 8; permission team.manage). */
@Injectable()
export class TeamService {
  readonly #templates: NotificationTemplates = loadNotificationTemplates();

  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(IDENTITY_ADMIN) private readonly identity: IdentityAdmin,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  private membershipOf(auth: AuthContext) {
    if (!auth.membership) throw new ProblemError("CONTEXT_REQUIRED");
    return auth.membership;
  }

  private checkGrant(
    auth: AuthContext,
    role: MembershipRole,
    flags: Partial<MembershipFlags>,
  ): void {
    const problems = membershipGrantProblems(this.membershipOf(auth).organizationType, role, flags);
    if (problems.length > 0) {
      throw new ProblemError(
        "VALIDATION_FAILED",
        undefined,
        problems.map((p) => ({
          path: p.startsWith("FLAG") ? `flags.${p.split(":")[1]}` : "role",
          issue: p,
        })),
      );
    }
  }

  async list(auth: AuthContext) {
    const organizationId = this.membershipOf(auth).organizationId;
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const members = await tx.membership.findMany({
        where: { organizationId, status: { not: "REMOVED" } },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: "asc" },
      });
      const invites = await tx.teamInvite.findMany({
        where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "asc" },
      });
      // Spec 04 «Team»: the last access of each member. Logins are recorded
      // without an organization context, so they are read as a system step,
      // after the team.manage check of the controller.
      const logins = await asSystem(tx, () =>
        tx.auditLog.groupBy({
          by: ["targetId"],
          where: { action: "LOGIN", targetId: { in: members.map((m) => m.user.id) } },
          _max: { at: true },
        }),
      );
      return {
        members: members.map((m) => ({
          membershipId: m.id,
          userId: m.user.id,
          firstName: m.user.firstName,
          lastName: m.user.lastName,
          role: m.role,
          status: m.status,
          flags: flagsOf(m),
          ruiNumberE: m.ruiNumberE,
          ruiVerified: m.ruiVerifiedAt !== null,
          lastLoginAt: logins.find((l) => l.targetId === m.user.id)?._max.at?.toISOString() ?? null,
        })),
        pendingInvites: invites.map((i) => ({
          id: i.id,
          role: i.role,
          flags: flagsOf(i),
          expiresAt: i.expiresAt.toISOString(),
        })),
      };
    });
  }

  /**
   * Invites someone by email. A new person receives the Keycloak email to set
   * password and TOTP and joins at first login; a person already on AstAx (for
   * example a sub-agent of another agency) receives the invitation email and
   * accepts it from the app.
   */
  async invite(auth: AuthContext, input: InviteInput) {
    const { organizationId } = this.membershipOf(auth);
    this.checkGrant(auth, input.role, input.flags);
    const flags = flagsOf(input.flags);
    const emailHash = this.cipher.blindIndex("email", input.email);
    const now = this.clock.now();

    // Only professionals join a team: an address already used by a private customer
    // or by AstAx staff cannot become a broker or agency user (SIC-05, ADR 0002).
    const keycloakUser = await this.identity.findUserByEmail(input.email);
    if (keycloakUser) {
      const roles = await this.identity.realmRoles(keycloakUser.id);
      if (!roles.includes("astax-professional")) {
        throw new ProblemError(
          "CONFLICT",
          "This address belongs to an account that is not professional",
        );
      }
    }

    const { invite, organizationName, inviterName, validityDays } = await withContext(
      this.db,
      auth.db,
      async (tx) => {
        const settings = await tx.setting.findMany({ where: { key: "team.inviteValidityDays" } });
        const days = requireSettingAt(
          settings as unknown as SettingVersion[],
          "team.inviteValidityDays",
          now,
        );
        const already = await tx.membership.findFirst({
          where: { organizationId, status: { not: "REMOVED" }, user: { emailHash } },
          select: { id: true },
        });
        if (already) throw new ProblemError("CONFLICT", "Already a member of this organization");
        const organization = await tx.organization.findUniqueOrThrow({
          where: { id: organizationId },
        });
        const inviter = await tx.user.findUniqueOrThrow({ where: { id: auth.userId } });
        const created = await tx.teamInvite.create({
          data: {
            organizationId,
            emailHash,
            role: input.role,
            ...flags,
            tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
            invitedByUserId: auth.userId,
            expiresAt: new Date(now.getTime() + days * DAY_MS),
          },
        });
        await this.audit.inTransaction(tx, actorOf(auth), {
          action: "TEAM_INVITE_CREATED",
          targetType: "TeamInvite",
          targetId: created.id,
          after: { role: input.role, ...flags },
        });
        return {
          invite: created,
          organizationName: organization.legalName,
          inviterName: `${inviter.firstName} ${inviter.lastName}`.trim(),
          validityDays: days,
        };
      },
    );

    if (!keycloakUser) {
      const keycloakId = await this.identity.createUser({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        requiredActions: ["UPDATE_PASSWORD", "CONFIGURE_TOTP"],
      });
      await this.identity.addRealmRoles(keycloakId, ["astax-professional"]);
      await this.identity.executeActionsEmail(keycloakId, ["UPDATE_PASSWORD", "CONFIGURE_TOTP"], {
        clientId: KEYCLOAK_CLIENTS.professional,
        redirectUri: this.config.WEB_URL,
        lifespanSeconds: validityDays * 86_400,
      });
    } else {
      const message = renderEmail(this.#templates, "team.invitation", "it", {
        nome: input.firstName,
        invitante: inviterName,
        organizzazione: organizationName,
        ruolo: labels.role[input.role],
        link: `${this.config.WEB_URL}/inviti`,
        scadenza: formatDate(invite.expiresAt, "it"),
      });
      await this.email.send({ to: input.email, ...message });
    }
    this.logger.info(
      { inviteId: invite.id, existingAccount: Boolean(keycloakUser) },
      "team invite sent",
    );
    return { id: invite.id, role: invite.role, flags, expiresAt: invite.expiresAt.toISOString() };
  }

  async revokeInvite(auth: AuthContext, inviteId: string): Promise<void> {
    const now = this.clock.now();
    await withContext(this.db, auth.db, async (tx) => {
      // Own organization checked here; row level security is only the second line (rule 3).
      const invite = await tx.teamInvite.findFirst({
        where: {
          id: inviteId,
          organizationId: this.membershipOf(auth).organizationId,
          acceptedAt: null,
          revokedAt: null,
        },
      });
      if (!invite) throw new ProblemError("NOT_FOUND");
      await tx.teamInvite.update({ where: { id: inviteId }, data: { revokedAt: now } });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "TEAM_INVITE_REVOKED",
        targetType: "TeamInvite",
        targetId: inviteId,
      });
    });
  }

  /** Role, flags and suspension of a member. The owner and oneself are not editable here. */
  async updateMember(
    auth: AuthContext,
    membershipId: string,
    input: {
      role?: MembershipRole;
      flags?: Partial<MembershipFlags>;
      status?: "ACTIVE" | "SUSPENDED";
    },
  ) {
    return withContext(this.db, auth.db, async (tx) => {
      const member = await this.editable(tx, auth, membershipId);
      const role = input.role ?? member.role;
      const flags = flagsOf({ ...flagsOf(member), ...input.flags });
      // A role change resets flags that no longer apply.
      if (input.role && input.role !== member.role && !input.flags) {
        Object.assign(flags, flagsOf({}));
      }
      this.checkGrant(auth, role, flags);
      const updated = await tx.membership.update({
        where: { id: membershipId },
        data: { role, ...flags, ...(input.status ? { status: input.status } : {}) },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "MEMBERSHIP_UPDATED",
        targetType: "Membership",
        targetId: membershipId,
        before: { role: member.role, status: member.status, ...flagsOf(member) },
        after: { role: updated.role, status: updated.status, ...flagsOf(updated) },
      });
      await recordDomainEvent(tx, {
        aggregateType: "Membership",
        aggregateId: membershipId,
        type: "membership.updated",
        at: this.clock.now(),
        actorUserId: auth.userId,
        data: { role: updated.role, status: updated.status },
      });
      return { membershipId, role: updated.role, status: updated.status, flags: flagsOf(updated) };
    });
  }

  async removeMember(auth: AuthContext, membershipId: string): Promise<void> {
    await withContext(this.db, auth.db, async (tx) => {
      const member = await this.editable(tx, auth, membershipId);
      await tx.membership.update({ where: { id: membershipId }, data: { status: "REMOVED" } });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "MEMBERSHIP_REMOVED",
        targetType: "Membership",
        targetId: membershipId,
        before: { role: member.role, status: member.status },
      });
      await recordDomainEvent(tx, {
        aggregateType: "Membership",
        aggregateId: membershipId,
        type: "membership.removed",
        at: this.clock.now(),
        actorUserId: auth.userId,
      });
    });
  }

  private async editable(
    tx: Parameters<Parameters<DbClient["$transaction"]>[0]>[0],
    auth: AuthContext,
    membershipId: string,
  ) {
    const { organizationId, id: ownMembershipId } = this.membershipOf(auth);
    const member = await tx.membership.findFirst({
      where: { id: membershipId, organizationId, status: { not: "REMOVED" } },
    });
    if (!member) throw new ProblemError("NOT_FOUND");
    if (member.id === ownMembershipId || member.role === "OWNER") {
      throw new ProblemError("FORBIDDEN", "Owner memberships are managed by AstAx");
    }
    return member;
  }

  /** Invitations waiting for the caller (already an AstAx user), in any organization. */
  async myInvites(auth: AuthContext) {
    const now = this.clock.now();
    return withContext(this.db, { kind: "SYSTEM" }, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: auth.userId },
        select: { emailHash: true },
      });
      if (!user.emailHash) return [];
      const invites = await tx.teamInvite.findMany({
        where: {
          emailHash: user.emailHash,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        include: { organization: { select: { legalName: true, type: true } } },
      });
      return invites.map((i) => ({
        id: i.id,
        organization: { name: i.organization.legalName, type: i.organization.type },
        role: i.role,
        expiresAt: i.expiresAt.toISOString(),
      }));
    });
  }

  async acceptInvite(auth: AuthContext, inviteId: string) {
    // Only professionals receive team invitations: for anyone else there is nothing to accept.
    if (auth.kind !== "PROFESSIONAL") throw new ProblemError("NOT_FOUND");
    const now = this.clock.now();
    return withContext(this.db, { kind: "SYSTEM" }, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: auth.userId },
        select: { emailHash: true },
      });
      const invite = await tx.teamInvite.findFirst({
        where: {
          id: inviteId,
          emailHash: user.emailHash ?? "-",
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      });
      if (!invite) throw new ProblemError("NOT_FOUND");
      const flags = flagsOf(invite);
      const membership = await tx.membership.upsert({
        where: {
          userId_organizationId: { userId: auth.userId, organizationId: invite.organizationId },
        },
        create: {
          userId: auth.userId,
          organizationId: invite.organizationId,
          role: invite.role,
          ...flags,
        },
        update: { role: invite.role, ...flags, status: "ACTIVE" },
      });
      await tx.teamInvite.update({ where: { id: invite.id }, data: { acceptedAt: now } });
      await this.audit.inTransaction(
        tx,
        { ...actorOf(auth), membershipId: membership.id, organizationId: invite.organizationId },
        {
          action: "TEAM_INVITE_ACCEPTED",
          targetType: "TeamInvite",
          targetId: invite.id,
          after: { role: invite.role, ...flags },
        },
      );
      await recordDomainEvent(tx, {
        aggregateType: "Membership",
        aggregateId: membership.id,
        type: "teamInvite.accepted",
        at: now,
        actorUserId: auth.userId,
        data: { teamInviteId: invite.id, organizationId: invite.organizationId },
      });
      return {
        membershipId: membership.id,
        organizationId: invite.organizationId,
        role: membership.role,
      };
    });
  }
}
