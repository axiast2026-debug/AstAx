import type { EmailSender } from "../email/email-sender.js";

/**
 * Outgoing SMS (docs/adattatori.md «Comunicazioni»; real provider in phase 8).
 * Never logged: the text may hold a one-time code and the number is personal
 * data (CLAUDE.md rule 8).
 */
export interface SmsMessage {
  to: string;
  text: string;
}

export interface SmsPort {
  send(message: SmsMessage): Promise<void>;
}

/** Mailbox domain of the SMS delivered to Mailpit in development. */
export const SMS_MAILBOX_DOMAIN = "sms.astax.test";

/** The Mailpit address of a phone number: digits only, so `+39 333…` → `39333…@sms.astax.test`. */
export function smsMailbox(phone: string): string {
  return `${phone.replace(/\D/g, "")}@${SMS_MAILBOX_DOMAIN}`;
}

/** Development: the SMS becomes an email to Mailpit, readable in its web page. */
export class MailpitSmsSender implements SmsPort {
  constructor(private readonly email: EmailSender) {}

  async send(message: SmsMessage): Promise<void> {
    await this.email.send({ to: smsMailbox(message.to), subject: "SMS AstAx", text: message.text });
  }
}

/** Tests: keeps the messages in memory. */
export class InMemorySmsSender implements SmsPort {
  readonly sent: SmsMessage[] = [];

  async send(message: SmsMessage): Promise<void> {
    this.sent.push(message);
  }
}
