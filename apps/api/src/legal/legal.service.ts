import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import { asSystem, withContext, type DbClient, type Prisma } from "@astax/db";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { UserResolver } from "../auth/user-resolver.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB, FIELD_CIPHER } from "../infra/tokens.js";
import { NotificationService } from "../notifications/notification.service.js";
import { BLOCKING_MOMENTS, legalAudiences, type LegalAudience } from "./legal-audiences.js";

/** Who a document is for, as a filter on users (the opposite of legalAudiences). */
function usersOf(audiences: readonly string[]): Prisma.UserWhereInput {
  if (audiences.includes("ALL")) return {};
  const active = { status: "ACTIVE" as const };
  const or: Prisma.UserWhereInput[] = [];
  for (const a of audiences as LegalAudience[]) {
    if (a === "PRIVATE" || a === "STAFF") or.push({ kind: a });
    if (a === "AGENCY" || a === "BROKER") {
      or.push({ memberships: { some: { ...active, role: "OWNER", organization: { type: a } } } });
    }
    if (a === "SUB_AGENT") {
      or.push({
        memberships: {
          some: {
            ...active,
            role: { not: "OWNER" },
            organization: { type: { in: ["AGENCY", "BROKER"] } },
          },
        },
      });
    }
  }
  return { OR: or };
}

export interface PendingLegalDocument {
  documentKey: string;
  title: string;
  versionId: string;
  versionNumber: number;
  contentMd: string;
  validated: boolean;
}

/** Legal texts with versions and acceptances (LEG-01, LEG-02, LEG-03). */
@Injectable()
export class LegalService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UserResolver) private readonly users: UserResolver,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  /**
   * LEG-02: a draft version becomes the one in force; everyone concerned
   * accepts it at the next access and gets the legal.new_version email with
   * the summary of the changes.
   */
  async publish(auth: AuthContext, id: string, reason: string, summary: string, now: Date) {
    const out = await withContext(
      this.db,
      auth.db,
      async (tx) => {
        const version = await tx.legalDocumentVersion.findUnique({
          where: { id },
          include: { document: true },
        });
        if (!version) throw new ProblemError("NOT_FOUND");
        if (version.publishedAt) {
          throw new ProblemError("CONFLICT", "Already published", [
            { path: "version", issue: "ALREADY_PUBLISHED" },
          ]);
        }
        const newer = await tx.legalDocumentVersion.findFirst({
          where: {
            documentId: version.documentId,
            number: { gt: version.number },
            publishedAt: { not: null },
          },
        });
        if (newer) {
          throw new ProblemError("CONFLICT", "A newer version is in force", [
            { path: "version", issue: "NEWER_PUBLISHED" },
          ]);
        }
        await tx.legalDocumentVersion.update({ where: { id }, data: { publishedAt: now } });
        const users = await asSystem(tx, () =>
          tx.user.findMany({ where: { status: "ACTIVE", ...usersOf(version.document.audiences) } }),
        );
        const names = new Map(users.map((u) => [u.id, u.firstName]));
        const outbound = await this.notifications.deliver(
          tx,
          users.map((u) => ({
            userId: u.id,
            email: u.emailEnc ? this.cipher.decrypt(u.emailEnc) : null,
            phone: null,
          })),
          "legal.new_version",
          (userId) => ({
            nome: names.get(userId) ?? "",
            documento: version.document.title,
            data: { date: now.toISOString() },
            sintesi: summary,
          }),
          null,
          { versionId: id },
        );
        await this.audit.inTransaction(tx, actorOf(auth), {
          action: "LEGAL_VERSION_PUBLISHED",
          targetType: "LegalDocumentVersion",
          targetId: id,
          before: { publishedAt: null },
          after: { key: version.document.key, number: version.number, recipients: users.length },
          reason,
        });
        return { outbound, recipients: users.length, number: version.number };
      },
      { timeoutMs: 60_000 },
    );
    await this.notifications.send(out.outbound);
    return { id, number: out.number, recipients: out.recipients, publishedAt: now.toISOString() };
  }

  /** Versions in force for this user that still wait for acceptance. */
  async pending(auth: AuthContext): Promise<PendingLegalDocument[]> {
    const memberships =
      auth.kind === "PROFESSIONAL" ? await this.users.activeMemberships(auth.userId) : [];
    const audiences = [...legalAudiences(auth.kind, memberships)];
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const documents = await tx.legalDocument.findMany({
        where: { moment: { in: [...BLOCKING_MOMENTS] }, audiences: { hasSome: audiences } },
        include: {
          versions: {
            where: { publishedAt: { lte: now } },
            orderBy: { number: "desc" },
            take: 1,
            include: { acceptances: { where: { userId: auth.userId }, select: { id: true } } },
          },
        },
        orderBy: { key: "asc" },
      });
      return documents.flatMap((doc) => {
        const current = doc.versions[0];
        if (!current || current.acceptances.length > 0) return [];
        return [
          {
            documentKey: doc.key,
            title: doc.title,
            versionId: current.id,
            versionNumber: current.number,
            contentMd: current.contentMd,
            validated: current.status === "VALIDATED",
          },
        ];
      });
    });
  }

  /** Records acceptance of versions currently pending, with version, time and IP (LEG-01). */
  async accept(auth: AuthContext, versionIds: string[]): Promise<{ accepted: number }> {
    const pending = await this.pending(auth);
    const pendingIds = new Set(pending.map((p) => p.versionId));
    const unknown = versionIds.filter((id) => !pendingIds.has(id));
    if (unknown.length > 0 || versionIds.length === 0) {
      throw new ProblemError(
        "VALIDATION_FAILED",
        "Only versions in force and still pending can be accepted",
      );
    }
    const acceptedAt = this.clock.now();
    await withContext(this.db, auth.db, async (tx) => {
      for (const versionId of new Set(versionIds)) {
        await tx.legalAcceptance.create({
          data: {
            userId: auth.userId,
            versionId,
            acceptedAt,
            ip: auth.ip,
            userAgent: auth.userAgent,
            method: "CLICK",
          },
        });
        await this.audit.inTransaction(tx, actorOf(auth), {
          action: "LEGAL_ACCEPTED",
          targetType: "LegalDocumentVersion",
          targetId: versionId,
        });
      }
    });
    return { accepted: new Set(versionIds).size };
  }
}
