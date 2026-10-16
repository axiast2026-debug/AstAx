import type { EmailSender } from "@astax/adapters/email";
import type { SmsPort } from "@astax/adapters/sms";
import { asSystem, type DbTransaction } from "@astax/db";
import { errorForLog, type Logger } from "@astax/shared/logging";
import { Inject, Injectable } from "@nestjs/common";
import { EMAIL_SENDER, LOGGER, SMS_SENDER } from "../infra/tokens.js";
import {
  loadNotificationTemplates,
  renderEmail,
  renderInApp,
  renderSms,
  type NotificationTemplates,
} from "./templates.js";

export interface InAppRecipient {
  userId: string;
  locale: "it" | "sq";
}

/**
 * Notifications of seed/notifiche.yaml (docs/notifiche.md). In-app rows join
 * the caller's transaction; email and SMS go out after it, and a failed send
 * is logged with identifiers only (CLAUDE.md rule 8), never with the address.
 */
@Injectable()
export class NotificationService {
  readonly #templates: NotificationTemplates = loadNotificationTemplates();

  constructor(
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(SMS_SENDER) private readonly sms: SmsPort,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async inApp(
    tx: DbTransaction,
    recipients: readonly InAppRecipient[],
    eventKey: string,
    variables: (locale: "it" | "sq") => Record<string, string>,
    link: string | null,
    payload: Record<string, string> = {},
  ): Promise<void> {
    if (recipients.length === 0) return;
    // createMany: the writer may not read other users' notifications. A system
    // step, because the rows may only be created for oneself otherwise.
    await asSystem(tx, () =>
      tx.notification.createMany({
        data: recipients.map((r) => ({
          userId: r.userId,
          eventKey,
          ...renderInApp(this.#templates, eventKey, r.locale, variables(r.locale)),
          link,
          payload,
        })),
      }),
    );
  }

  async sendEmail(
    to: string,
    eventKey: string,
    variables: Record<string, string>,
    ids: Record<string, string>,
  ): Promise<void> {
    try {
      await this.email.send({ to, ...renderEmail(this.#templates, eventKey, "it", variables) });
    } catch (error) {
      this.logger.error({ eventKey, ...ids, err: errorForLog(error) }, "email not sent");
      throw error;
    }
  }

  async sendSms(
    to: string,
    eventKey: string,
    variables: Record<string, string>,
    ids: Record<string, string>,
  ): Promise<void> {
    try {
      await this.sms.send({ to, text: renderSms(this.#templates, eventKey, variables) });
    } catch (error) {
      this.logger.error({ eventKey, ...ids, err: errorForLog(error) }, "sms not sent");
      throw error;
    }
  }
}
