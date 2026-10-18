import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { EmailSender } from "@astax/adapters/email";
import type { SmsPort } from "@astax/adapters/sms";
import type { PushSubscriptionData, WebPushPort } from "@astax/adapters/web-push";
import {
  asRenderable,
  asSystem,
  markMessageSent,
  planDispatch,
  queueMessage,
  type DbClient,
  type QueuedMessage,
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
  DB,
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

/**
 * A message to send after the commit (a rolled back change sends nothing).
 * Phase 8: it is also queued in MessageOutbox in the same transaction
 * (`outboxId`), so the worker sends it if this process stops first.
 */
export type Outbound = { outboxId?: string } & (
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
    }
);

function queued(o: Outbound): QueuedMessage {
  if (o.channel === "EMAIL")
    return { channel: "EMAIL", email: { to: o.to, subject: o.subject, text: o.text } };
  if (o.channel === "SMS") return { channel: "SMS", sms: { to: o.to, text: o.text } };
  return { channel: "PUSH", subscription: o.subscription, push: o.message };
}

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
    @Inject(DB) private readonly db: DbClient,
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
    variables: (locale: "it" | "sq", userId: string) => TemplateVariables,
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
            ...renderInApp(texts, eventKey, u.locale, variables(u.locale, u.userId), this.#labels),
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
        ...renderEmail(texts, eventKey, u.locale, variables(u.locale, u.userId), this.#labels),
        eventKey,
        ids: payload,
      });
    }
    for (const u of plan.sms) {
      out.push({
        channel: "SMS",
        to: u.phone ?? "",
        text: renderSms(texts, eventKey, variables(u.locale, u.userId), u.locale),
        eventKey,
        ids: payload,
      });
    }
    for (const { user, subscriptions } of plan.push) {
      const message = {
        ...renderPush(
          texts,
          eventKey,
          user.locale,
          variables(user.locale, user.userId),
          this.#labels,
        ),
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
    const now = this.clock.now();
    for (const o of out) {
      o.outboxId = await queueMessage(tx, this.cipher, queued(o), { eventKey, ids: payload }, now);
    }
    return out;
  }

  /**
   * After the commit. A sent message is marked in MessageOutbox; a failed one
   * is logged and stays there for the worker to send again (phase 8).
   */
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
          o.outboxId ? "notification not sent, the worker will retry" : "notification not sent",
        );
        continue;
      }
      if (o.outboxId) {
        await markMessageSent(this.db, o.outboxId, this.clock.now()).catch((error: unknown) =>
          this.logger.warn(
            { eventKey: o.eventKey, err: errorForLog(error) },
            "sent message not marked",
          ),
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

  /**
   * Phase 8: an email to an address with no account, queued in the caller's
   * transaction and returned to send after the commit (like deliver).
   */
  async queueEmail(
    tx: DbTransaction,
    to: string,
    eventKey: string,
    variables: TemplateVariables,
    ids: Record<string, string>,
    locale: "it" | "sq" = "it",
  ): Promise<Outbound> {
    const texts = asRenderable(await this.store.get());
    const out: Outbound = {
      channel: "EMAIL",
      to,
      ...renderEmail(texts, eventKey, locale, variables, this.#labels),
      eventKey,
      ids,
    };
    out.outboxId = await queueMessage(
      tx,
      this.cipher,
      queued(out),
      { eventKey, ids },
      this.clock.now(),
    );
    return out;
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
