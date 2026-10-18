import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { EmailSender } from "@astax/adapters/email";
import type { PushMessage, PushSubscriptionData, WebPushPort } from "@astax/adapters/web-push";
import {
  asRenderable,
  asSystem,
  markMessageSent,
  planDispatch,
  queueMessage,
  TemplateStore,
  templatesFromFile,
  type DbClient,
  type DbTransaction,
  type StoredTemplate,
} from "@astax/db";
import { errorForLog, type Logger } from "@astax/shared/logging";
import {
  label,
  loadNotificationLabels,
  loadNotificationTemplates,
  type NotificationLabels,
  renderEmail,
  renderInApp,
  renderPush,
  type NotificationTemplates,
  type TemplateVariables,
} from "@astax/shared/notifications";

export interface Recipient {
  userId: string;
  locale: "it" | "sq";
  /** Decrypted only to send; never logged (rule 8). */
  email: string | null;
}

/** An email to send after the commit (also to an address with no account). */
interface PendingMail {
  kind?: "email";
  to: string;
  eventKey: string;
  variables: TemplateVariables;
  locale: "it" | "sq";
  ids: Record<string, string>;
  /** Phase 8: the row of MessageOutbox written in the activity's transaction. */
  outboxId?: string;
}

interface PendingPush {
  kind: "push";
  subscription: PushSubscriptionData;
  message: PushMessage;
  eventKey: string;
  ids: Record<string, string>;
  outboxId?: string;
}

type PendingEmail = PendingMail | PendingPush;

/**
 * Notifications sent by the worker (docs/notifiche.md). The texts in force
 * come from NotificationTemplate (phase 7; the file before the seed and in
 * tests); who gets which channel is decided by planDispatch (choices,
 * mandatory, forcePush, no duplicates). In-app rows join the activity's
 * transaction; emails and pushes wait in `pending` and go out after the
 * commit, so that a rolled back activity sends nothing. A failed send is
 * logged with identifiers only and does not undo the activity.
 */
export class WorkerNotifier {
  readonly #file: NotificationTemplates;
  readonly #labels: NotificationLabels = loadNotificationLabels();
  readonly #store: TemplateStore | null;

  constructor(
    private readonly email: EmailSender,
    private readonly logger: Logger,
    private readonly options: {
      templates?: NotificationTemplates;
      db?: DbClient;
      clock?: Clock;
      cipher?: FieldCipher;
      push?: WebPushPort;
    } = {},
  ) {
    this.#file = options.templates ?? loadNotificationTemplates();
    this.#store =
      options.db && options.clock
        ? new TemplateStore(
            options.db,
            () => options.clock?.now().getTime() ?? 0,
            () => this.#file,
          )
        : null;
  }

  private async stored(): Promise<Map<string, StoredTemplate>> {
    return this.#store ? this.#store.get() : templatesFromFile(this.#file);
  }

  /** A label of seed/notifiche.yaml in the recipient's language (no text in the code). */
  label(key: string, locale: "it" | "sq"): string {
    return label(this.#labels, key, locale);
  }

  hasEmail(eventKey: string): boolean {
    return Boolean(this.#file[eventKey]?.it.emailSubject);
  }

  /** Rendered texts of the file, for the tests on what agencies receive. */
  render(eventKey: string, locale: "it" | "sq", variables: TemplateVariables) {
    return {
      inApp: renderInApp(this.#file, eventKey, locale, variables, this.#labels),
      email: this.hasEmail(eventKey)
        ? renderEmail(this.#file, eventKey, locale, variables, this.#labels)
        : null,
    };
  }

  async notify(
    tx: DbTransaction,
    pending: PendingEmail[],
    recipients: readonly Recipient[],
    eventKey: string,
    variables: (locale: "it" | "sq") => TemplateVariables,
    link: string | null,
    ids: Record<string, string>,
  ): Promise<void> {
    if (recipients.length === 0) return;
    const stored = await this.stored();
    const template = stored.get(eventKey);
    if (!template) throw new Error(`No template for ${eventKey}`);
    const texts = asRenderable(stored);
    const now = this.options.clock?.now() ?? new Date(0);
    const plan = await asSystem(tx, () =>
      planDispatch(
        tx,
        template,
        recipients.map((r) => ({
          userId: r.userId,
          locale: r.locale,
          email: r.email,
          phone: null,
        })),
        ids,
        { now },
      ),
    );
    if (plan.inApp.length > 0) {
      await asSystem(tx, () =>
        tx.notification.createMany({
          data: plan.inApp.map((r) => ({
            userId: r.userId,
            eventKey,
            ...renderInApp(texts, eventKey, r.locale, variables(r.locale), this.#labels),
            link,
            payload: ids,
          })),
        }),
      );
    }
    for (const r of plan.email) {
      await this.queueEmail(tx, pending, {
        to: r.email ?? "",
        eventKey,
        variables: variables(r.locale),
        locale: r.locale,
        ids,
      });
    }
    const cipher = this.options.cipher;
    if (!cipher) return;
    for (const { user, subscriptions } of plan.push) {
      const message = {
        ...renderPush(texts, eventKey, user.locale, variables(user.locale), this.#labels),
        url: link ?? "/notifiche",
      };
      for (const enc of subscriptions) {
        const subscription = JSON.parse(cipher.decrypt(enc)) as PushSubscriptionData;
        pending.push({
          kind: "push",
          subscription,
          message,
          eventKey,
          ids,
          outboxId: await queueMessage(
            tx,
            cipher,
            { channel: "PUSH", subscription, push: message },
            { eventKey, ids },
            now,
          ),
        });
      }
    }
  }

  /**
   * An email to send after the commit, also to an address with no account.
   * Phase 8: with a database and a cipher it is queued in MessageOutbox in the
   * same transaction, so the worker sends it even if this process stops first.
   */
  async queueEmail(
    tx: DbTransaction,
    pending: PendingEmail[],
    mail: Omit<PendingMail, "kind" | "outboxId">,
  ) {
    const { cipher, clock } = this.options;
    let outboxId: string | undefined;
    if (cipher && clock && this.options.db) {
      const texts = asRenderable(await this.stored());
      outboxId = await queueMessage(
        tx,
        cipher,
        {
          channel: "EMAIL",
          email: {
            to: mail.to,
            ...renderEmail(texts, mail.eventKey, mail.locale, mail.variables, this.#labels),
          },
        },
        { eventKey: mail.eventKey, ids: mail.ids },
        clock.now(),
      );
    }
    pending.push({ ...mail, ...(outboxId ? { outboxId } : {}) });
  }

  async flush(pending: readonly PendingEmail[]): Promise<void> {
    const texts = asRenderable(await this.stored());
    for (const p of pending) {
      try {
        if (p.kind === "push") {
          await this.options.push?.send(p.subscription, p.message);
        } else {
          await this.email.send({
            to: p.to,
            ...renderEmail(texts, p.eventKey, p.locale, p.variables, this.#labels),
          });
        }
      } catch (error) {
        this.logger.error(
          { eventKey: p.eventKey, ...p.ids, err: errorForLog(error) },
          p.outboxId ? "notification not sent, will retry" : "notification not sent",
        );
        continue;
      }
      const { db, clock } = this.options;
      if (p.outboxId && db && clock) {
        await markMessageSent(db, p.outboxId, clock.now()).catch((error: unknown) =>
          this.logger.warn(
            { eventKey: p.eventKey, err: errorForLog(error) },
            "sent message not marked",
          ),
        );
      }
    }
  }
}

export type { PendingEmail };
