import { randomUUID } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import {
  asSystem,
  withContext,
  type DbClient,
  type StoredTemplate,
  type TemplateTexts,
} from "@astax/db";
import {
  MissingTemplateVariableError,
  render,
  type TemplateVariables,
} from "@astax/shared/notifications";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB, FIELD_CIPHER } from "../infra/tokens.js";
import { NotificationService } from "./notification.service.js";

const FIELDS = ["title", "body", "emailSubject", "emailBody", "sms"] as const;
export type CommunicationGroup = "PRIVATE" | "AGENCY" | "BROKER" | "STAFF";

/** Sample values for the preview: the variable's name, so the admin sees where it goes. */
const samples = (variables: readonly string[]): TemplateVariables =>
  Object.fromEntries(variables.map((v) => [v, `«${v}»`]));

/**
 * Spec 07 «Comunicazioni»: the texts of the notifications edited with a new
 * version and a reason (the API and the worker use it within 30 seconds), the
 * preview in Italian and Albanian with sample values, a test sent to oneself,
 * and the messages to a group of users. Every change is in the audit log.
 */
@Injectable()
export class CommunicationsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  private view(t: StoredTemplate) {
    return {
      eventKey: t.eventKey,
      version: t.version,
      recipients: t.recipients,
      channels: t.channels,
      mandatory: t.mandatory,
      forcePush: t.forcePush,
      variables: t.variables,
      it: t.it,
    };
  }

  async list() {
    const all = await this.notifications.templates();
    return [...all.values()].map((t) => this.view(t));
  }

  private async template(eventKey: string) {
    const t = (await this.notifications.templates()).get(eventKey);
    if (!t) throw new ProblemError("NOT_FOUND");
    return t;
  }

  async history(auth: AuthContext, eventKey: string) {
    await this.template(eventKey);
    return withContext(this.db, auth.db, async (tx) =>
      (
        await tx.notificationTemplate.findMany({
          where: { eventKey },
          orderBy: { version: "desc" },
        })
      ).map((r) => ({
        version: r.version,
        content: r.content,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  }

  /** Each text of each channel present, with only the event's variables. */
  private check(t: StoredTemplate, texts: TemplateTexts) {
    const issues: { path: string; issue: string }[] = [];
    const needs: Record<string, readonly (typeof FIELDS)[number][]> = {
      IN_APP: ["title", "body"],
      PUSH: ["title", "body"],
      EMAIL: ["emailSubject", "emailBody"],
      SMS: ["sms"],
    };
    for (const channel of t.channels) {
      for (const field of needs[channel] ?? []) {
        if (!texts[field]?.trim()) {
          issues.push({ path: `it.${field}`, issue: "REQUIRED" });
        }
      }
    }
    for (const field of FIELDS) {
      const text = texts[field];
      if (!text) continue;
      for (const m of text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) {
        if (!t.variables.includes(m[1] ?? "")) {
          issues.push({ path: `it.${field}`, issue: `UNKNOWN_VARIABLE:${m[1]}` });
        }
      }
    }
    return issues;
  }

  async update(auth: AuthContext, eventKey: string, input: { it: TemplateTexts; reason: string }) {
    const t = await this.template(eventKey);
    const issues = this.check(t, input.it);
    if (issues.length > 0) throw new ProblemError("VALIDATION_FAILED", undefined, issues);
    const version = await withContext(this.db, auth.db, async (tx) => {
      const last = await tx.notificationTemplate.findFirst({
        where: { eventKey },
        orderBy: { version: "desc" },
      });
      const next = (last?.version ?? 0) + 1;
      await asSystem(tx, () =>
        tx.notificationTemplate.create({
          data: {
            eventKey,
            version: next,
            recipients: t.recipients,
            channels: t.channels,
            mandatory: t.mandatory,
            forcePush: t.forcePush,
            variables: t.variables,
            content: { it: input.it } as object,
            reason: input.reason,
            changedByUserId: auth.userId,
            createdAt: this.clock.now(),
          },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "NOTIFICATION_TEMPLATE_CHANGED",
        targetType: "NotificationTemplate",
        targetId: eventKey,
        before: { version: t.version, content: { it: t.it } },
        after: { version: next, content: { it: input.it } },
        reason: input.reason,
      });
      return next;
    });
    this.notifications.invalidateTemplates();
    return { eventKey, version };
  }

  /** The texts (saved or being edited) rendered with sample values. */
  async preview(eventKey: string, texts?: TemplateTexts) {
    const t = await this.template(eventKey);
    const source = texts ?? t.it;
    const vars = samples(t.variables);
    const out: Record<string, string> = {};
    for (const field of FIELDS) {
      const text = source[field];
      if (!text) continue;
      try {
        out[field] = render(text, vars);
      } catch (error) {
        if (error instanceof MissingTemplateVariableError) {
          throw new ProblemError("VALIDATION_FAILED", undefined, [
            { path: field, issue: `UNKNOWN_VARIABLE:${error.variable}` },
          ]);
        }
        throw error;
      }
    }
    return out;
  }

  /** The event sent to oneself with sample values, on its channels. */
  async test(auth: AuthContext, eventKey: string) {
    const t = await this.template(eventKey);
    const out = await withContext(this.db, auth.db, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: auth.userId } });
      const outbound = await this.notifications.deliver(
        tx,
        [
          {
            userId: user.id,
            email: user.emailEnc ? this.cipher.decrypt(user.emailEnc) : null,
            phone: user.phoneEnc ? this.cipher.decrypt(user.phoneEnc) : null,
          },
        ],
        eventKey,
        () => samples(t.variables),
        "/notifiche",
        // A new identifier: a test is never a duplicate of the previous one.
        { test: randomUUID() },
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "NOTIFICATION_TEST_SENT",
        targetType: "NotificationTemplate",
        targetId: eventKey,
        after: { channels: outbound.map((o) => o.channel) },
      });
      return outbound;
    });
    await this.notifications.send(out);
    return { sent: out.map((o) => o.channel) };
  }

  /** A message to every active user of a group, in the app and by email. */
  async broadcast(
    auth: AuthContext,
    input: { group: CommunicationGroup; title: string; text: string; reason: string },
  ) {
    const id = randomUUID();
    const out = await withContext(
      this.db,
      auth.db,
      async (tx) => {
        const users = await asSystem(tx, () =>
          input.group === "PRIVATE"
            ? tx.user.findMany({ where: { kind: "PRIVATE", status: "ACTIVE" } })
            : tx.user.findMany({
                where: {
                  status: "ACTIVE",
                  memberships: {
                    some: {
                      status: "ACTIVE",
                      organization: {
                        type: input.group === "STAFF" ? "ASTAX" : input.group,
                      },
                    },
                  },
                },
              }),
        );
        const outbound = await this.notifications.deliver(
          tx,
          users.map((u) => ({
            userId: u.id,
            email: u.emailEnc ? this.cipher.decrypt(u.emailEnc) : null,
            phone: null,
          })),
          "communication.message",
          () => ({ titolo: input.title, testo: input.text }),
          "/notifiche",
          { communicationId: id },
        );
        await this.audit.inTransaction(tx, actorOf(auth), {
          action: "COMMUNICATION_SENT",
          targetType: "Communication",
          targetId: id,
          after: { group: input.group, recipients: users.length },
          reason: input.reason,
        });
        return { outbound, recipients: users.length };
      },
      { timeoutMs: 60_000 },
    );
    await this.notifications.send(out.outbound);
    return { id, recipients: out.recipients };
  }
}
