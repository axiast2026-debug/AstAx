import type { EmailSender } from "../email/email-sender.js";

/**
 * Web Push (docs/adattatori.md «Comunicazioni»; the real sender with the
 * VAPID keys arrives in phase 8, proposal B of phase 7). The subscription is
 * the browser's, a personal address: never logged (CLAUDE.md rule 8).
 */
export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushMessage {
  title: string;
  body: string;
  /** The page to open, a path of the app (no data). */
  url: string;
}

export interface WebPushPort {
  send(subscription: PushSubscriptionData, message: PushMessage): Promise<void>;
}

/** Mailbox domain of the pushes delivered to Mailpit in development. */
export const PUSH_MAILBOX_DOMAIN = "push.astax.test";

/** Development: the push becomes an email to Mailpit, readable in its web page. */
export class MailpitWebPush implements WebPushPort {
  constructor(private readonly email: EmailSender) {}

  async send(subscription: PushSubscriptionData, message: PushMessage): Promise<void> {
    const box = subscription.keys.auth.replace(/[^A-Za-z0-9]/g, "").slice(0, 16) || "browser";
    await this.email.send({
      to: `${box}@${PUSH_MAILBOX_DOMAIN}`,
      subject: `Push AstAx: ${message.title}`,
      text: `${message.body}\n${message.url}`,
    });
  }
}

/** Tests: keeps the pushes in memory. */
export class InMemoryWebPush implements WebPushPort {
  readonly sent: { subscription: PushSubscriptionData; message: PushMessage }[] = [];

  async send(subscription: PushSubscriptionData, message: PushMessage): Promise<void> {
    this.sent.push({ subscription, message });
  }
}
