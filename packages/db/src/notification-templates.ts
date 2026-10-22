import type { NotificationTemplates } from "@astax/shared/notifications";
import type { DbClient, DbTransaction } from "./client.js";
import { SYSTEM_CONTEXT, withContext } from "./context.js";
import type { NotificationChannel } from "./generated/prisma/client.js";

/** The texts of one event in one language (seed/notifiche.yaml). */
export interface TemplateTexts {
  title?: string;
  body?: string;
  emailSubject?: string;
  emailBody?: string;
  sms?: string;
}

/** An event as in force: the latest version of its template. */
export interface StoredTemplate {
  eventKey: string;
  version: number;
  recipients: string[];
  channels: NotificationChannel[];
  mandatory: boolean;
  forcePush: boolean;
  variables: string[];
  it: TemplateTexts;
}

const CHANNEL: Record<string, NotificationChannel> = {
  in_app: "IN_APP",
  email: "EMAIL",
  sms: "SMS",
  push: "PUSH",
};

/**
 * Phase 7: seed/notifiche.yaml in NotificationTemplate, as version 1 of each
 * event without one; an event already edited by the administrator is left as
 * it is. A system step: the caller runs it in the system context.
 */
export async function seedNotificationTemplates(
  tx: DbTransaction,
  events: NotificationTemplates,
): Promise<number> {
  let created = 0;
  for (const [eventKey, event] of Object.entries(events)) {
    const exists = await tx.notificationTemplate.findFirst({
      where: { eventKey },
      select: { id: true },
    });
    if (exists) continue;
    const raw = event as Record<string, unknown>;
    await tx.notificationTemplate.create({
      data: {
        eventKey,
        version: 1,
        recipients: (raw.recipients as string[] | undefined) ?? [],
        channels: ((raw.channels as string[] | undefined) ?? ["in_app"]).flatMap((c) =>
          CHANNEL[c] ? [CHANNEL[c]] : [],
        ),
        mandatory: raw.mandatory === true,
        forcePush: raw.forcePush === true,
        variables: event.variables,
        content: { it: event.it } as object,
        reason: "Valore iniziale da seed/notifiche.yaml",
      },
    });
    created += 1;
  }
  return created;
}

/** The templates in force: the latest version of every event. */
export async function loadStoredTemplates(tx: DbTransaction): Promise<Map<string, StoredTemplate>> {
  const rows = await tx.notificationTemplate.findMany({
    orderBy: [{ eventKey: "asc" }, { version: "asc" }],
  });
  const out = new Map<string, StoredTemplate>();
  for (const r of rows) {
    const content = r.content as unknown as { it: TemplateTexts };
    out.set(r.eventKey, {
      eventKey: r.eventKey,
      version: r.version,
      recipients: r.recipients,
      channels: r.channels,
      mandatory: r.mandatory,
      forcePush: r.forcePush,
      variables: r.variables,
      it: content.it,
    });
  }
  return out;
}

/** The templates of the file (seed/notifiche.yaml), as if stored: before the seed, in tests. */
export function templatesFromFile(events: NotificationTemplates): Map<string, StoredTemplate> {
  return new Map(
    Object.entries(events).map(([eventKey, e]) => {
      const raw = e as Record<string, unknown>;
      return [
        eventKey,
        {
          eventKey,
          version: 0,
          recipients: (raw.recipients as string[] | undefined) ?? [],
          channels: ((raw.channels as string[] | undefined) ?? ["in_app"]).flatMap((c) =>
            CHANNEL[c] ? [CHANNEL[c]] : [],
          ),
          mandatory: raw.mandatory === true,
          forcePush: raw.forcePush === true,
          variables: e.variables,
          it: e.it,
        },
      ];
    }),
  );
}

/** The templates in the shape of the rendering engine (@astax/shared/notifications). */
export function asRenderable(stored: Map<string, StoredTemplate>): NotificationTemplates {
  return Object.fromEntries(
    [...stored.values()].map((t) => [t.eventKey, { variables: t.variables, it: t.it }]),
  ) as NotificationTemplates;
}

/**
 * The templates in force, read again at most every `ttlMs`: an edit of the
 * administrator reaches the API and the worker within that time, without
 * reading the table at every notification. Falls back to `fallback` (the
 * file) while the table is empty, as before the seed.
 */
export class TemplateStore {
  #cached: { at: number; templates: Map<string, StoredTemplate> } | null = null;

  constructor(
    private readonly db: DbClient,
    private readonly now: () => number,
    private readonly fallback: () => NotificationTemplates,
    private readonly ttlMs = 30_000,
  ) {}

  async get(): Promise<Map<string, StoredTemplate>> {
    const now = this.now();
    if (this.#cached && now - this.#cached.at < this.ttlMs) return this.#cached.templates;
    let templates = await withContext(this.db, SYSTEM_CONTEXT, (tx) => loadStoredTemplates(tx));
    if (templates.size === 0) templates = templatesFromFile(this.fallback());
    this.#cached = { at: now, templates };
    return templates;
  }

  /** After an edit in this process: read again at the next notification. */
  invalidate(): void {
    this.#cached = null;
  }
}
