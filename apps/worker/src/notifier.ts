import type { EmailSender } from "@astax/adapters/email";
import { asSystem, type DbTransaction } from "@astax/db";
import { errorForLog, type Logger } from "@astax/shared/logging";
import {
  label,
  loadNotificationLabels,
  loadNotificationTemplates,
  type NotificationLabels,
  renderEmail,
  renderInApp,
  type NotificationTemplates,
} from "@astax/shared/notifications";

export interface Recipient {
  userId: string;
  locale: "it" | "sq";
  /** Decrypted only to send; never logged (rule 8). */
  email: string | null;
}

interface PendingEmail {
  to: string;
  eventKey: string;
  variables: Record<string, string>;
  locale: "it" | "sq";
  ids: Record<string, string>;
}

/**
 * Notifications of seed/notifiche.yaml sent by the worker. In-app rows join the
 * activity's transaction; emails wait in `pending` and go out after the commit,
 * so that a rolled back activity sends nothing. A failed email is logged with
 * identifiers only and does not undo the activity.
 */
export class WorkerNotifier {
  readonly #templates: NotificationTemplates;
  readonly #labels: NotificationLabels = loadNotificationLabels();

  constructor(
    private readonly email: EmailSender,
    private readonly logger: Logger,
    templates?: NotificationTemplates,
  ) {
    this.#templates = templates ?? loadNotificationTemplates();
  }

  /** A label of seed/notifiche.yaml in the recipient's language (no text in the code). */
  label(key: string, locale: "it" | "sq"): string {
    return label(this.#labels, key, locale);
  }

  hasEmail(eventKey: string): boolean {
    return Boolean(this.#templates[eventKey]?.it.emailSubject);
  }

  /** Rendered texts, for the tests on what agencies receive. */
  render(eventKey: string, locale: "it" | "sq", variables: Record<string, string>) {
    return {
      inApp: renderInApp(this.#templates, eventKey, locale, variables),
      email: this.hasEmail(eventKey)
        ? renderEmail(this.#templates, eventKey, locale, variables)
        : null,
    };
  }

  async notify(
    tx: DbTransaction,
    pending: PendingEmail[],
    recipients: readonly Recipient[],
    eventKey: string,
    variables: (locale: "it" | "sq") => Record<string, string>,
    link: string | null,
    ids: Record<string, string>,
  ): Promise<void> {
    if (recipients.length === 0) return;
    await asSystem(tx, () =>
      tx.notification.createMany({
        data: recipients.map((r) => ({
          userId: r.userId,
          eventKey,
          ...renderInApp(this.#templates, eventKey, r.locale, variables(r.locale)),
          link,
          payload: ids,
        })),
      }),
    );
    if (!this.hasEmail(eventKey)) return;
    for (const r of recipients) {
      if (r.email) {
        pending.push({
          to: r.email,
          eventKey,
          variables: variables(r.locale),
          locale: r.locale,
          ids,
        });
      }
    }
  }

  async flush(pending: readonly PendingEmail[]): Promise<void> {
    for (const p of pending) {
      try {
        await this.email.send({
          to: p.to,
          ...renderEmail(this.#templates, p.eventKey, p.locale, p.variables),
        });
      } catch (error) {
        this.logger.error(
          { eventKey: p.eventKey, ...p.ids, err: errorForLog(error) },
          "email not sent",
        );
      }
    }
  }
}

export type { PendingEmail };
