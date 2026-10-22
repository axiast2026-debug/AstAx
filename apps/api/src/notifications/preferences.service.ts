import { createHash } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import {
  withContext,
  type DbClient,
  type NotificationChannel,
  type StoredTemplate,
} from "@astax/db";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB, FIELD_CIPHER } from "../infra/tokens.js";
import { NotificationService } from "./notification.service.js";

/** The recipients of seed/notifiche.yaml a kind of account can be (docs/notifiche.md «Destinatari»). */
const RECIPIENTS: Record<"PRIVATE" | "BROKER" | "AGENCY" | "STAFF", readonly string[]> = {
  PRIVATE: [
    "requester",
    "payer",
    "invoice_recipient",
    "refund_recipient",
    "complainant",
    "user",
    "private_or_broker_client",
    "affected_users",
  ],
  BROKER: [
    "requester",
    "organization_owner",
    "invoice_recipient",
    "refund_recipient",
    "complainant",
    "user",
    "affected_users",
  ],
  AGENCY: [
    // ADR 0015: the agency requests quotes for its own customers too.
    "requester",
    "invited_agency_users",
    "invited_agency_users_without_offer",
    "participating_agency_users",
    "agencies_with_valid_offer",
    "winning_agency_users",
    "agency_owner",
    "organization_owner",
    "invoice_recipient",
    "user",
    "affected_users",
  ],
  STAFF: ["bo_verifiers", "bo_supervisors", "bo_accounting", "admins", "user", "affected_users"],
};

/** The channels a user chooses: in app is always on (the notification centre). */
const CHOOSABLE: readonly NotificationChannel[] = ["EMAIL", "SMS", "PUSH"];

/**
 * Spec 01 «Notifiche» in the profile (docs/notifiche.md): for each event that
 * can reach the user, the channels on or off. A mandatory event (codes,
 * indispensable links) and the push of an event with a deadline (forcePush)
 * are locked on. Web Push subscriptions of the user's browsers, encrypted.
 */
/** An event's name from a text of its template, without the variables. */
const nameOf = (text: string | undefined) =>
  (text ?? "")
    .replace(/\{\{\s*[a-z_]+\s*\}\}/g, "…")
    .replace(/[:\s]*…$/, "")
    .replace(/^…$/, "")
    .trim();

@Injectable()
export class PreferencesService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  private kindOf(auth: AuthContext): keyof typeof RECIPIENTS {
    if (auth.kind === "PRIVATE") return "PRIVATE";
    if (auth.kind === "STAFF") return "STAFF";
    return auth.membership?.organizationType === "AGENCY" ? "AGENCY" : "BROKER";
  }

  private relevant(auth: AuthContext, templates: Map<string, StoredTemplate>) {
    const mine = RECIPIENTS[this.kindOf(auth)];
    return [...templates.values()].filter(
      (t) =>
        t.recipients.some((r) => mine.includes(r)) && t.channels.some((c) => CHOOSABLE.includes(c)),
    );
  }

  private locked(t: StoredTemplate, channel: NotificationChannel) {
    return t.mandatory || (channel === "PUSH" && t.forcePush);
  }

  async list(auth: AuthContext) {
    const templates = await this.notifications.templates();
    return withContext(this.db, auth.db, async (tx) => {
      const prefs = await tx.notificationPreference.findMany({ where: { userId: auth.userId } });
      const user = await tx.user.findUniqueOrThrow({ where: { id: auth.userId } });
      const locale = user.locale === "sq" ? "sq" : "it";
      return this.relevant(auth, templates).map((t) => {
        const texts = (locale === "sq" ? t.sq : undefined) ?? t.it;
        return {
          eventKey: t.eventKey,
          // The event's name: its title (or subject) without the variables.
          // A title made only of variables falls back on the email's subject, never empty.
          name: nameOf(texts.title) || nameOf(texts.emailSubject) || t.eventKey,
          channels: t.channels
            .filter((c) => CHOOSABLE.includes(c))
            .map((channel) => ({
              channel,
              locked: this.locked(t, channel),
              enabled:
                this.locked(t, channel) ||
                (prefs.find((p) => p.eventKey === t.eventKey && p.channel === channel)?.enabled ??
                  true),
            })),
        };
      });
    });
  }

  async set(
    auth: AuthContext,
    input: { eventKey: string; channel: NotificationChannel; enabled: boolean },
  ) {
    const templates = await this.notifications.templates();
    const t = this.relevant(auth, templates).find((x) => x.eventKey === input.eventKey);
    if (!t || !t.channels.includes(input.channel) || !CHOOSABLE.includes(input.channel)) {
      throw new ProblemError("NOT_FOUND");
    }
    if (this.locked(t, input.channel)) {
      throw new ProblemError("CONFLICT", "This notification cannot be switched off", [
        { path: "channel", issue: "MANDATORY" },
      ]);
    }
    await withContext(this.db, auth.db, async (tx) => {
      await tx.notificationPreference.upsert({
        where: {
          userId_eventKey_channel: {
            userId: auth.userId,
            eventKey: input.eventKey,
            channel: input.channel,
          },
        },
        create: { userId: auth.userId, ...input, updatedAt: this.clock.now() },
        update: { enabled: input.enabled, updatedAt: this.clock.now() },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "NOTIFICATION_PREFERENCE_SET",
        targetType: "User",
        targetId: auth.userId,
        after: input,
      });
    });
    return input;
  }

  /** A browser asks for the pushes (the Push API subscription, encrypted at rest). */
  async subscribe(
    auth: AuthContext,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    const endpointHash = createHash("sha256").update(subscription.endpoint).digest("hex");
    await withContext(this.db, auth.db, async (tx) => {
      const existing = await tx.pushSubscription.findUnique({ where: { endpointHash } });
      if (existing && existing.userId !== auth.userId) throw new ProblemError("CONFLICT");
      const subscriptionEnc = this.cipher.encrypt(JSON.stringify(subscription));
      if (existing) {
        await tx.pushSubscription.update({
          where: { id: existing.id },
          data: { subscriptionEnc, revokedAt: null },
        });
      } else {
        await tx.pushSubscription.create({
          data: { userId: auth.userId, endpointHash, subscriptionEnc, createdAt: this.clock.now() },
        });
      }
    });
    return { subscribed: true };
  }

  async unsubscribe(auth: AuthContext, endpoint: string) {
    const endpointHash = createHash("sha256").update(endpoint).digest("hex");
    await withContext(this.db, auth.db, (tx) =>
      tx.pushSubscription.updateMany({
        where: { endpointHash, userId: auth.userId, revokedAt: null },
        data: { revokedAt: this.clock.now() },
      }),
    );
    return { subscribed: false };
  }
}
