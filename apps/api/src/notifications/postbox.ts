import type { FieldCipher } from "@astax/adapters/crypto";
import { asSystem, type DbTransaction, type MembershipRole } from "@astax/db";
import type { TemplateVariables } from "@astax/shared/notifications";
import type { NotificationService, Outbound } from "./notification.service.js";

export interface PostboxUser {
  id: string;
  emailEnc: string | null;
  phoneEnc?: string | null;
}

/**
 * The notifications of one use case: the in-app rows in its transaction; email,
 * SMS and push kept and sent after the commit, so a rolled back change sends
 * nothing. The channels follow the template and each user's choices
 * (NotificationService.deliver). Payloads and logs carry identifiers only (rule 8).
 */
export class Postbox {
  readonly #outbound: Outbound[] = [];
  readonly #emails: {
    to: string;
    eventKey: string;
    variables: TemplateVariables;
    ids: Record<string, string>;
  }[] = [];

  constructor(
    private readonly notifications: NotificationService,
    private readonly cipher: FieldCipher,
    private readonly webUrl: string,
  ) {}

  async tell(
    tx: DbTransaction,
    users: readonly PostboxUser[],
    eventKey: string,
    variables: TemplateVariables,
    link: string,
    payload: Record<string, string>,
    options: { email?: boolean } = {},
  ): Promise<void> {
    const out = await this.notifications.deliver(
      tx,
      users.map((u) => ({
        userId: u.id,
        email: u.emailEnc ? this.cipher.decrypt(u.emailEnc) : null,
        phone: u.phoneEnc ? this.cipher.decrypt(u.phoneEnc) : null,
      })),
      eventKey,
      () => variables,
      new URL(link, this.webUrl).pathname,
      payload,
      options.email === false ? ["IN_APP", "PUSH"] : undefined,
    );
    this.#outbound.push(...out);
  }

  /** An email to an address with no account (the broker's customer). */
  email(to: string, eventKey: string, variables: TemplateVariables, ids: Record<string, string>) {
    this.#emails.push({ to, eventKey, variables, ids });
  }

  async flush(): Promise<void> {
    await this.notifications.send(this.#outbound.splice(0));
    for (const e of this.#emails.splice(0)) {
      await this.notifications
        .sendEmail(e.to, e.eventKey, e.variables, e.ids)
        .catch(() => undefined);
    }
  }
}

/** The active users of AstAx with one of the roles. */
export function staffUsers(
  tx: DbTransaction,
  roles: readonly MembershipRole[],
): Promise<PostboxUser[]> {
  return asSystem(tx, async () =>
    (
      await tx.membership.findMany({
        where: { organization: { type: "ASTAX" }, role: { in: [...roles] }, status: "ACTIVE" },
        include: { user: true },
      })
    ).map((m) => m.user),
  );
}

/** The owner, the supervisors, the users who issue and the author of the offer. */
export function agencyUsers(
  tx: DbTransaction,
  organizationId: string,
  authorUserId: string | null,
): Promise<PostboxUser[]> {
  return asSystem(tx, async () =>
    (
      await tx.membership.findMany({
        where: {
          organizationId,
          status: "ACTIVE",
          OR: [
            { role: { in: ["OWNER", "SUPERVISOR"] } },
            ...(authorUserId ? [{ userId: authorUserId }] : []),
            { canIssue: true },
          ],
        },
        include: { user: true },
      })
    ).map((m) => m.user),
  );
}
