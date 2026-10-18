import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { EmailSender } from "@astax/adapters/email";
import type { SmsPort } from "@astax/adapters/sms";
import type { PushSubscriptionData, WebPushPort } from "@astax/adapters/web-push";
import {
  asRenderable,
  asSystem,
  planDispatch,
  type DbTransaction,
  type DispatchUser,
  type TemplateStore,
} from "@astax/db";
import { errorForLog, type Logger } from "@astax/shared/logging";
import {
  loadNotificationLabels,
  renderEmail,
  renderInApp,
  renderPush,
  renderSms,
  type NotificationLabels,
  type TemplateVariables,
} from "@astax/shared/notifications";
import { Inject, Injectable } from "@nestjs/common";
import {
  CLOCK,
  EMAIL_SENDER,
  FIELD_CIPHER,
  LOGGER,
  NOTIFICATION_TEMPLATES,
  SMS_SENDER,
  WEB_PUSH,
} from "../infra/tokens.js";

export interface InAppRecipient {
  userId: string;
  locale: "it" | "sq";
}

/** A message to send after the commit (a rolled back change sends nothing). */
export type Outbound =
  | {
      channel: "EMAIL";
      to: string;
      subject: string;
      text: string;
      eventKey: string;
      ids: Record<string, string>;
    }
  | { channel: "SMS"; to: string; text: string; eventKey: string; ids: Record<string, string> }
  | {
      channel: "PUSH";
      subscription: PushSubscriptionData;
      message: { title: string; body: string; url: string };
      eventKey: string;
      ids: Record<string, string>;
    };

/**
 * Notifications (docs/notifiche.md). The texts in force come from
 * NotificationTemplate (phase 7, edited by the administrator); who gets which
 * channel is decided by planDispatch (choices, mandatory, forcePush, never
 * twice). In-app rows join the caller's transaction; email, SMS and push go
 * out after it, and a failed send is logged with identifiers only (rule 8).
 */
@Injectable()
export class NotificationService {
  readonly #labels: NotificationLabels = loadNotificationLabels();

  constructor(
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(SMS_SENDER) private readonly sms: SmsPort,
    @Inject(WEB_PUSH) private readonly push: WebPushPort,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(NOTIFICATION_TEMPLATES) private readonly store: TemplateStore,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The texts in force, for the panels and the previews. */
  async templates() {
    return this.store.get();
  }

  invalidateTemplates(): void {
    this.store.invalidate();
  }

  /**
   * One event to users: the in-app rows now, the rest returned to send after
   * the commit. `only` limits the channels (a caller that sends its emails on
   * its own).
   */
  async deliver(
    tx: DbTransaction,
    users: readonly DispatchUser[],
    eventKey: string,
    variables: (locale: "it" | "sq") => TemplateVariables,
    link: string | null,
    payload: Record<string, string> = {},
    only?: readonly ("IN_APP" | "EMAIL" | "SMS" | "PUSH")[],
  ): Promise<Outbound[]> {
    if (users.length === 0) return [];
    const stored = await this.store.get();
    const template = stored.get(eventKey);
    if (!template) throw new Error(`No template for ${eventKey}`);
    const texts = asRenderable(stored);
    const plan = await asSystem(tx, () =>
      planDispatch(tx, template, users, payload, {
        now: this.clock.now(),
        ...(only ? { only } : {}),
      }),
    );
    if (plan.inApp.length > 0) {
      // createMany: the writer may not read other users' notifications. A system
      // step, because the rows may only be created for oneself otherwise.
      await asSystem(tx, () =>
        tx.notification.createMany({
          data: plan.inApp.map((u) => ({
            userId: u.userId,
            eventKey,
            ...renderInApp(texts, eventKey, u.locale, variables(u.locale), this.#labels),
            link,
            payload,
          })),
        }),
      );
    }
    const out: Outbound[] = [];
    for (const u of plan.email) {
      out.push({
        channel: "EMAIL",
        to: u.email ?? "",
        ...renderEmail(texts, eventKey, u.locale, variables(u.locale), this.#labels),
        eventKey,
        ids: payload,
      });
    }
    for (const u of plan.sms) {
      out.push({
        channel: "SMS",
        to: u.phone ?? "",
        text: renderSms(texts, eventKey, variables(u.locale), u.locale),
        eventKey,
        ids: payload,
      });
    }
    for (const { user, subscriptions } of plan.push) {
      const message = {
        ...renderPush(texts, eventKey, user.locale, variables(user.locale), this.#labels),
        url: link ?? "/notifiche",
      };
      for (const enc of subscriptions) {
        out.push({
          channel: "PUSH",
          subscription: JSON.parse(this.cipher.decrypt(enc)) as PushSubscriptionData,
          message,
          eventKey,
          ids: payload,
        });
      }
    }
    return out;
  }

  /** After the commit; a failed send is logged and the others go on. */
  async send(outbound: readonly Outbound[]): Promise<void> {
    for (const o of outbound) {
      try {
        if (o.channel === "EMAIL")
          await this.email.send({ to: o.to, subject: o.subject, text: o.text });
        else if (o.channel === "SMS") await this.sms.send({ to: o.to, text: o.text });
        else await this.push.send(o.subscription, o.message);
      } catch (error) {
        this.logger.error(
          { eventKey: o.eventKey, channel: o.channel, ...o.ids, err: errorForLog(error) },
          "notification not sent",
        );
      }
    }
  }

  /**
   * The in-app rows only (callers that send their emails themselves); the same
   * choices and the same «never twice».
   */
  async inApp(
    tx: DbTransaction,
    recipients: readonly InAppRecipient[],
    eventKey: string,
    variables: (locale: "it" | "sq") => TemplateVariables,
    link: string | null,
    payload: Record<string, string> = {},
  ): Promise<void> {
    await this.deliver(
      tx,
      recipients.map((r) => ({ userId: r.userId, locale: r.locale, email: null, phone: null })),
      eventKey,
      variables,
      link,
      payload,
      ["IN_APP"],
    );
  }

  /** An email to an address with no account (the broker's customer, a code). */
  async sendEmail(
    to: string,
    eventKey: string,
    variables: TemplateVariables,
    ids: Record<string, string>,
    locale: "it" | "sq" = "it",
  ): Promise<void> {
    const texts = asRenderable(await this.store.get());
    try {
      await this.email.send({
        to,
        ...renderEmail(texts, eventKey, locale, variables, this.#labels),
      });
    } catch (error) {
      this.logger.error({ eventKey, ...ids, err: errorForLog(error) }, "email not sent");
      throw error;
    }
  }

  async sendSms(
    to: string,
    eventKey: string,
    variables: TemplateVariables,
    ids: Record<string, string>,
  ): Promise<void> {
    const texts = asRenderable(await this.store.get());
    try {
      await this.sms.send({ to, text: renderSms(texts, eventKey, variables) });
    } catch (error) {
      this.logger.error({ eventKey, ...ids, err: errorForLog(error) }, "sms not sent");
      throw error;
    }
  }
}
