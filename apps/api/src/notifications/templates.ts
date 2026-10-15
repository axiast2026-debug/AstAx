import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "@astax/shared/env";
import { parse } from "yaml";
import { z } from "zod";

const localized = z.looseObject({
  title: z.string().optional(),
  body: z.string().optional(),
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
  sms: z.string().optional(),
});
const fileSchema = z.object({
  schemaVersion: z.literal(1),
  events: z.record(
    z.string(),
    z.looseObject({
      variables: z.array(z.string()).default([]),
      it: localized,
      sq: localized.optional(),
    }),
  ),
});

export type NotificationTemplates = z.infer<typeof fileSchema>["events"];

/**
 * Texts of seed/notifiche.yaml. Phase 7 moves them to NotificationTemplate,
 * editable by the administrator; until then they are read from the file.
 */
export function loadNotificationTemplates(
  repoRoot: string = findRepoRoot(import.meta.dirname),
): NotificationTemplates {
  return fileSchema.parse(parse(readFileSync(join(repoRoot, "seed", "notifiche.yaml"), "utf8")))
    .events;
}

export class MissingTemplateVariableError extends Error {
  constructor(readonly variable: string) {
    super(`Missing template variable ${variable}`);
    this.name = "MissingTemplateVariableError";
  }
}

/** Replaces {{name}}; a missing variable is an error, never an empty hole in a message. */
export function render(template: string, variables: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined) throw new MissingTemplateVariableError(name);
    return value;
  });
}

export function renderEmail(
  templates: NotificationTemplates,
  eventKey: string,
  locale: "it" | "sq",
  variables: Readonly<Record<string, string>>,
): { subject: string; text: string } {
  const event = templates[eventKey];
  const texts = (locale === "sq" ? event?.sq : undefined) ?? event?.it;
  if (!texts?.emailSubject || !texts.emailBody) throw new Error(`No email text for ${eventKey}`);
  return {
    subject: render(texts.emailSubject, variables),
    text: render(texts.emailBody, variables).trim(),
  };
}
